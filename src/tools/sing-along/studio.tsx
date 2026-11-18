'use client';

import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { PiArrowDown, PiMicrophone, PiPauseFill, PiPlayFill, PiSkipBackFill, PiSpeakerHigh, PiSpeakerSlash, PiStopFill } from 'react-icons/pi';
import {
  ClipInteractionProvider, KeyboardShortcuts, Waveform, WaveformPlaylistProvider,
  usePlaybackAnimation, usePlaylistControls, usePlaylistData,
} from '@waveform-playlist/browser';
import { useExportWav } from '@waveform-playlist/browser/tone';
import { createClipFromSeconds, createTrack, type ClipTrack } from '@waveform-playlist/core';
import { getGlobalAudioContext } from '@waveform-playlist/playout';
import { useIntegratedRecording } from '@waveform-playlist/recording';
import { LyricPlayer, type LyricPlayerRef } from '@applemusic-like-lyrics/react';
import '@applemusic-like-lyrics/core/style.css';
import { saveUrl } from '@/lib/download';
import { useStored } from '@/lib/stored';
import type { Lyrics } from './lib/lyrics';
import { RATE } from './lib/source';

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
};

const CONTROLS_WIDTH = 132;
// 这个库的配色：waveOutlineColor 是波形外面的底色，waveFillColor 才是波形本身，waveProgressColor 是已经播过那一段的波形。
const THEME = {
  waveformDrawMode: 'inverted' as const,
  waveOutlineColor: '#121214', waveFillColor: '#6f6f79', waveProgressColor: '#dcdce1',
  selectedWaveOutlineColor: '#141416', selectedWaveFillColor: '#8f8f99',
  selectedTrackControlsBackground: '#161618', selectedTrackBackground: '#141416',
  timeColor: '#62626b', timescaleBackgroundColor: '#121214',
  playheadColor: '#ededef', selectionColor: 'rgba(237, 237, 239, .14)',
  clipHeaderBackgroundColor: 'rgba(18, 18, 20, .9)', clipHeaderBorderColor: '#242428', clipHeaderTextColor: '#9b9ba3', selectedClipHeaderBackgroundColor: '#242428',
  backgroundColor: '#121214', surfaceColor: '#161618', borderColor: '#242428', textColor: '#ededef', textColorMuted: '#9b9ba3',
  fontFamily: 'inherit', fontSize: '13px', fontSizeSmall: '12px', borderRadius: '8px',
};

const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
const fullTrack = (name: string, audioBuffer: AudioBuffer, muted = false) =>
  createTrack({ name, clips: [createClipFromSeconds({ audioBuffer, startTime: 0, duration: audioBuffer.duration, offset: 0, name })], muted, soloed: false, volume: 1, pan: 0 });

