'use client';

import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  PiArrowCounterClockwise, PiArrowDown, PiGearSix, PiMagnifyingGlassMinus, PiMagnifyingGlassPlus, PiMicrophoneFill, PiMicrophoneStage, PiPauseFill, PiPlayFill,
  PiSkipBackFill, PiSlidersHorizontal, PiTrash, PiWaveform, PiX,
} from 'react-icons/pi';
import {
  KeyboardShortcuts, Waveform, WaveformPlaylistProvider,
  usePlaybackAnimation, usePlaylistControls, usePlaylistData,
} from '@waveform-playlist/browser';
import { useExportWav } from '@waveform-playlist/browser/tone';
import { createClipFromSeconds, createTrack, type ClipTrack } from '@waveform-playlist/core';
import { getGlobalAudioContext } from '@waveform-playlist/playout';
import { useIntegratedRecording } from '@waveform-playlist/recording';
import { PlayheadWithMarker, SegmentedVUMeter } from '@waveform-playlist/ui-components';
import { saveUrl } from '@/lib/download';
import { useStored } from '@/lib/stored';
import type { Lyrics } from './lib/lyrics';
import { RATE } from './lib/source';
import LyricStage, { type Line, type StageRef } from './lyrics-stage';

export type StemBuffers = { instrumental: AudioBuffer; vocals: AudioBuffer };
type Props = {
  /** 导出文件名用的歌名。 */
  name: string;
  lyrics: Lyrics | null;
  /** 放进来的那首歌。分离完成之前先用它当伴奏练。 */
  original: AudioBuffer;
  /** 分离好的伴奏和原唱。还在分离时是 null。 */
  stems: StemBuffers | null;
  /** 放进来的文件本身就是伴奏，不用分离。 */
  plain: boolean;
  /** 分离出来的伴奏文件（WAV），给「导出」里的下载用。 */
  instrumental: Blob | null;
  /** 专辑封面（本站代取的地址），歌词背景按它的颜色流动。没匹配歌曲时是 null。 */
  cover: string | null;
  /** 还没匹配歌词时，放在歌词位置上的内容（找歌词的输入框）。 */
  empty?: ReactNode;
  /** 有没有录好的东西：离开之前提醒一下。 */
  onTake?: (has: boolean) => void;
};

// 轨道头的宽度：窄屏上只留名字、按钮和音量。
const HEAD_WIDTH = 224, HEAD_WIDTH_COMPACT = 124;
const WAVE_HEIGHT = 54;
// 片段的颜色：伴奏蓝，原唱青，自己的录音橙；正在录的是红的，静音的轨道发灰。
const REGION = { backing: '#4a7fd6', guide: '#3fa590', take: '#d98f3d', recording: '#e2504a', muted: '#55565c' };
// 配色照宿主软件的习惯：片段是一块带颜色的底，波形是压在上面的深色。
// 这个库在 normal 模式下把波形画在画布上（waveFillColor），底色由我们用 CSS 按轨道给（见 toolkit.css 的 --region）。
const WAVE = 'rgba(9, 11, 17, .62)';
// 电平表的颜色：绿、黄、红。
const METER = [{ dB: -1, color: '#ff453a' }, { dB: -6, color: '#ffd60a' }, { dB: -50, color: '#34c759' }];
const THEME = {
  waveformDrawMode: 'normal' as const,
  waveOutlineColor: 'transparent', waveFillColor: WAVE, waveProgressColor: 'transparent',
  selectedWaveOutlineColor: 'transparent', selectedWaveFillColor: WAVE,
  selectedTrackControlsBackground: '#3b3b3f', selectedTrackBackground: '#242426',
  timeColor: '#a2a2aa', timescaleBackgroundColor: '#2c2c2f',
  playheadColor: '#f4f4f6', selectionColor: 'rgba(255, 255, 255, .12)',
  clipHeaderBackgroundColor: 'rgba(255, 255, 255, .16)', clipHeaderBorderColor: 'transparent', clipHeaderTextColor: 'rgba(255, 255, 255, .94)', selectedClipHeaderBackgroundColor: 'rgba(255, 255, 255, .24)',
  backgroundColor: '#1d1d1f', surfaceColor: '#303033', borderColor: '#121213', textColor: '#e8e8ec', textColorMuted: '#a2a2aa',
  fontFamily: 'inherit', fontSize: '12px', fontSizeSmall: '11px', borderRadius: '5px',
};

