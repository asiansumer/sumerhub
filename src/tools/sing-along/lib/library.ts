import { del, get, set } from 'idb-keyval';
import { readTag, type Tag } from './tag.ts';

/**
 * 「我的下载」：让浏览器读网易云的下载文件夹。连一次以后，贴链接就能自动找到那首歌的文件。
 * 用的是浏览器自带的文件夹读取（File System Access API，Chrome 和 Edge 有）；文件只在本机读，不上传。
 * Safari 没有这个接口，退回到「选一次文件夹」（这次打开页面期间有效）。
 */
export type Entry = {
  /** 文件夹里的相对路径。 */
  path: string;
  /** 不带扩展名的文件名，一般是「歌手 - 歌名」。 */
  stem: string;
  ext: string;
  size: number;
  modified: number;
  open: () => Promise<File>;
  /** 文件里写着的网易云歌曲信息。null 是读过了但没有。 */
  tag?: Tag | null;
};

type Permission = 'granted' | 'denied' | 'prompt';
export type Folder = FileSystemDirectoryHandle & {
  entries(): AsyncIterableIterator<[string, FileSystemDirectoryHandle | FileSystemFileHandle]>;
  queryPermission?: (descriptor: { mode: 'read' }) => Promise<Permission>;
  requestPermission?: (descriptor: { mode: 'read' }) => Promise<Permission>;
};

const FOLDER = 'sing-along:folder', TAGS = 'sing-along:tags';
const AUDIO = /\.(ncm|mp3|flac|wav|m4a|aac|ogg|opus|aiff?)$/i;
const MAX_FILES = 5000, MAX_DEPTH = 3;

export const canConnect = () => typeof window !== 'undefined' && 'showDirectoryPicker' in window;

/** 让用户选文件夹。取消返回 null。 */
export async function chooseFolder(): Promise<Folder | null> {
  const picker = (window as unknown as { showDirectoryPicker: (options: object) => Promise<Folder> }).showDirectoryPicker;
  try {
    const folder = await picker({ id: 'sing-along', mode: 'read', startIn: 'music' });
    await set(FOLDER, folder).catch(() => undefined);
    return folder;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return null;
    throw error;
  }
}

/** 上次连接的文件夹。浏览器重开以后通常要再点一次允许（granted 为 false）。 */
export async function savedFolder(): Promise<{ folder: Folder; granted: boolean } | null> {
  try {
    const folder = await get<Folder>(FOLDER);
    if (!folder) return null;
    const state = folder.queryPermission ? await folder.queryPermission({ mode: 'read' }) : 'granted';
    return { folder, granted: state === 'granted' };
  } catch { return null; }
}

/** 重新要读取权限。必须在点击里调用。 */
export async function allowFolder(folder: Folder): Promise<boolean> {
  try { return !folder.requestPermission || await folder.requestPermission({ mode: 'read' }) === 'granted'; }
  catch { return false; }
}

export async function forgetFolder(): Promise<void> {
  await Promise.all([del(FOLDER), del(TAGS)]).catch(() => undefined);
}

const entry = (path: string, file: File, open: () => Promise<File>): Entry => {
  const name = path.slice(path.lastIndexOf('/') + 1), dot = name.lastIndexOf('.');
  return { path, stem: name.slice(0, dot), ext: name.slice(dot + 1).toLowerCase(), size: file.size, modified: file.lastModified, open };
};
const newestFirst = (entries: Entry[]) => entries.sort((a, b) => b.modified - a.modified);

async function walk(directory: Folder, prefix: string, depth: number, visit: (path: string, handle: FileSystemFileHandle) => Promise<boolean>): Promise<boolean> {
  for await (const [name, handle] of directory.entries()) {
    if (name.startsWith('.')) continue;
    if (handle.kind === 'directory') { if (depth < MAX_DEPTH && !await walk(handle as Folder, prefix + name + '/', depth + 1, visit)) return false; }
    else if (AUDIO.test(name) && !await visit(prefix + name, handle as FileSystemFileHandle)) return false;
  }
  return true;
}

