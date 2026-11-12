# Builds public/models/keynet/keynet.onnx, the key detection model used by the 音频分析 tool.
#
# It packs the pretrained KeyNet from a1ex90/MusicalKeyCNN (MIT; architecture from Korzeniowski & Widmer 2018)
# together with its CQT front end into one ONNX graph:
#   audio [1, N] @ 44.1 kHz mono  ->  24 key probabilities (Camelot order: 1A..12A, then 1B..12B)
# The CQT kernels come from nnAudio's CQT1992v2 (MIT), which reproduces librosa.cqt, the transform used in training.
# Kernels are cropped to their non-zero span in groups of 12 bins so the file stays small; the output is unchanged.
#
# Usage:
#   pip install torch nnAudio onnx
#   git clone https://github.com/a1ex90/MusicalKeyCNN
#   python scripts/keynet/export_onnx.py MusicalKeyCNN/checkpoints/keynet.pt public/models/keynet/keynet.onnx
#
# Checked on 380 annotated tracks (GiantSteps key + GTZAN key): 378 give the same key as the reference
# PyTorch + librosa pipeline, with the same accuracy.
import os
import sys

import torch
import torch.nn as nn
import torch.nn.functional as F
from nnAudio.features.cqt import CQT1992v2

SR, HOP, BINS, BPO, FMIN, GROUP = 44100, 8820, 105, 24, 65, 12


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
        cqt = CQT1992v2(sr=SR, hop_length=HOP, fmin=FMIN, n_bins=BINS, bins_per_octave=BPO, pad_mode='constant', verbose=False)
        scale = torch.sqrt(cqt.lenghts.view(-1, 1, 1))
        real, imag = cqt.cqt_kernels_real * scale, cqt.cqt_kernels_imag * scale
        centre = real.shape[-1] // 2
        self.halves = []
        for g, start in enumerate(range(0, BINS, GROUP)):
            r, i = real[start:start + GROUP], imag[start:start + GROUP]
            used = ((r.abs() + i.abs()).sum(dim=(0, 1)) > 0).nonzero().flatten()
            half = int(max(centre - used.min(), used.max() + 1 - centre))
            self.halves.append(half)
            self.register_buffer(f'kernels{g}', torch.cat([r, i])[:, :, centre - half:centre + half].contiguous())
        self.net = KeyNet()
        self.net.load_state_dict(torch.load(checkpoint, map_location='cpu', weights_only=True))

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
        return torch.softmax(self.net(self.spectrogram(audio)[:, None]), dim=1)[0]


if __name__ == '__main__':
    checkpoint, out_path = sys.argv[1:3]
    model = KeyFromAudio(checkpoint).eval()
    example = torch.randn(1, SR * 20)
    torch.onnx.export(model, (example,), out_path, input_names=['audio'], output_names=['probs'],
                      dynamic_axes={'audio': {1: 'samples'}}, opset_version=17, dynamo=False)
    print('saved', out_path, os.path.getsize(out_path), 'bytes; kernel half-widths', model.halves)
