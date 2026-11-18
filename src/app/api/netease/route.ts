import { NextResponse } from 'next/server';
import { parseSongLink } from '@/tools/sing-along/lib/link';

/**
 * 跟唱录音用的歌词接口：浏览器不能直接跨域请求网易云，由这里代取。
 * 只做三件固定的事：按歌曲 id 取歌名和歌词、把分享短链接换成 id、按歌名搜索。
 * 不取音频，也不带任何账号信息。
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  Referer: 'https://music.163.com/',
};

async function get(url: string, redirect: RequestRedirect = 'follow'): Promise<Response> {
  let last: unknown;
  // 网易云偶尔会直接断开连接，重试两次。
  for (let attempt = 0; attempt < 3; attempt++) {
    try { return await fetch(url, { headers: HEADERS, redirect, signal: AbortSignal.timeout(8000), cache: 'no-store' }); }
    catch (error) { last = error; }
  }
  throw last;
}

type Artist = { name?: string };
type RawSong = { id: number; name?: string; duration?: number; dt?: number; artists?: Artist[]; ar?: Artist[]; album?: { name?: string; picUrl?: string }; al?: { name?: string; picUrl?: string } };
const brief = (song: RawSong) => ({
  id: String(song.id),
  title: song.name ?? '',
  artists: (song.artists ?? song.ar ?? []).map(artist => artist.name ?? '').filter(Boolean),
  album: (song.album ?? song.al)?.name ?? '',
  cover: ((song.album ?? song.al)?.picUrl ?? '').replace(/^http:/, 'https:'),
  duration: song.duration ?? song.dt ?? 0,
});

async function resolveShort(short: string): Promise<string | null> {
  let url = short;
  for (let hop = 0; hop < 3; hop++) {
    const response = await get(url, 'manual');
    const location = response.headers.get('location');
    if (!location) return null;
    const next = parseSongLink(new URL(location, url).toString());
    if (!next) return null;
    if ('id' in next) return next.id;
    url = next.short;
  }
  return null;
}

const fail = (status: number, error: string) => NextResponse.json({ error }, { status });

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  try {
    const query = params.get('q')?.trim().slice(0, 80);
    if (query) {
      const response = await get(`https://music.163.com/api/cloudsearch/pc?type=1&limit=8&offset=0&s=${encodeURIComponent(query)}`);
      const data = await response.json() as { result?: { songs?: RawSong[] } };
      return NextResponse.json({ songs: (data.result?.songs ?? []).map(brief) });
    }

    const link = parseSongLink(params.get('link') ?? '');
    if (!link) return fail(400, '认不出这个链接。请粘贴网易云里一首歌的分享链接。');
    const id = 'id' in link ? link.id : await resolveShort(link.short);
    if (!id) return fail(404, '这个短链接打不开，或者不是一首歌。');

    const [detail, lyric] = await Promise.all([
      get(`https://music.163.com/api/song/detail/?id=${id}&ids=%5B${id}%5D`).then(r => r.json()) as Promise<{ songs?: RawSong[] }>,
      get(`https://music.163.com/api/song/lyric/v1?id=${id}&cp=false&tv=0&lv=0&rv=0&kv=0&yv=0&ytv=0&yrv=0`).then(r => r.json()) as Promise<Record<string, { lyric?: string } | undefined>>,
    ]);
    const song = detail.songs?.[0];
    if (!song) return fail(404, '网易云里找不到这首歌。');
    const text = (key: string) => lyric[key]?.lyric ?? '';
    return NextResponse.json(
      { ...brief(song), lyrics: { lrc: text('lrc'), yrc: text('yrc'), translation: text('tlyric'), roman: text('romalrc') } },
      { headers: { 'Cache-Control': 'public, max-age=300, s-maxage=86400' } },
    );
  } catch {
    return fail(502, '暂时连不上网易云，稍后再试。');
  }
}