const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
/** 控制条上的读数：分:秒.十分之一秒。 */
const precise = (seconds: number) => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(Math.floor(seconds % 60)).padStart(2, '0')}.${Math.floor(seconds * 10 % 10)}`;
const fullTrack = (name: string, audioBuffer: AudioBuffer, muted = false) =>
  createTrack({ name, clips: [createClipFromSeconds({ audioBuffer, startTime: 0, duration: audioBuffer.duration, offset: 0, name })], muted, soloed: false, volume: 1, pan: 0 });

/** 录音台：歌词舞台在上，走带和多轨在下。 */
export default function Studio({ name, lyrics, original, stems, plain, instrumental, cover, empty, onTake }: Props) {
  // 三条轨：伴奏（分离完成前是原曲）、原唱（分离完成后才有，默认静音）、我的录音。
  // 轨道和它们的 id 一起建一次（开发模式下初始化函数会跑两遍，分开建会对不上）。
  const [initial] = useState(() => {
    const take = createTrack({ name: '我的录音', clips: [], muted: false, soloed: false, volume: 1, pan: 0 });
    if (stems) {
      const backing = fullTrack('伴奏', stems.instrumental), guide = fullTrack('原唱', stems.vocals, true);
      return { tracks: [backing, guide, take], ids: { backing: backing.id, guide: guide.id as string | null, take: take.id, split: true } };
    }
    const backing = fullTrack(plain ? '伴奏' : '原曲', original);
    return { tracks: [backing, take], ids: { backing: backing.id, guide: null as string | null, take: take.id, split: false } };
  });
  const ids = useRef(initial.ids);
  const [tracks, setTracks] = useState<ClipTrack[]>(initial.tracks);

  // 分离完成：把「原曲」换成「伴奏」和「原唱」，已经录好的保留。正在录的时候先不换。
  const [recording, setRecording] = useState(false);
  useEffect(() => {
    if (!stems || ids.current.split || recording) return;
    const backing = fullTrack('伴奏', stems.instrumental), guide = fullTrack('原唱', stems.vocals, true);
    const takeId = ids.current.take;
    ids.current = { backing: backing.id, guide: guide.id, take: takeId, split: true };
    setTracks(previous => [backing, guide, ...previous.filter(track => track.id === takeId)]);
  }, [stems, recording]);

  // 没分离时，这一条叫「原曲」还是「伴奏」跟着用户的选择走。
  useEffect(() => {
    if (ids.current.split) return;
    const label = plain ? '伴奏' : '原曲', backingId = ids.current.backing;
    setTracks(previous => previous.some(track => track.id === backingId && track.name !== label)
      ? previous.map(track => track.id === backingId ? { ...track, name: label, clips: track.clips.map(clip => ({ ...clip, name: label })) } : track)
      : previous);
  }, [plain]);

  // 一屏放下整首歌：按容器宽度算出缩放。只在打开时算一次（换缩放档位会重建播放引擎）。
  const frame = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<{ zoom: number[]; head: number } | null>(null);
  useLayoutEffect(() => {
    const full = frame.current?.clientWidth ?? 800;
    const head = full < 640 ? HEAD_WIDTH_COMPACT : HEAD_WIDTH;
    const fit = Math.max(512, Math.ceil(original.length / Math.max(200, full - head - 2)));
    setLayout({ zoom: [...new Set([fit >> 3, fit >> 2, fit >> 1, fit].filter(level => level >= 256))], head });
  }, [original.length]);

  return (
    <div className="sing-studio" ref={frame}>
      {layout && (
        <WaveformPlaylistProvider tracks={tracks} onTracksChange={setTracks} sampleRate={RATE} samplesPerPixel={layout.zoom[layout.zoom.length - 1]} zoomLevels={layout.zoom}
          waveHeight={WAVE_HEIGHT} mono controls={{ show: true, width: layout.head }} theme={THEME} timescale barWidth={1} barGap={0} automaticScroll>
          <Desk name={name} lyrics={lyrics} tracks={tracks} setTracks={setTracks} ids={ids} onRecording={setRecording} instrumental={instrumental}
            cover={cover} compact={layout.head === HEAD_WIDTH_COMPACT} empty={empty} onTake={onTake} />
        </WaveformPlaylistProvider>
      )}
    </div>
  );
}

type DeskProps = {
  name: string; lyrics: Lyrics | null;
  tracks: ClipTrack[]; setTracks: (tracks: ClipTrack[]) => void;
  ids: React.RefObject<{ backing: string; guide: string | null; take: string; split: boolean }>;
  onRecording: (recording: boolean) => void;
  instrumental: Blob | null;
  cover: string | null;
  compact: boolean;
  empty?: ReactNode;
  onTake?: (has: boolean) => void;
};
type Settings = {
  latencyMs: number | null; bitDepth: 16 | 32; translation: boolean; roman: boolean;
  /** 按下录音后先倒数三下。 */
  countIn: boolean;
  /** 多轨区域展开还是收起。null 是还没选过，按屏幕大小来。 */
  tracks: boolean | null;
};
const COUNT_FROM = 3, COUNT_STEP = 800;

function Desk({ name, lyrics, tracks, setTracks, ids, onRecording, instrumental, cover, compact, empty, onTake }: DeskProps) {
  const [settings, setSettings] = useStored<Settings>('sumerhub:sing-along', { latencyMs: null, bitDepth: 16, translation: true, roman: true, countIn: true, tracks: null });
  const { currentTime, isPlaying, currentTimeRef } = usePlaybackAnimation();
  const { sampleRate, duration: timelineDuration, trackStates, tracks: liveTracks, canZoomIn, canZoomOut } = usePlaylistData();
  const { play, pause, stop, seekTo, setSelectedTrackId, setRecordingActive, setTrackMute, setTrackSolo, setTrackVolume, zoomIn, zoomOut } = usePlaylistControls();
  const takeId = ids.current.take;
  const latencyOffset = settings.latencyMs === null ? undefined : settings.latencyMs / 1000;
  const tracksRef = useRef(tracks);
  tracksRef.current = tracks;
  const takeClips = () => tracksRef.current.find(track => track.id === takeId)?.clips ?? [];

  const {
    isRecording, duration, levels, peakLevels, devices, hasPermission, selectedDevice, stream,
    startRecording, stopRecording, requestMicAccess, changeDevice, error, recordingPeaks,
  } = useIntegratedRecording(tracks, setTracks, takeId, { currentTime, channelCount: 1, latencyOffset });

  useEffect(() => { setSelectedTrackId(takeId); }, [takeId, setSelectedTrackId]);
  useEffect(() => { onRecording(isRecording); }, [isRecording, onRecording]);

  // 每次开录前记下「我的录音」原来的样子，录坏了可以撤销。
  const history = useRef<ClipTrack['clips'][]>([]);
  // 刚录完的那一段从哪里开始：用来「听一遍」。
  const [fresh, setFresh] = useState<number | null>(null);

  // 以下录音和走带的流程照搬 waveform-playlist 的录音示例：先开始采集，再开始播放，这样伴奏和人声对得上。
  const recordStart = useRef(0);
  const starting = useRef(false);
  const cancelStart = useRef(false);
  const startTake = useCallback(async () => {
    if (starting.current) return;
    starting.current = true; cancelStart.current = false;
    try {
      recordStart.current = currentTimeRef.current ?? 0;
      history.current.push(tracksRef.current.find(track => track.id === takeId)?.clips ?? []);
      // 只留最近 20 步，每一步都连着一段录音的内存。
      if (history.current.length > 20) history.current.shift();
      justStopped.current = false;
      setFresh(null);
      setRecordingActive(true, takeId);
      const started = await startRecording();
      if (!started || cancelStart.current) {
        if (started) stopRecording();
        setRecordingActive(false);
        return;
      }
      try { await play(currentTimeRef.current ?? 0); } catch (problem) { console.warn(problem); }
    } finally { starting.current = false; }
  }, [currentTimeRef, play, setRecordingActive, startRecording, stopRecording, takeId]);

  // 倒数：按下录音后数三下再开始，来得及把手从键盘上拿开。
  const [count, setCount] = useState<number | null>(null);
  const countTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const cancelCount = useCallback(() => {
    if (countTimer.current) clearInterval(countTimer.current);
    countTimer.current = null; setCount(null);
  }, []);
  useEffect(() => cancelCount, [cancelCount]);
  const countIn = settings.countIn;
  const begin = useCallback(() => {
    if (!countIn) { void startTake(); return; }
    let left = COUNT_FROM;
    setCount(left);
    countTimer.current = setInterval(() => {
      left -= 1;
      if (left > 0) { setCount(left); return; }
      cancelCount(); void startTake();
    }, COUNT_STEP);
  }, [cancelCount, countIn, startTake]);

  // 第一次点录音：先要麦克风权限，拿到以后自动开始。
  const [wantTake, setWantTake] = useState(false);
  useEffect(() => {
    if (wantTake && hasPermission && stream) { setWantTake(false); begin(); }
  }, [wantTake, hasPermission, stream, begin]);

  // 录完一段：记下它从哪里开始。录好的片段可能晚一点才放进轨道里，所以停下以后轨道每变一次都看一眼；太短没存下来的不算。
  const wasRecording = useRef(false);
  const justStopped = useRef(false);
  useEffect(() => {
    if (wasRecording.current && !isRecording) justStopped.current = true;
    wasRecording.current = isRecording;
    if (justStopped.current && !isRecording && history.current[history.current.length - 1] !== takeClips()) {
      justStopped.current = false;
      setFresh(recordStart.current);
    }
    // 只看录音状态和轨道的变化。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRecording, tracks]);

  const counting = count !== null;
  const stopAll = useCallback(() => {
    if (counting) { cancelCount(); return; }
    setWantTake(false);
    if (starting.current) cancelStart.current = true;
    if (isRecording) { stopRecording(); pause(); } else stop();
  }, [cancelCount, counting, isRecording, pause, stop, stopRecording]);

  const record = useCallback(() => {
    if (isRecording || counting) { stopAll(); return; }
    if (isPlaying) pause();
    if (!hasPermission || !stream) { setWantTake(true); void requestMicAccess(); return; }
    begin();
  }, [begin, counting, hasPermission, isPlaying, isRecording, pause, requestMicAccess, stopAll, stream]);

  const togglePlay = useCallback(() => {
    if (isRecording || counting) return;
    if (isPlaying) pause(); else void play(currentTimeRef.current ?? 0);
  }, [counting, currentTimeRef, isPlaying, isRecording, pause, play]);

  const rewind = useCallback(() => { if (!isRecording && !counting) { stop(); seekTo(0); } }, [counting, isRecording, seekTo, stop]);

  const shortcuts = useMemo(() => [
    { key: ' ', action: togglePlay, description: '播放 / 暂停', preventDefault: true },
    { key: 'r', shiftKey: false, metaKey: false, ctrlKey: false, altKey: false, action: record, description: '录音 / 停止', preventDefault: true },
    { key: 'Escape', action: stopAll, description: '停止', preventDefault: true },
    { key: '0', action: rewind, description: '回到开头', preventDefault: true },
  ], [record, rewind, stopAll, togglePlay]);

  // 耳返：把麦克风直接送到耳机里。浏览器里会有一点延迟。
  const [monitor, setMonitor] = useState(false);
  useEffect(() => {
    if (!monitor || !stream) return;
    const context = getGlobalAudioContext();
    const source = context.createMediaStreamSource(stream);
    source.connect(context.destination);
    return () => source.disconnect();
  }, [monitor, stream]);

  // 录音电平：声道里最响的那个。
  const level = Math.max(0, ...levels), peak = Math.max(0, ...peakLevels);

  const armed = hasPermission && !!stream;
  const regionColor = (id: string, muted: boolean) => muted ? REGION.muted : id === takeId ? (isRecording ? REGION.recording : REGION.take) : id === ids.current.guide ? REGION.guide : REGION.backing;

  const index = (id: string | null) => liveTracks.findIndex(track => track.id === id);
  const takeIndex = index(takeId), guideIndex = index(ids.current.guide);
  const hasTake = (liveTracks[takeIndex]?.clips.length ?? 0) > 0;
  const guideOn = guideIndex >= 0 && !(trackStates[guideIndex]?.muted ?? true);
  useEffect(() => { onTake?.(hasTake); }, [hasTake, onTake]);

  // 撤销上一段：回到开录之前的样子。清空也能撤销。
  const busy = isRecording || counting;
  const canUndo = !busy && history.current.some(clips => clips !== takeClips());
  const putTake = useCallback((clips: ClipTrack['clips']) => {
    if (isPlaying) pause();
    justStopped.current = false;
    setFresh(null);
    setTracks(tracksRef.current.map(track => track.id === takeId ? { ...track, clips } : track));
  }, [isPlaying, pause, setTracks, takeId]);
  const undo = () => {
    const now = takeClips();
    let previous = history.current.pop();
    while (previous && previous === now) previous = history.current.pop();
    if (previous) putTake(previous);
  };
  const clear = () => { history.current.push(takeClips()); putTake([]); };
  const listen = () => {
    if (fresh === null || busy) return;
    seekTo(fresh);
    void play(fresh);
  };

  const { exportWav, isExporting, progress: exportProgress } = useExportWav();
  const [exportError, setExportError] = useState('');
  const save = useCallback(async (kind: 'dry' | 'mix') => {
    setExportError('');
    try {
      // 干声：只有「我的录音」这一条，从歌曲开头算起，放进宿主软件和伴奏直接对齐。
      // 混音：伴奏加录音，原唱那条不算进去。
      const states = trackStates.map((state, i) => i === guideIndex ? { ...state, muted: true } : i === takeIndex ? { ...state, muted: false, soloed: false } : { ...state, soloed: false });
      const { blob } = await exportWav(liveTracks, states, kind === 'dry'
        ? { mode: 'individual', trackIndex: takeIndex, bitDepth: settings.bitDepth, applyEffects: false, autoDownload: false }
        : { mode: 'master', bitDepth: settings.bitDepth, autoDownload: false });
      const url = URL.createObjectURL(blob);
      saveUrl(url, `${name} - ${kind === 'dry' ? '干声' : '混音'}.wav`);
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (problem) {
      console.error(problem);
      setExportError('导出失败，请重试。');
    }
  }, [exportWav, guideIndex, liveTracks, name, settings.bitDepth, takeIndex, trackStates]);

  const micRate = stream?.getAudioTracks()[0]?.getSettings().sampleRate;
  const lines = useMemo(() => lyrics?.lines.map(line => ({
    ...line, translatedLyric: settings.translation ? line.translatedLyric : '', romanLyric: settings.roman ? line.romanLyric : '',
  })) ?? [], [lyrics, settings.translation, settings.roman]);

  // 多轨区域：屏幕够高就默认展开，手机上默认收起；用户点过就记住。
  const [roomy, setRoomy] = useState(true);
  useEffect(() => { setRoomy(window.innerHeight >= 700 && window.innerWidth > 640); }, []);
  const showTracks = settings.tracks ?? roomy;
  const [panel, setPanel] = useState<'settings' | 'export' | null>(null);
  useEffect(() => { if (busy) setPanel(null); }, [busy]);

  const status = isRecording ? `正在录音 ${clock(duration)}` : counting ? '准备' : wantTake ? '等待麦克风…' : isPlaying ? '播放中' : '';

  return (
    <>
      <KeyboardShortcuts additionalShortcuts={shortcuts} />

      <LiveLyrics lines={lines} cover={cover} locked={busy}>
        {lines.length === 0 && (
          <div className="sing-stage-empty">{lyrics ? <p>这首歌在网易云没有歌词（可能是纯音乐），可以照常录。</p> : empty}</div>
        )}
        {counting && <div className="sing-count" role="status" aria-live="assertive"><b key={count}>{count}</b></div>}
        {isRecording && <div className="sing-onair" role="status"><i />录音中</div>}
      </LiveLyrics>

      <div className={'sing-dock' + (isRecording ? ' recording' : '')}>
        <Scrub duration={timelineDuration} disabled={busy} />

        {/* 控制条：读数在左，走带在中间，工具在右 */}
        <div className="sing-bar">
          <div className="sing-read">
            <Position fallback={currentTime} /><span className="sing-total">/ {clock(timelineDuration)}</span>
            {status && <span className="sing-status" role="status">{status}</span>}
          </div>

          <div className="sing-transport">
            <button className="sing-key" onClick={rewind} disabled={busy} aria-label="回到开头" title="回到开头（0）"><PiSkipBackFill size={16} /></button>
            <button className={'sing-key sing-play' + (isPlaying && !isRecording ? ' on' : '')} onClick={togglePlay} disabled={busy} aria-label={isPlaying ? '暂停' : '播放'} title="播放 / 暂停（空格）">
              {isPlaying && !isRecording ? <PiPauseFill size={20} /> : <PiPlayFill size={20} />}
            </button>
            <button className={'sing-record' + (isRecording ? ' on' : counting || wantTake ? ' waiting' : '')} onClick={record} aria-pressed={isRecording} aria-label={busy ? '停止录音' : '录音'} title="录音 / 停止（R）">
              <i /><span>{isRecording ? '停止' : counting ? '取消' : '录音'}</span>
            </button>
          </div>

          <div className="sing-tools">
            {armed && (
              <div className="sing-level" role="meter" aria-label="录音电平" aria-valuemin={0} aria-valuemax={1} aria-valuenow={Number(level.toFixed(2))} title="麦克风电平">
                <SegmentedVUMeter levels={[level]} peakLevels={[peak]} channelLabels={['']} orientation="horizontal" segmentCount={compact ? 12 : 18} segmentWidth={10} segmentHeight={4} segmentGap={2}
                  dBRange={[-50, 0]} showScale={false} coloredInactive colorStops={METER} />
              </div>
            )}
            {guideIndex >= 0 && (
              <button className="sing-pill" aria-pressed={guideOn} onClick={() => setTrackMute(guideIndex, guideOn)} title="把原唱的人声垫在下面，跟着唱更容易找到调">
                <PiMicrophoneStage size={15} />原唱
              </button>
            )}
            <button className="sing-pill" aria-pressed={showTracks} onClick={() => setSettings(s => ({ ...s, tracks: !showTracks }))} title="展开或收起多轨">
              <PiSlidersHorizontal size={15} /><span>轨道</span>
            </button>
            <button className="sing-pill icon" aria-expanded={panel === 'settings'} aria-label="设置" title="麦克风和设置" disabled={busy} onClick={() => setPanel(open => open === 'settings' ? null : 'settings')}><PiGearSix size={16} /></button>
            <button className={'sing-pill' + (hasTake ? ' primary' : '')} aria-expanded={panel === 'export'} disabled={busy} onClick={() => setPanel(open => open === 'export' ? null : 'export')}><PiArrowDown size={15} />导出</button>
          </div>

          {panel && <button className="sing-veil" aria-label="关闭" onClick={() => setPanel(null)} />}
          {panel === 'settings' && (
            <div className="sing-panel" role="dialog" aria-label="设置">
              <h3>麦克风</h3>
              {hasPermission ? (
                <label className="sing-set"><span>输入</span>
                  <select className="select" value={selectedDevice ?? ''} onChange={event => void changeDevice(event.target.value)}>
                    {devices.map(device => <option key={device.deviceId} value={device.deviceId}>{device.label || '麦克风'}</option>)}
                  </select>
                </label>
              ) : (
                <button className="sing-pill" onClick={() => void requestMicAccess()}><PiMicrophoneFill size={14} />打开麦克风</button>
              )}
              <label className="check" title="浏览器里会慢一点点，不习惯就关掉。"><input type="checkbox" checked={monitor} disabled={!armed} onChange={event => setMonitor(event.target.checked)} />耳返：在耳机里听到自己</label>
              <label className="check"><input type="checkbox" checked={settings.countIn} onChange={event => setSettings(s => ({ ...s, countIn: event.target.checked }))} />录音前倒数三下</label>
              <label className="sing-set" title="录下来的人声会比伴奏晚一点，这里填要往前挪多少毫秒。留空是自动（按浏览器报告的输出延迟）。">
                <span>延迟补偿</span>
                <input className="input" type="number" min={0} max={500} step={1} placeholder="自动"
                  value={settings.latencyMs ?? ''} onChange={event => setSettings(s => ({ ...s, latencyMs: event.target.value === '' ? null : Math.max(0, Math.min(500, Number(event.target.value))) }))} />
                <span>毫秒</span>
              </label>
              <p className="sing-panel-note">录出来和伴奏对不齐（常见于蓝牙耳机）时，在这里填毫秒数再录。</p>
              {(lyrics?.hasTranslation || lyrics?.hasRoman) && <h3>歌词</h3>}
              {lyrics?.hasTranslation && <label className="check"><input type="checkbox" checked={settings.translation} onChange={event => setSettings(s => ({ ...s, translation: event.target.checked }))} />显示翻译</label>}
              {lyrics?.hasRoman && <label className="check"><input type="checkbox" checked={settings.roman} onChange={event => setSettings(s => ({ ...s, roman: event.target.checked }))} />显示音译</label>}
              <h3>快捷键</h3>
              <p className="sing-panel-note"><kbd>空格</kbd> 播放和暂停　<kbd>R</kbd> 录音和停止　<kbd>Esc</kbd> 停止　<kbd>0</kbd> 回到开头</p>
            </div>
          )}
          {panel === 'export' && (
            <div className="sing-panel sing-export" role="dialog" aria-label="导出">
              <button className="sing-out" disabled={!hasTake || isExporting} onClick={() => void save('dry')}>
                <strong><PiArrowDown size={14} />干声</strong><span>只有你的声音，没有处理，从歌曲开头算起，放进宿主软件能和伴奏对齐</span>
              </button>
              <button className="sing-out" disabled={!hasTake || isExporting} onClick={() => void save('mix')}>
                <strong><PiArrowDown size={14} />混音</strong><span>伴奏加你的声音</span>
              </button>
              {instrumental && (
                <button className="sing-out" onClick={() => { const url = URL.createObjectURL(instrumental); saveUrl(url, `${name} - 伴奏.wav`); setTimeout(() => URL.revokeObjectURL(url), 60_000); }}>
                  <strong><PiArrowDown size={14} />伴奏</strong><span>分离出来的伴奏</span>
                </button>
              )}
              <label className="sing-set"><span>位深</span>
                <select className="select" value={settings.bitDepth} onChange={event => setSettings(s => ({ ...s, bitDepth: Number(event.target.value) === 32 ? 32 : 16 }))}>
                  <option value={16}>16 位</option><option value={32}>32 位浮点</option>
                </select>
              </label>
              <p className="sing-panel-note sing-export-note">
                {isExporting ? `导出中 ${Math.round(exportProgress * 100)}%` : hasTake ? `${RATE / 1000} kHz WAV${micRate && micRate !== RATE ? `（麦克风是 ${micRate / 1000} kHz）` : ''}` : '录一段之后可以导出干声和混音'}
              </p>
              {exportError && <p className="sing-panel-note"><span className="row-error">{exportError}</span></p>}
            </div>
          )}
        </div>

        {error && <p className="sing-note"><span className="row-error">{micMessage(error)}</span></p>}
        {!error && fresh !== null && !busy && (
          <p className="sing-note sing-fresh" role="status">
            <span>录好了一段。</span>
            <button className="sing-pill" onClick={listen}><PiPlayFill size={13} />听一遍</button>
            <button className="sing-pill" onClick={undo} disabled={!canUndo}><PiArrowCounterClockwise size={14} />不要这段</button>
            <button className="sing-pill primary" onClick={() => setPanel('export')}><PiArrowDown size={14} />导出</button>
            <button className="sing-pill icon" aria-label="收起" onClick={() => setFresh(null)}><PiX size={14} /></button>
          </p>
        )}

        <div className={'sing-tracks' + (showTracks ? '' : ' shut')} aria-hidden={!showTracks}>
          {/* 每条轨的片段颜色 */}
          <style>{liveTracks.map((track, i) => `.sing-tracks [data-track-id="${track.id}"]{--region:${regionColor(track.id, trackStates[i]?.muted ?? false)}}`).join('')}</style>
          <Waveform
            showClipHeaders
            renderPlayhead={props => <PlayheadWithMarker {...props} color={THEME.playheadColor} />}
            renderTrackControls={trackIndex => {
              const track = liveTracks[trackIndex], state = trackStates[trackIndex];
              if (!track || !state) return null;
              const mine = track.id === takeId;
              return (
                <div className={'sing-track' + (compact ? ' compact' : '')} style={{ '--region': regionColor(track.id, state.muted) } as React.CSSProperties}>
                  <span className="sing-track-number">{trackIndex + 1}</span>
                  <span className="sing-track-icon">{mine ? <PiMicrophoneFill size={14} /> : <PiWaveform size={15} />}</span>
                  <div className="sing-track-body">
                    <span className="sing-track-name">{track.name}</span>
                    <div className="sing-track-keys">
                      <button className="sing-switch m" onClick={() => setTrackMute(trackIndex, !state.muted)} aria-pressed={state.muted} aria-label={'静音 ' + track.name} title="静音">M</button>
                      <button className="sing-switch s" onClick={() => setTrackSolo(trackIndex, !state.soloed)} aria-pressed={state.soloed} aria-label={'独奏 ' + track.name} title="独奏：只听这一条">S</button>
                      {mine && <button className="sing-switch r" onClick={() => { if (!armed) void requestMicAccess(); }} aria-pressed={armed} aria-label="录音轨" title={armed ? '麦克风已打开，录音会录到这一条' : '打开麦克风'}>R</button>}
                      {mine && <button className="sing-switch i" onClick={() => setMonitor(on => !on)} aria-pressed={monitor} disabled={!armed} aria-label="耳返" title="耳返：把麦克风的声音送进耳机">I</button>}
                      <input className="sing-fader" type="range" min={0} max={1} step={0.01} value={state.volume} style={{ '--level': state.volume } as React.CSSProperties}
                        onChange={event => setTrackVolume(trackIndex, Number(event.target.value))} onPointerUp={event => event.currentTarget.blur()} aria-label={track.name + ' 音量'} title="音量" />
                    </div>
                  </div>
                </div>
              );
            }}
            recordingState={isRecording ? {
              isRecording: true, trackId: takeId, startSample: Math.floor(recordStart.current * sampleRate),
              durationSamples: Math.floor(duration * sampleRate), peaks: recordingPeaks, bits: 16, latencyOffset,
            } : undefined}
          />
          <div className="sing-tracks-foot">
            <span>点波形或歌词可以跳到那里；重录某一句，就把播放头放回去再录，新的会盖掉旧的。</span>
            <button className="sing-mini" onClick={undo} disabled={!canUndo}><PiArrowCounterClockwise size={13} />撤销上一段</button>
            <button className="sing-mini" onClick={clear} disabled={!hasTake || busy}><PiTrash size={13} />清空录音</button>
            <span className="sing-zoom">
              <button className="sing-mini" onClick={zoomOut} disabled={!canZoomOut} aria-label="缩小" title="缩小"><PiMagnifyingGlassMinus size={14} /></button>
              <button className="sing-mini" onClick={zoomIn} disabled={!canZoomIn} aria-label="放大" title="放大"><PiMagnifyingGlassPlus size={14} /></button>
            </span>
          </div>
        </div>
      </div>
    </>
  );
}

function micMessage(error: Error) {
  if (/denied|NotAllowed|Permission/i.test(error.name + error.message)) return '浏览器没有允许使用麦克风。在地址栏左边的网站设置里打开麦克风权限，再点一次录音。';
  if (/NotFound|no.*device/i.test(error.name + error.message)) return '没有找到麦克风。';
  if (/too short/i.test(error.message)) return '这一段太短了，没有保存。';
  return `录音出了问题：${error.message}`;
}

/** 控制条上的当前位置。播放时每帧直接改文字，不让整个录音台跟着重画。 */
function Position({ fallback }: { fallback: number }) {
  const { registerFrameCallback, unregisterFrameCallback, visualTimeRef } = usePlaybackAnimation();
  const now = useRef<HTMLElement>(null);
  useEffect(() => {
    registerFrameCallback('sing-position', ({ visualTime }) => { if (now.current) now.current.textContent = precise(Math.max(0, visualTime)); });
    return () => unregisterFrameCallback('sing-position');
  }, [registerFrameCallback, unregisterFrameCallback]);
  useEffect(() => { if (now.current) now.current.textContent = precise(Math.max(0, visualTimeRef.current ?? fallback)); }, [fallback, visualTimeRef]);
  return <b className="sing-time" ref={now}>00:00.0</b>;
}

/** 进度条：收起多轨时也能拖到想去的地方。拖的时候只动条，松手才真的跳过去。 */
function Scrub({ duration, disabled }: { duration: number; disabled: boolean }) {
  const { registerFrameCallback, unregisterFrameCallback, visualTimeRef, currentTime } = usePlaybackAnimation();
  const { seekTo } = usePlaylistControls();
  const input = useRef<HTMLInputElement>(null);
  const holding = useRef(false);
  const paint = useCallback((time: number) => {
    const element = input.current;
    if (!element) return;
    element.style.setProperty('--at', String(duration > 0 ? Math.min(1, Math.max(0, time / duration)) : 0));
    if (!holding.current) element.value = String(time);
  }, [duration]);
  useEffect(() => {
    registerFrameCallback('sing-scrub', ({ visualTime }) => { if (!holding.current) paint(Math.max(0, visualTime)); });
    return () => unregisterFrameCallback('sing-scrub');
  }, [paint, registerFrameCallback, unregisterFrameCallback]);
  useEffect(() => { if (!holding.current) paint(Math.max(0, visualTimeRef.current ?? currentTime)); }, [currentTime, paint, visualTimeRef]);
  const commit = () => {
    if (!holding.current || !input.current) return;
    holding.current = false;
    seekTo(Number(input.current.value));
    // 松手后把焦点还回去，不然空格、R 这些快捷键会被进度条吃掉。
    input.current.blur();
  };
  return (
    <input ref={input} className="sing-scrub" type="range" min={0} max={Math.max(duration, 0.01)} step={0.01} defaultValue={0} disabled={disabled} aria-label="播放位置"
      onPointerDown={() => { holding.current = true; }} onKeyDown={event => { if (event.key.startsWith('Arrow')) holding.current = true; }}
      onChange={event => { holding.current = true; paint(Number(event.target.value)); }}
      onPointerUp={commit} onKeyUp={commit} onBlur={commit} />
  );
}

/** 歌词跟着播放走。点一行跳到那一句；录音时不能跳。 */
const LiveLyrics = memo(function LiveLyrics({ lines, cover, locked, children }: { lines: Line[]; cover: string | null; locked: boolean; children?: ReactNode }) {
  const { registerFrameCallback, unregisterFrameCallback, visualTimeRef, currentTime, isPlaying } = usePlaybackAnimation();
  const { seekTo } = usePlaylistControls();
  const player = useRef<StageRef>(null);
  useEffect(() => {
    registerFrameCallback('sing-lyrics', ({ visualTime }) => player.current?.lyricPlayer?.setCurrentTime(Math.max(0, Math.round(visualTime * 1000))));
    return () => unregisterFrameCallback('sing-lyrics');
  }, [registerFrameCallback, unregisterFrameCallback]);
  // 没在播放时（拖动、点歌词、回到开头）也要跟上。
  useEffect(() => {
    player.current?.lyricPlayer?.setCurrentTime(Math.max(0, Math.round((visualTimeRef.current ?? currentTime) * 1000)), true);
  }, [currentTime, lines, visualTimeRef]);
  return (
    <LyricStage ref={player} lines={lines} cover={cover} playing={isPlaying} onLine={index => { if (!locked) seekTo(lines[index].startTime / 1000); }}>
      {children}
    </LyricStage>
  );
});
