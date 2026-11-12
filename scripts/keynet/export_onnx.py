# Builds public/models/keynet/keynet.onnx, the key detection model used by the 音频分析 tool.
#
# It packs the pretrained KeyNet from a1ex90/MusicalKeyCNN (MIT; architecture from Korzeniowski & Widmer 2018)
# together with its CQT front end into one ONNX graph:
#   audio [1, N] @ 44.1 kHz mono  ->  24 key probabilities (Camelot order: 1A..12A, then 1B..12B)
# The CQT kernels come from nnAudio's CQT1992v2 (MIT), which reproduces librosa.cqt, the transform used in training.
# Kernels are cropped to their non-zero span in groups of 12 bins so the file stays small; the output is unchanged.
#
# The network listens to the track five times, transposed by -2..+2 semitones, and the five answers are transposed
# back and averaged. A transposed view is just the same CQT read four bins (two semitones) wider on each side and
# cropped at a different bin, so it costs no extra audio processing. The model was trained with pitch shifts in this
# range. Averaging makes the answer steadier: without it, a track the model is unsure about can flip between two
# keys when the audio starts a few milliseconds later, which is what different MP3 decoders do.
#
# Usage:
#   pip install torch nnAudio onnx
#   git clone https://github.com/a1ex90/MusicalKeyCNN
#   python scripts/keynet/export_onnx.py MusicalKeyCNN/checkpoints/keynet.pt public/models/keynet/keynet.onnx
#
# Checked on 380 annotated tracks (GiantSteps key + GTZAN key): 67% exact key, 72% right scale (66% and 71% with a
# single view).
import os
import sys

import torch
import torch.nn as nn
import torch.nn.functional as F
from nnAudio.features.cqt import CQT1992v2

SR, HOP, BINS, BPO, FMIN, GROUP = 44100, 8820, 105, 24, 65, 12
# Views are transposed by -SHIFTS..+SHIFTS semitones; one semitone is two CQT bins.
SHIFTS = 2
PAD = SHIFTS * BPO // 12
# Output classes in Camelot order, as (tonic pitch class, is major).
CLASSES = [(t, False) for t in (8, 3, 10, 5, 0, 7, 2, 9, 4, 11, 6, 1)] + [(t, True) for t in (11, 6, 1, 8, 3, 10, 5, 0, 7, 2, 9, 4)]


class BasicConv2d(nn.Module):
    def __init__(self, cin, cout, k):
        super().__init__()
        self.conv = nn.Conv2d(cin, cout, k, padding='same', bias=False)
        self.bn = nn.BatchNorm2d(cout)
        self.elu = nn.ELU()

    def forward(self, x):
        return self.elu(self.bn(self.conv(x)))


class KeyNet(nn.Module):
    def __init__(self, num_classes=24, Nf=20):
        super().__init__()
        self.conv1 = BasicConv2d(1, Nf, 5)
        self.conv2 = BasicConv2d(Nf, Nf, 3)
        self.conv3 = BasicConv2d(Nf, 2 * Nf, 3)
        self.conv4 = BasicConv2d(2 * Nf, 2 * Nf, 3)
        self.conv5 = BasicConv2d(2 * Nf, 4 * Nf, 3)
        self.conv6 = BasicConv2d(4 * Nf, 4 * Nf, 3)
        self.conv7 = BasicConv2d(4 * Nf, 8 * Nf, 3)
        self.conv8 = BasicConv2d(8 * Nf, 8 * Nf, 3)
        self.conv9 = BasicConv2d(8 * Nf, num_classes, 1)
        self.pool = nn.MaxPool2d(2)

    def forward(self, x):
        x = self.pool(self.conv2(self.conv1(x)))
        x = self.pool(self.conv4(self.conv3(x)))
        x = self.pool(self.conv6(self.conv5(x)))
        x = self.conv9(self.conv8(self.conv7(x)))
        return x.mean(dim=(2, 3))


class KeyFromAudio(nn.Module):
    def __init__(self, checkpoint):
        super().__init__()
        cqt = CQT1992v2(sr=SR, hop_length=HOP, fmin=FMIN * 2 ** (-PAD / BPO), n_bins=BINS + 2 * PAD, bins_per_octave=BPO,
                        pad_mode='constant', verbose=False)
        scale = torch.sqrt(cqt.lenghts.view(-1, 1, 1))
        real, imag = cqt.cqt_kernels_real * scale, cqt.cqt_kernels_imag * scale
        centre = real.shape[-1] // 2
        self.halves = []
        for g, start in enumerate(range(0, BINS + 2 * PAD, GROUP)):
            r, i = real[start:start + GROUP], imag[start:start + GROUP]
            used = ((r.abs() + i.abs()).sum(dim=(0, 1)) > 0).nonzero().flatten()
            half = int(max(centre - used.min(), used.max() + 1 - centre))
            self.halves.append(half)
            self.register_buffer(f'kernels{g}', torch.cat([r, i])[:, :, centre - half:centre + half].contiguous())
        self.net = KeyNet()
        self.net.load_state_dict(torch.load(checkpoint, map_location='cpu', weights_only=True))
        # A view cropped at bin 2 * v shows the music (v - SHIFTS) semitones lower, so its answer for key K is really
        # about the key (v - SHIFTS) semitones above K. `back` moves each view's probabilities to the right classes.
        index = {key: i for i, key in enumerate(CLASSES)}
        self.register_buffer('back', torch.tensor([[index[((tonic - (v - SHIFTS)) % 12, major)] for tonic, major in CLASSES]
                                                   for v in range(2 * SHIFTS + 1)]))

    def spectrogram(self, audio):
        x = audio[:, None, :]
        parts = []
        for g, half in enumerate(self.halves):
            out = F.conv1d(F.pad(x, (half, half)), getattr(self, f'kernels{g}'), stride=HOP)
            n = out.shape[1] // 2
            parts.append(torch.sqrt(out[:, :n] ** 2 + out[:, n:] ** 2))
        # The reference pipeline drops the last two frames (predict_keys.py: spec[:, 0:-2]).
        return torch.log1p(torch.cat(parts, dim=1))[:, :, :-2]

    def forward(self, audio):
        spec = self.spectrogram(audio)[0]
        views = torch.stack([spec[2 * v:2 * v + BINS] for v in range(2 * SHIFTS + 1)])
        probs = torch.softmax(self.net(views[:, None]), dim=1)
        return torch.gather(probs, 1, self.back).mean(dim=0)


if __name__ == '__main__':
    checkpoint, out_path = sys.argv[1:3]
    model = KeyFromAudio(checkpoint).eval()
    example = torch.randn(1, SR * 20)
    torch.onnx.export(model, (example,), out_path, input_names=['audio'], output_names=['probs'],
                      dynamic_axes={'audio': {1: 'samples'}}, opset_version=17, dynamo=False)
    print('saved', out_path, os.path.getsize(out_path), 'bytes; kernel half-widths', model.halves)