/** 录音台：歌词、走带、多轨波形、录音和导出。 */
export default function Studio({ name, lyrics, original, stems, plain, instrumental }: Props) {
  // 三条轨：伴奏（分离完成前是原曲）、原唱（分离完成后才有，默认静音）、我的录音。
  // 轨道和它们的 id 一起建一次（开发模式下初始化函数会跑两遍，分开建会对不上）。
  const [initial] = useState(() => {
    const take = createTrack({ name: '我的录音', clips: [], muted: false, soloed: false, volume: 1, pan: 0 });
    if (stems) {
      const backing = fullTrack('伴奏', stems.instrumental), guide = fullTrack('原唱', stems.vocals, true);
      return { tracks: [backing, guide, take], ids: { backing: backing.id, guide: guide.id as string | null, take: take.id, split: true } };
    }
    const backing = fullTrack(plain ? '伴奏' : '原曲', original);
    return { tracks: [backing, take], ids: { backing: backing.id, guide: null as string | null, take: take.id, split: plain } };
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

  // 一屏放下整首歌：按容器宽度算出缩放。只在打开时算一次（换缩放档位会重建播放引擎）。
  const frame = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState<number[] | null>(null);
  useLayoutEffect(() => {
    const width = Math.max(240, (frame.current?.clientWidth ?? 800) - CONTROLS_WIDTH - 2);
    const fit = Math.max(512, Math.ceil(original.length / width));
    setZoom([...new Set([fit >> 3, fit >> 2, fit >> 1, fit].filter(level => level >= 256))]);
  }, [original.length]);

  return (
    <div className="sing-studio" ref={frame}>
      {zoom && (
        <WaveformPlaylistProvider tracks={tracks} onTracksChange={setTracks} sampleRate={RATE} samplesPerPixel={zoom[zoom.length - 1]} zoomLevels={zoom}
          waveHeight={64} mono controls={{ show: true, width: CONTROLS_WIDTH }} theme={THEME} timescale barWidth={1} barGap={0} automaticScroll>
          <Desk name={name} lyrics={lyrics} tracks={tracks} setTracks={setTracks} ids={ids} onRecording={setRecording} instrumental={instrumental} />
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
};
type Settings = { latencyMs: number | null; bitDepth: 16 | 32; translation: boolean; roman: boolean };

function Desk({ name, lyrics, tracks, setTracks, ids, onRecording, instrumental }: DeskProps) {
  const [settings, setSettings] = useStored<Settings>('sumerhub:sing-along', { latencyMs: null, bitDepth: 16, translation: true, roman: true });
  const { currentTime, isPlaying, currentTimeRef } = usePlaybackAnimation();
  const { sampleRate, duration: timelineDuration, trackStates, tracks: liveTracks, canZoomIn, canZoomOut } = usePlaylistData();
  const { play, pause, stop, seekTo, setSelectedTrackId, setRecordingActive, setTrackMute, setTrackVolume, zoomIn, zoomOut } = usePlaylistControls();
  const takeId = ids.current.take;
  const latencyOffset = settings.latencyMs === null ? undefined : settings.latencyMs / 1000;

  const {
    isRecording, duration, levels, peakLevels, devices, hasPermission, selectedDevice, stream,
    startRecording, stopRecording, requestMicAccess, changeDevice, error, recordingPeaks,
  } = useIntegratedRecording(tracks, setTracks, takeId, { currentTime, channelCount: 1, latencyOffset });

  useEffect(() => { setSelectedTrackId(takeId); }, [takeId, setSelectedTrackId]);
  useEffect(() => { onRecording(isRecording); }, [isRecording, onRecording]);

  // 以下录音和走带的流程照搬 waveform-playlist 的录音示例：先开始采集，再开始播放，这样伴奏和人声对得上。
  const recordStart = useRef(0);
  const starting = useRef(false);
  const cancelStart = useRef(false);
  const startTake = useCallback(async () => {
    if (starting.current) return;
    starting.current = true; cancelStart.current = false;
    try {
      recordStart.current = currentTimeRef.current ?? 0;
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

  // 第一次点录音：先要麦克风权限，拿到以后自动开始。
  const [wantTake, setWantTake] = useState(false);
  useEffect(() => {
    if (wantTake && hasPermission && stream) { setWantTake(false); void startTake(); }
  }, [wantTake, hasPermission, stream, startTake]);

  const stopAll = useCallback(() => {
    if (starting.current) cancelStart.current = true;
    if (isRecording) { stopRecording(); pause(); } else stop();
  }, [isRecording, pause, stop, stopRecording]);

  const record = useCallback(() => {
    if (isRecording) { stopAll(); return; }
    if (isPlaying) pause();
    if (!hasPermission || !stream) { setWantTake(true); void requestMicAccess(); return; }
    void startTake();
  }, [hasPermission, isPlaying, isRecording, pause, requestMicAccess, startTake, stopAll, stream]);

  const togglePlay = useCallback(() => {
    if (isRecording) return;
    if (isPlaying) pause(); else void play(currentTimeRef.current ?? 0);
  }, [currentTimeRef, isPlaying, isRecording, pause, play]);

  const rewind = useCallback(() => { if (!isRecording) { stop(); seekTo(0); } }, [isRecording, seekTo, stop]);

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

  const index = (id: string | null) => liveTracks.findIndex(track => track.id === id);
  const takeIndex = index(takeId), guideIndex = index(ids.current.guide);
  const hasTake = (liveTracks[takeIndex]?.clips.length ?? 0) > 0;

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

  return (
    <>
      <KeyboardShortcuts additionalShortcuts={shortcuts} />

      {lyrics && lines.length > 0 ? (
        <div className="sing-lyrics">
          <LyricsView lines={lines} locked={isRecording} />
          {(lyrics.hasTranslation || lyrics.hasRoman) && (
            <div className="sing-lyrics-options">
              {lyrics.hasTranslation && <label className="check"><input type="checkbox" checked={settings.translation} onChange={event => setSettings(s => ({ ...s, translation: event.target.checked }))} />翻译</label>}
              {lyrics.hasRoman && <label className="check"><input type="checkbox" checked={settings.roman} onChange={event => setSettings(s => ({ ...s, roman: event.target.checked }))} />音译</label>}
            </div>
          )}
        </div>
      ) : (
        <p className="sing-nolyrics">{lyrics ? '这首歌在网易云没有歌词（可能是纯音乐），可以照常录。' : '还没有匹配歌词。在最上面粘贴网易云的歌曲链接，或者输入歌名搜一下。'}</p>
      )}

      <div className="sing-transport">
        <button className="icon" onClick={rewind} disabled={isRecording} aria-label="回到开头" title="回到开头（0）"><PiSkipBackFill size={15} /></button>
        <button className="icon" onClick={togglePlay} disabled={isRecording} aria-label={isPlaying ? '暂停' : '播放'} title="播放 / 暂停（空格）">{isPlaying && !isRecording ? <PiPauseFill size={16} /> : <PiPlayFill size={16} />}</button>
        <button className={'sing-record' + (isRecording ? ' on' : '')} onClick={record} aria-pressed={isRecording} title="录音 / 停止（R）">
          {isRecording ? <PiStopFill size={13} /> : <i />}{isRecording ? `停止 ${clock(duration)}` : wantTake ? '等待麦克风…' : '录音'}
        </button>
        <Position total={timelineDuration} fallback={currentTime} />
        <span className="sing-zoom">
          <button className="link" onClick={zoomIn} disabled={!canZoomIn}>放大</button>
          <button className="link" onClick={zoomOut} disabled={!canZoomOut}>缩小</button>
        </span>
      </div>

      <div className="sing-tracks">
        <ClipInteractionProvider>
          <Waveform
            interactiveClips
            renderTrackControls={trackIndex => {
              const track = liveTracks[trackIndex], state = trackStates[trackIndex];
              if (!track || !state) return null;
              return (
                <div className="sing-track">
                  <span>{track.name}</span>
                  <div>
                    <button className="icon" onClick={() => setTrackMute(trackIndex, !state.muted)} aria-pressed={state.muted} aria-label={(state.muted ? '打开 ' : '静音 ') + track.name} title={state.muted ? '已静音，点一下打开' : '静音'}>
                      {state.muted ? <PiSpeakerSlash size={14} /> : <PiSpeakerHigh size={14} />}
                    </button>
                    <input type="range" min={0} max={1} step={0.01} value={state.volume} onChange={event => setTrackVolume(trackIndex, Number(event.target.value))} aria-label={track.name + ' 音量'} />
                  </div>
                </div>
              );
            }}
            recordingState={isRecording ? {
              isRecording: true, trackId: takeId, startSample: Math.floor(recordStart.current * sampleRate),
              durationSamples: Math.floor(duration * sampleRate), peaks: recordingPeaks, bits: 16, latencyOffset,
            } : undefined}
          />
        </ClipInteractionProvider>
      </div>

      <div className="sing-mic">
        {hasPermission ? (
          <>
            <label className="field"><span><PiMicrophone size={13} /> 麦克风</span>
              <select className="select" value={selectedDevice ?? ''} disabled={isRecording} onChange={event => void changeDevice(event.target.value)}>
                {devices.map(device => <option key={device.deviceId} value={device.deviceId}>{device.label || '麦克风'}</option>)}
              </select>
            </label>
            <div className="sing-level" role="meter" aria-label="录音电平" aria-valuemin={0} aria-valuemax={1} aria-valuenow={Number(level.toFixed(2))}>
              <span style={{ width: `${Math.min(1, level) * 100}%` }} className={peak > 0.97 ? 'hot' : ''} /><i style={{ left: `${Math.min(1, peak) * 100}%` }} />
            </div>
            <label className="check" title="把麦克风的声音送进耳机。浏览器里会慢一点点，不习惯就关掉。"><input type="checkbox" checked={monitor} onChange={event => setMonitor(event.target.checked)} />耳返</label>
          </>
        ) : (
          <button className="button ghost" onClick={() => void requestMicAccess()}><PiMicrophone size={14} /> 打开麦克风</button>
        )}
        <label className="field sing-latency" title="录下来的人声会比伴奏晚一点，这里填要往前挪多少毫秒。留空是自动（按浏览器报告的输出延迟）。录完觉得没对上，也可以直接拖动波形。">
          <span>延迟补偿</span>
          <input className="input" type="number" min={0} max={500} step={1} placeholder="自动" disabled={isRecording}
            value={settings.latencyMs ?? ''} onChange={event => setSettings(s => ({ ...s, latencyMs: event.target.value === '' ? null : Math.max(0, Math.min(500, Number(event.target.value))) }))} />
          <span>毫秒</span>
        </label>
      </div>
      {error && <p className="message"><span className="row-error">{micMessage(error)}</span></p>}

      <div className="sing-export">
        <span className="sing-export-note">
          {hasTake ? `${RATE / 1000} kHz WAV${micRate && micRate !== RATE ? `（麦克风是 ${micRate / 1000} kHz）` : ''}` : '录一段之后可以导出'}
        </span>
        <label className="field"><span>位深</span>
          <select className="select" value={settings.bitDepth} onChange={event => setSettings(s => ({ ...s, bitDepth: Number(event.target.value) === 32 ? 32 : 16 }))}>
            <option value={16}>16 位</option><option value={32}>32 位浮点</option>
          </select>
        </label>
        {instrumental && <button className="button ghost" onClick={() => { const url = URL.createObjectURL(instrumental); saveUrl(url, `${name} - 伴奏.wav`); setTimeout(() => URL.revokeObjectURL(url), 60_000); }}><PiArrowDown size={14} /> 伴奏</button>}
        <button className="button ghost" disabled={!hasTake || isExporting || isRecording} onClick={() => void save('dry')}><PiArrowDown size={14} /> 干声</button>
        <button className="button" disabled={!hasTake || isExporting || isRecording} onClick={() => void save('mix')}>{isExporting ? `导出中 ${Math.round(exportProgress * 100)}%` : <><PiArrowDown size={14} /> 混音</>}</button>
      </div>
      {exportError && <p className="message"><span className="row-error">{exportError}</span></p>}
    </>
  );
}

function micMessage(error: Error) {
  if (/denied|NotAllowed|Permission/i.test(error.name + error.message)) return '浏览器没有允许使用麦克风。在地址栏左边的网站设置里打开麦克风权限，再点一次录音。';
  if (/NotFound|no.*device/i.test(error.name + error.message)) return '没有找到麦克风。';
  if (/too short/i.test(error.message)) return '这一段太短了，没有保存。';
  return `录音出了问题：${error.message}`;
}

/** 当前时间 / 总长。播放时每帧直接改文字，不让整个录音台跟着重画。 */
function Position({ total, fallback }: { total: number; fallback: number }) {
  const { registerFrameCallback, unregisterFrameCallback, visualTimeRef } = usePlaybackAnimation();
  const now = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    registerFrameCallback('sing-position', ({ visualTime }) => { if (now.current) now.current.textContent = clock(Math.max(0, visualTime)); });
    return () => unregisterFrameCallback('sing-position');
  }, [registerFrameCallback, unregisterFrameCallback]);
  useEffect(() => { if (now.current) now.current.textContent = clock(Math.max(0, visualTimeRef.current ?? fallback)); }, [fallback, visualTimeRef]);
  return <span className="sing-time"><span ref={now}>0:00</span> / {clock(total)}</span>;
}

type Line = Lyrics['lines'][number];
/** 滚动歌词（AMLL）。点一行跳到那一句；录音时不能跳。 */
const LyricsView = memo(function LyricsView({ lines, locked }: { lines: Line[]; locked: boolean }) {
  const { registerFrameCallback, unregisterFrameCallback, visualTimeRef, currentTime, isPlaying } = usePlaybackAnimation();
  const { seekTo } = usePlaylistControls();
  const player = useRef<LyricPlayerRef>(null);
  useEffect(() => {
    registerFrameCallback('sing-lyrics', ({ visualTime }) => player.current?.lyricPlayer?.setCurrentTime(Math.max(0, Math.round(visualTime * 1000))));
    return () => unregisterFrameCallback('sing-lyrics');
  }, [registerFrameCallback, unregisterFrameCallback]);
  // 没在播放时（拖动、点歌词、回到开头）也要跟上。
  useEffect(() => {
    player.current?.lyricPlayer?.setCurrentTime(Math.max(0, Math.round((visualTimeRef.current ?? currentTime) * 1000)), true);
  }, [currentTime, lines, visualTimeRef]);
  return (
    <LyricPlayer ref={player} className="sing-lyric-player" lyricLines={lines} playing={isPlaying} alignAnchor="center" alignPosition={0.4} enableBlur={false}
      onLyricLineClick={event => { if (!locked) seekTo(lines[event.lineIndex].startTime / 1000); }} />
  );
});