/** 列出文件夹里的歌（往下找三层），新下载的排在前面。 */
export async function listFolder(folder: Folder): Promise<Entry[]> {
  const found: Entry[] = [];
  await walk(folder, '', 0, async (path, handle) => {
    try { found.push(entry(path, await handle.getFile(), () => handle.getFile())); } catch { /* 读不了的跳过 */ }
    return found.length < MAX_FILES;
  });
  return newestFirst(found);
}

/** 只列文件名，不打开文件：用来便宜地看一眼有没有新下载的歌。 */
export async function listPaths(folder: Folder): Promise<string[]> {
  const found: string[] = [];
  await walk(folder, '', 0, async path => { found.push(path); return found.length < MAX_FILES; });
  return found;
}

/** Safari 等：从「选择文件夹」的结果里列出歌。 */
export function listFiles(files: File[]): Entry[] {
  return newestFirst(files.filter(file => AUDIO.test(file.name) && !file.name.startsWith('.')).slice(0, MAX_FILES)
    .map(file => entry(file.webkitRelativePath.split('/').slice(1).join('/') || file.name, file, async () => file)));
}

const cacheKey = (item: Entry) => `${item.path}|${item.size}|${item.modified}`;

/** 读出每个文件是网易云的哪首歌（只读文件开头）。读过的记在浏览器里，下次不用再读。 */
export async function readTags(entries: Entry[]): Promise<void> {
  const cache = await get<Record<string, Tag | null>>(TAGS).catch(() => undefined) ?? {};
  const todo: Entry[] = [];
  for (const item of entries) {
    if (item.tag !== undefined) continue;
    const known = cache[cacheKey(item)];
    if (known !== undefined) item.tag = known; else todo.push(item);
  }
  if (!todo.length) return;
  let next = 0;
  await Promise.all(Array.from({ length: 6 }, async () => {
    while (next < todo.length) {
      const item = todo[next++];
      try { item.tag = await readTag(await item.open()); } catch { item.tag = null; }
    }
  }));
  const fresh: Record<string, Tag | null> = {};
  for (const item of entries) if (item.tag !== undefined) fresh[cacheKey(item)] = item.tag;
  await set(TAGS, fresh).catch(() => undefined);
}

const squash = (text: string) => text.normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '');
const RANK = ['flac', 'ncm', 'wav', 'mp3', 'm4a'];
const better = (a: Entry, b: Entry) => {
  const rank = (item: Entry) => { const at = RANK.indexOf(item.ext); return at < 0 ? RANK.length : at; };
  return rank(a) - rank(b) || a.stem.length - b.stem.length || b.size - a.size;
};

/** 在下载的歌里找这一首：先按文件里写的歌曲 id，找不到再按文件名（要同时有歌名和歌手）。 */
export function findSong(entries: Entry[], song: { id: string; title: string; artists: string[] }): Entry | null {
  const sameId = entries.filter(item => item.tag?.musicId === song.id);
  if (sameId.length) return sameId.sort(better)[0];
  const title = squash(song.title);
  if (!title) return null;
  const artists = song.artists.map(squash).filter(Boolean);
  const named = entries.filter(item => {
    const name = squash(item.stem), tagged = squash([item.tag?.title, item.tag?.artist].filter(Boolean).join(' '));
    return [name, tagged].some(text => text.includes(title) && artists.some(artist => text.includes(artist)));
  });
  return named.sort(better)[0] ?? null;
}

/** 列表里的筛选：文件名或者标签里有这几个字。 */
export function filterEntries(entries: Entry[], words: string): Entry[] {
  const needle = squash(words);
  if (!needle) return entries;
  return entries.filter(item => squash(item.stem + (item.tag?.title ?? '') + (item.tag?.artist ?? '')).includes(needle));
}
