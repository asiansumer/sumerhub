import { parseLrc, parseYrc, type LyricLine } from '@applemusic-like-lyrics/lyric';

/** 接口返回的四种歌词文本：逐行（lrc）、逐字（yrc）、翻译、音译。没有的是空字符串。 */
export type RawLyrics = { lrc: string; yrc: string; translation: string; roman: string };
export type Lyrics = {
  lines: LyricLine[];
  /** 有没有逐字的时间（有的话唱到哪个字亮到哪个字）。 */
  wordLevel: boolean;
  hasTranslation: boolean;
  hasRoman: boolean;
};

const text = (line: LyricLine) => line.words.map(word => word.word).join('').trim();
/** “作词：某某”“出品：某某”这类署名行，不是要唱的词。 */
const isCredit = (line: LyricLine) => /^[^，。！？!?,]{1,16}\s*[:：]/.test(text(line));

/** 去掉空行，以及开头和结尾成片的署名行。 */
function sung(lines: LyricLine[]): LyricLine[] {
  const kept = lines.filter(line => text(line));
  let from = 0, to = kept.length;
  while (from < to && isCredit(kept[from])) from++;
  while (to > from && isCredit(kept[to - 1])) to--;
  return kept.slice(from, to);
}

/** 翻译、音译是另一份逐行歌词，按开始时间对到主歌词上（两份的时间会差几十毫秒）。 */
function attach(lines: LyricLine[], extra: string, key: 'translatedLyric' | 'romanLyric'): boolean {
  if (!extra.trim()) return false;
  const others = parseLrc(extra).map(line => ({ time: line.startTime, text: text(line) })).filter(line => line.text);
  let matched = 0;
  for (const line of lines) {
    let best: { time: number; text: string } | null = null;
    for (const other of others) if (!best || Math.abs(other.time - line.startTime) < Math.abs(best.time - line.startTime)) best = other;
    if (best && Math.abs(best.time - line.startTime) <= 1000) { line[key] = best.text; matched++; }
  }
  return matched > 0;
}

/**
 * 把网易云的歌词整理成歌词组件要的格式。有逐字歌词就用逐字的，否则用逐行的。
 * duration 是歌曲长度（毫秒），用来给最后一行一个合理的结束时间。
 */
export function buildLyrics(raw: RawLyrics, duration = 0): Lyrics {
  let wordLevel = false;
  let lines: LyricLine[] = [];
  if (raw.yrc.trim()) {
    try { lines = sung(parseYrc(raw.yrc)); wordLevel = lines.length > 0; } catch { lines = []; }
  }
  if (!lines.length) { wordLevel = false; lines = sung(parseLrc(raw.lrc)); }
  lines.sort((a, b) => a.startTime - b.startTime);
  lines.forEach((line, index) => {
    const next = lines[index + 1]?.startTime;
    // 逐行歌词的最后一行没有结束时间，解析出来是一个极大的数。
    const limit = next ?? (duration > line.startTime ? duration : line.startTime + 8000);
    if (line.endTime > limit || line.endTime <= line.startTime) line.endTime = limit;
    for (const word of line.words) if (word.endTime > line.endTime) word.endTime = line.endTime;
  });
  const hasTranslation = attach(lines, raw.translation, 'translatedLyric');
  const hasRoman = attach(lines, raw.roman, 'romanLyric');
  return { lines, wordLevel, hasTranslation, hasRoman };
}
