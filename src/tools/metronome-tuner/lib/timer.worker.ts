// 节拍器的计时线程，照搬 cwilso/metronome 的 metronomeworker.js：
// 主线程在后台标签页里 setInterval 会被降频，放在 worker 里能稳定地每 25 ms 叫醒一次调度。
let timer: ReturnType<typeof setInterval> | undefined;
let interval = 25;

self.onmessage = ({ data }: MessageEvent<'start' | 'stop' | { interval: number }>) => {
  if (data === 'start') {
    clearInterval(timer);
    timer = setInterval(() => postMessage('tick'), interval);
  } else if (data === 'stop') {
    clearInterval(timer);
    timer = undefined;
  } else if (typeof data === 'object') {
    interval = data.interval;
    if (timer !== undefined) { clearInterval(timer); timer = setInterval(() => postMessage('tick'), interval); }
  }
};
