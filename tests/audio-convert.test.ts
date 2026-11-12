import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ALL_FORMATS, BufferSource, Input } from 'mediabunny';
import { ConvertError, cleanTags, codecName, convertAudio } from '../src/tools/audio-convert/lib/convert.ts';
import type { Settings } from '../src/tools/audio-convert/types.ts';

/** 一段 16 位立体声 WAV：左声道 440 Hz，右声道 660 Hz。 */
function wav(seconds = 2, sampleRate = 44100) {
  const frames = Math.round(seconds * sampleRate), buffer = Buffer.alloc(44 + frames * 4);
  buffer.write('RIFF', 0); buffer.writeUInt32LE(36 + frames * 4, 4); buffer.write('WAVEfmt ', 8); buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); buffer.writeUInt16LE(2, 22); buffer.writeUInt32LE(sampleRate, 24); buffer.writeUInt32LE(sampleRate * 4, 28);
  buffer.writeUInt16LE(4, 32); buffer.writeUInt16LE(16, 34); buffer.write('data', 36); buffer.writeUInt32LE(frames * 4, 40);
  for (let i = 0; i < frames; i++) {
    buffer.writeInt16LE(Math.round(Math.sin(2 * Math.PI * 440 * i / sampleRate) * 12000), 44 + i * 4);
    buffer.writeInt16LE(Math.round(Math.sin(2 * Math.PI * 660 * i / sampleRate) * 12000), 46 + i * 4);
  }
  return new Blob([buffer], { type: 'audio/wav' });
}

async function inspect(buffer: ArrayBuffer) {
  const input = new Input({ source: new BufferSource(buffer), formats: ALL_FORMATS });
  try {
    const track = await input.getPrimaryAudioTrack();
    assert.ok(track);
    return { format: (await input.getFormat()).name, codec: await track.getCodec(), sampleRate: await track.getSampleRate(), channels: await track.getNumberOfChannels(), duration: await input.computeDuration() };
  } finally { input.dispose(); }
}

const base: Settings = { target: 'mp3', bitrate: 192, depth: 16 };

test('WAV 转成每一种格式，时长、采样率、声道数不变', async () => {
  const source = wav();
  const expected = { mp3: ['MP3', 'mp3', 'audio/mpeg'], wav: ['WAVE', 'pcm-s16', 'audio/wav'], flac: ['FLAC', 'flac', 'audio/flac'], m4a: ['MP4', 'aac', 'audio/mp4'] } as const;
  for (const target of ['mp3', 'wav', 'flac', 'm4a'] as const) {
    const progress: number[] = [];
    const { buffer, mime, info } = await convertAudio(source, { ...base, target }, value => progress.push(value));
    const out = await inspect(buffer);
    assert.equal(out.format, expected[target][0], target);
    assert.equal(out.codec, expected[target][1], target);
    assert.equal(mime, expected[target][2]);
    assert.equal(out.sampleRate, 44100); assert.equal(out.channels, 2);
    assert.ok(Math.abs(out.duration - 2) < 0.08, `${target} 时长 ${out.duration}`);
    assert.deepEqual({ ...info, duration: Math.round(info.duration) }, { duration: 2, sampleRate: 44100, channels: 2, sourceCodec: 'pcm-s16', hadVideo: false, copied: false });
    assert.ok(progress.length > 0 && progress.every(value => value >= 0 && value <= 1), target);
  }
});

test('码率越高文件越大', async () => {
  const source = wav(4);
  const low = await convertAudio(source, { ...base, bitrate: 128 }), high = await convertAudio(source, { ...base, bitrate: 320 });
  assert.ok(Math.abs(low.buffer.byteLength - 4 * 128000 / 8) < 6000, `128 kbps 的大小 ${low.buffer.byteLength}`);
  assert.ok(Math.abs(high.buffer.byteLength - 4 * 320000 / 8) < 6000, `320 kbps 的大小 ${high.buffer.byteLength}`);
});

test('WAV 可以选 24 位', async () => {
  const { buffer } = await convertAudio(wav(), { ...base, target: 'wav', depth: 24 });
  assert.equal((await inspect(buffer)).codec, 'pcm-s24');
  assert.ok(Math.abs(buffer.byteLength - 2 * 44100 * 6) < 200);
});

test('已经是 MP3 且码率不比选的高：原样取出，不重新编码', async () => {
  const mp3 = await convertAudio(wav(), { ...base, bitrate: 128 });
  const again = await convertAudio(new Blob([mp3.buffer]), { ...base, bitrate: 320 });
  assert.equal(again.info.copied, true);
  assert.equal(again.info.sourceCodec, 'mp3');
  assert.ok(Math.abs(again.buffer.byteLength - mp3.buffer.byteLength) < 2000);
});

test('FLAC 的位深跟着原文件：16 位进 16 位出，24 位进 24 位出', async () => {
  const bits = (buffer: ArrayBuffer) => { const bytes = new Uint8Array(buffer); return (((bytes[20] & 1) << 4) | (bytes[21] >> 4)) + 1; };
  const from16 = await convertAudio(wav(), { ...base, target: 'flac' });
  assert.equal(bits(from16.buffer), 16);
  const wav24 = await convertAudio(wav(), { ...base, target: 'wav', depth: 24 });
  const from24 = await convertAudio(new Blob([wav24.buffer]), { ...base, target: 'flac' });
  assert.equal(bits(from24.buffer), 24);
});

test('标签：通用的带过去，原始标签不带，UTF-8 乱码还原', () => {
  const cleaned = cleanTags({ title: 'Stranger', artist: 'sonn\u00c4\u00b1', album: 'caf\u00e9', trackNumber: 3, raw: { APIC: new Uint8Array(4) } });
  assert.deepEqual(cleaned, { title: 'Stranger', artist: 'sonn\u0131', album: 'caf\u00e9', trackNumber: 3 });
});

test('不是音频的文件给出看得懂的提示', async () => {
  await assert.rejects(convertAudio(new Blob([Buffer.from('hello, this is not audio')]), base), (error: unknown) => error instanceof ConvertError && /读不出来/.test(error.message));
});

test('编码名字', () => {
  assert.equal(codecName('aac'), 'AAC'); assert.equal(codecName('pcm-s24'), 'PCM'); assert.equal(codecName('opus'), 'Opus');
});
