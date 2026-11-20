import { NextResponse } from 'next/server';
import { parseLink, type AnyLink } from '@/tools/sing-along/lib/link';

/**
 * 跟唱录音用的歌词接口：浏览器不能直接跨域请求网易云，由这里代取。
 * 只做几件固定的事：按歌曲 id 取歌名和歌词、把分享短链接换成 id、列出歌单或专辑里的歌名、按歌名搜索、取专辑封面（歌词背景要读它的颜色，跨域的图读不了）。
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

/** 短链接跳到哪里就是哪里：一首歌、一个歌单或者一张专辑。中间可能再跳几次。 */
async function resolveShort(short: string): Promise<Exclude<AnyLink, { short: string }>> {
  let url = short;
  for (let hop = 0; hop < 5; hop++) {
    const response = await get(url, 'manual');
    const location = response.headers.get('location');
    if (!location) return null;
    url = new URL(location, url).toString();
    const next = parseLink(url);
    if (next && !('short' in next)) return next;
    if (next) url = next.short;
    else if (!/^https:\/\/([\w-]+\.)*(163\.com|163cn\.tv|163cn\.link)\//.test(url)) return null;
  }
  return null;
}

const fail = (status: number, error: string) => NextResponse.json({ error }, { status });

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  try {
    const cover = params.get('cover');
    if (cover) {
      // 只认网易云自己的图片域名，别的地址一律不代取。
      const url = URL.canParse(cover) ? new URL(cover) : null;
      if (!url || url.protocol !== 'https:' || !/^p\d+\.music\.126\.net$/.test(url.hostname)) return fail(400, '不是网易云的封面地址。');
      const image = await get(`${url.origin}${url.pathname}?param=300y300`);
      const type = image.headers.get('content-type') ?? '';
      if (!image.ok || !type.startsWith('image/')) return fail(502, '封面取不到。');
      return new NextResponse(await image.arrayBuffer(), { headers: { 'Content-Type': type, 'Cache-Control': 'public, max-age=86400, s-maxage=2592000, immutable' } });
    }

    const query = params.get('q')?.trim().slice(0, 80);
    if (query) {
      const response = await get(`https://music.163.com/api/cloudsearch/pc?type=1&limit=8&offset=0&s=${encodeURIComponent(query)}`);
      const data = await response.json() as { result?: { songs?: RawSong[] } };
      return NextResponse.json({ songs: (data.result?.songs ?? []).map(brief) });
    }

    const pasted = parseLink(params.get('link') ?? '');
    if (!pasted) return fail(400, '认不出这个链接。请粘贴网易云里一首歌（或歌单、专辑）的分享链接。');
    const link = 'short' in pasted ? await resolveShort(pasted.short) : pasted;
    if (!link) return fail(404, '这个短链接打不开，或者不是歌曲。可以在网易云里重新复制链接，或者直接输入歌名搜。');

    // 歌单、专辑：只列出里面的歌，给用户挑。
    if ('playlist' in link) {
      const data = await get(`https://music.163.com/api/v6/playlist/detail?id=${link.playlist}&n=100`).then(r => r.json()) as { playlist?: { name?: string; tracks?: RawSong[] } };
      if (!data.playlist) return fail(404, '这个歌单打不开，可能不公开。');
      return NextResponse.json({ list: `歌单：${data.playlist.name ?? ''}`, songs: (data.playlist.tracks ?? []).slice(0, 100).map(brief) });
    }
    if ('album' in link) {
      const data = await get(`https://music.163.com/api/v1/album/${link.album}`).then(r => r.json()) as { album?: { name?: string }; songs?: RawSong[] };
      if (!data.album) return fail(404, '这张专辑打不开。');
      return NextResponse.json({ list: `专辑：${data.album.name ?? ''}`, songs: (data.songs ?? []).slice(0, 100).map(brief) });
    }
    const id = link.id;

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
