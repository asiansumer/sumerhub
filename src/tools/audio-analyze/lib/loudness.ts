import { ebur128_integrated_mono, ebur128_integrated_stereo, ebur128_true_peak_mono, ebur128_true_peak_stereo } from 'ebur128-wasm/ebur128_wasm.js';

export type Loudness = {
  /** 整体响度，LUFS。静音时为 null。 */
  lufs: number | null;
  /** 真峰值，dBTP。静音时为 null。 */
  peak: number | null;
};

const round = (value: number) => Math.round(value * 10) / 10;

/**
 * 响度和真峰值用 ebur128-wasm 测量（Apache-2.0）：它是 Rust 的 ebur128 库编译成的 WebAssembly，
 * 按 EBU R128 / ITU-R BS.1770 实现，和 ffmpeg 的读数一致。
 */
export function measureLoudness(channels: Float32Array[], sampleRate: number): Loudness {
  const [left, right] = channels;
  if (!left?.length) return { lufs: null, peak: null };
  const lufs = right ? ebur128_integrated_stereo(sampleRate, left, right) : ebur128_integrated_mono(sampleRate, left);
  const peak = right ? ebur128_true_peak_stereo(sampleRate, left, right) : ebur128_true_peak_mono(sampleRate, left);
  return {
    lufs: Number.isFinite(lufs) && lufs > -70 ? round(lufs) : null,
    // 库直接返回 dBTP；静音时是负无穷。
    peak: Number.isFinite(peak) && peak > -120 ? round(peak) : null,
  };
}
