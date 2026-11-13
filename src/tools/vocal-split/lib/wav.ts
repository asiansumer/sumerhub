/** 把左右声道的浮点采样写成 16 位 WAV。 */
export function encodeWav(left: Float32Array, right: Float32Array, sampleRate: number): Blob {
  const frames = left.length;
  const buffer = new ArrayBuffer(44 + frames * 4);
  const view = new DataView(buffer);
  const text = (offset: number, value: string) => { for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i)); };
  text(0, 'RIFF'); view.setUint32(4, 36 + frames * 4, true); text(8, 'WAVE');
  text(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 2, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 4, true); view.setUint16(32, 4, true); view.setUint16(34, 16, true);
  text(36, 'data'); view.setUint32(40, frames * 4, true);
  const pcm = new Int16Array(buffer, 44, frames * 2);
  for (let i = 0; i < frames; i++) {
    const l = Math.max(-1, Math.min(1, left[i])), r = Math.max(-1, Math.min(1, right[i]));
    pcm[2 * i] = Math.round(l < 0 ? l * 32768 : l * 32767);
    pcm[2 * i + 1] = Math.round(r < 0 ? r * 32768 : r * 32767);
  }
  return new Blob([buffer], { type: 'audio/wav' });
}
