import CryptoJS from 'crypto-js';

/**
 * 网易云下载的文件里都带着一段「163 key」：.ncm 在文件头，MP3 和 FLAC 在备注标签里。
 * 里面是歌曲 id、歌名和歌手。只读文件开头的一小段就能知道这是哪首歌，不用把整首解开。
 * 解法和「NCM 转 MP3」里读标签的那段相同（同一个密钥）。
 */
export type Tag = { musicId?: string; title?: string; artist?: string };

const MARK = "163 key(Don't modify):";
const META_KEY = '2331346c6a6b5f215c5d2630553c2728';
const latin1 = (bytes: Uint8Array) => { let text = ''; for (let i = 0; i < bytes.length; i += 8192) text += String.fromCharCode(...bytes.subarray(i, i + 8192)); return text; };

/** 把「163 key」后面那段 Base64 解成歌曲信息。解不出来就是 null。 */
export function decodeKey(base64: string): Tag | null {
  try {
    const plain = CryptoJS.AES.decrypt(
      CryptoJS.lib.CipherParams.create({ ciphertext: CryptoJS.enc.Base64.parse(base64) }),
      CryptoJS.enc.Hex.parse(META_KEY),
      { mode: CryptoJS.mode.ECB, padding: CryptoJS.pad.Pkcs7 },
    ).toString(CryptoJS.enc.Utf8);
    const parsed = JSON.parse(plain.slice(plain.indexOf(':') + 1));
    const info = parsed.mainMusic ?? parsed;
    const artists = (Array.isArray(info.artist) ? info.artist : [])
      .map((entry: unknown) => Array.isArray(entry) ? entry[0] : entry)
      .filter((name: unknown): name is string => typeof name === 'string' && !!name.trim());
    return {
      musicId: /^\d{1,12}$/.test(String(info.musicId ?? '')) ? String(info.musicId) : undefined,
      title: typeof info.musicName === 'string' ? info.musicName : undefined,
      artist: artists.length ? artists.join('、') : undefined,
    };
  } catch { return null; }
}

function fromNcmHead(bytes: Uint8Array): Tag | null | 'more' {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 18) return null;
  const keyLength = view.getUint32(10, true);
  const metaAt = 14 + keyLength;
  if (keyLength > 4096) return null;
  if (metaAt + 4 > bytes.length) return 'more';
  const metaLength = view.getUint32(metaAt, true);
  if (!metaLength || metaLength > 1 << 20) return null;
  if (metaAt + 4 + metaLength > bytes.length) return 'more';
  const text = latin1(bytes.subarray(metaAt + 4, metaAt + 4 + metaLength).map(byte => byte ^ 0x63));
  return text.startsWith(MARK) ? decodeKey(text.slice(MARK.length)) : null;
}

function fromComment(bytes: Uint8Array): Tag | null {
  const text = latin1(bytes);
  // 备注可能按单字节写，也可能按 UTF-16 写（每个字符后面跟一个 0）。
  let at = text.indexOf(MARK), step = 1;
  if (at < 0) { at = text.indexOf(MARK.split('').join('\0')); step = 2; }
  if (at < 0) return null;
  let base64 = '';
  for (let i = at + MARK.length * step; i < text.length; i += step) {
    const char = text[i];
    if (!/[A-Za-z0-9+/=]/.test(char)) break;
    base64 += char;
  }
  return base64.length >= 24 ? decodeKey(base64) : null;
}

/** 读一个文件是网易云的哪首歌。不是网易云下载的文件（或者标签被改过）就返回 null。 */
export async function readTag(file: Blob): Promise<Tag | null> {
  try {
    const head = new Uint8Array(await file.slice(0, 16 * 1024).arrayBuffer());
    const magic = latin1(head.subarray(0, 8));
    if (magic === 'CTENFDAM') {
      const first = fromNcmHead(head);
      if (first !== 'more') return first;
      const more = fromNcmHead(new Uint8Array(await file.slice(0, 2 * 1024 * 1024).arrayBuffer()));
      return more === 'more' ? null : more;
    }
    // MP3：备注在开头的 ID3 标签里，标签里可能还有封面，所以按标签写明的长度读（最多 4 MB）。
    let length = 256 * 1024;
    if (magic.startsWith('ID3')) length = Math.min(4 * 1024 * 1024, 10 + ((head[6] & 127) << 21 | (head[7] & 127) << 14 | (head[8] & 127) << 7 | (head[9] & 127)));
    const found = fromComment(head);
    if (found || length <= head.length) return found;
    return fromComment(new Uint8Array(await file.slice(0, length).arrayBuffer()));
  } catch { return null; }
}
