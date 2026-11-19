/** 从一段文字里认出网易云的歌：歌曲链接、App 里“分享”出来的整段文字、短链接，或者直接一串数字 id。 */
export type SongLink = { id: string } | { short: string } | null;

const SHORT_HOSTS = new Set(['163cn.tv', '163cn.link']);
const isNetease = (host: string) => host === 'music.163.com' || host.endsWith('.music.163.com');

function fromUrl(text: string): SongLink {
  let url: URL;
  try { url = new URL(text); } catch { return null; }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  const host = url.hostname.toLowerCase();
  if (SHORT_HOSTS.has(host)) return /^\/[\w-]{3,32}\/?$/.test(url.pathname) ? { short: `https://${host}${url.pathname}` } : null;
  if (!isNetease(host)) return null;
  // 网页版把真正的路径放在 # 后面：music.163.com/#/song?id=123
  const inner = url.hash.startsWith('#/') ? new URL(url.hash.slice(1), 'https://music.163.com') : url;
  if (!/(^|\/)song(\/|$)/.test(inner.pathname)) return null;
  const id = inner.searchParams.get('id') ?? inner.pathname.match(/\/song\/(\d+)/)?.[1] ?? '';
  return /^\d{1,12}$/.test(id) ? { id } : null;
}

export function parseSongLink(input: string): SongLink {
  const text = input.trim();
  if (/^\d{3,12}$/.test(text)) return { id: text };
  const candidates = text.match(/(?:https?:\/\/)?(?:[\w-]+\.)*(?:music\.163\.com|163cn\.tv|163cn\.link)\/[^\s<>"'，。）)]*/gi) ?? [];
  for (const candidate of candidates) {
    const found = fromUrl(/^https?:\/\//i.test(candidate) ? candidate : `https://${candidate}`);
    if (found) return found;
  }
  return null;
}
