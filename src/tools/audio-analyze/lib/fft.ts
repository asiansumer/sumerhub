/** 生成一个固定长度（2 的幂）的原地 FFT。 */
export function createFft(size: number) {
  const bits = Math.log2(size);
  if (!Number.isInteger(bits)) throw new Error('FFT size must be a power of two');
  const reverse = new Uint32Array(size), cos = new Float64Array(size / 2), sin = new Float64Array(size / 2);
  for (let i = 0; i < size; i++) {
    let r = 0;
    for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b);
    reverse[i] = r;
  }
  for (let i = 0; i < size / 2; i++) { cos[i] = Math.cos(2 * Math.PI * i / size); sin[i] = Math.sin(2 * Math.PI * i / size); }

  return function fft(re: Float64Array, im: Float64Array, inverse = false) {
    for (let i = 0; i < size; i++) {
      const j = reverse[i];
      if (j > i) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
    }
    for (let half = 1; half < size; half <<= 1) {
      const step = size / (half << 1);
      for (let start = 0; start < size; start += half << 1) {
        for (let k = 0; k < half; k++) {
          const wr = cos[k * step], wi = inverse ? sin[k * step] : -sin[k * step];
          const a = start + k, b = a + half;
          const xr = re[b] * wr - im[b] * wi, xi = re[b] * wi + im[b] * wr;
          re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi;
        }
      }
    }
    if (inverse) for (let i = 0; i < size; i++) { re[i] /= size; im[i] /= size; }
  };
}

export function hann(size: number) {
  const window = new Float64Array(size);
  for (let i = 0; i < size; i++) window[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / size);
  return window;
}

/** 降到大约 11 kHz，节拍和调性都用不到更高的频率。 */
export function decimate(samples: Float32Array, sampleRate: number, target = 11025) {
  const factor = Math.max(1, Math.round(sampleRate / target));
  if (factor === 1) return { samples, sampleRate };
  const length = Math.floor(samples.length / factor), output = new Float32Array(length);
  for (let i = 0, n = 0; i < length; i++) {
    let sum = 0;
    for (let k = 0; k < factor; k++) sum += samples[n++];
    output[i] = sum / factor;
  }
  return { samples: output, sampleRate: sampleRate / factor };
}
