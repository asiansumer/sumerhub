'use client';

import { forwardRef, type ReactNode } from 'react';
import { BackgroundRender, LyricPlayer, type LyricPlayerRef } from '@applemusic-like-lyrics/react';
import '@applemusic-like-lyrics/core/style.css';
import type { Lyrics } from './lib/lyrics';

export type Line = Lyrics['lines'][number];
export type StageRef = LyricPlayerRef;
type Props = {
  lines: Line[];
  /** 专辑封面（本站代取的地址），背景按它的颜色流动。 */
  cover: string | null;
  playing: boolean;
  /** 还没有音频时只是把歌词摆出来看：一行一行排开，可以随便滚。 */
  still?: boolean;
  onLine?: (index: number) => void;
  children?: ReactNode;
};

/** 歌词舞台（AMLL），用它自带的 Apple Music 式效果：当前行最亮，别的行虚化，弹性滚动，背景跟着封面的颜色流动。 */
const LyricStage = forwardRef<StageRef, Props>(function LyricStage({ lines, cover, playing, still, onLine, children }, ref) {
  return (
    <div className={'sing-stage' + (still ? ' still' : '')}>
      {/* 背景一直缓缓流动（暂停时也是），和 Apple Music 一样。 */}
      {cover && <BackgroundRender className="sing-stage-back" album={cover} playing fps={30} renderScale={0.5} />}
      {lines.length > 0 && (still ? (
        <ol className="sing-lyric-list" aria-label="歌词">
          {lines.map((line, index) => (
            <li key={index}>
              <span>{line.words.map(word => word.word).join('')}</span>
              {line.translatedLyric && <small>{line.translatedLyric}</small>}
            </li>
          ))}
        </ol>
      ) : (
        <LyricPlayer ref={ref} className="sing-lyric-player" lyricLines={lines} playing={playing} alignAnchor="center" alignPosition={0.38}
          enableBlur enableScale enableSpring onLyricLineClick={event => onLine?.(event.lineIndex)} />
      ))}
      {children}
    </div>
  );
});
export default LyricStage;
