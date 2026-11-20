import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import CryptoJS from 'crypto-js';
import { filterEntries, findSong, type Entry } from '../src/tools/sing-along/lib/library.ts';
import { parseLink, parseSongLink } from '../src/tools/sing-along/lib/link.ts';
import { buildLyrics } from '../src/tools/sing-along/lib/lyrics.ts';
import { readTag } from '../src/tools/sing-along/lib/tag.ts';

test('认得出网易云的各种歌曲链接', () => {
  const id = { id: '1901371647' };
  assert.deepEqual(parseSongLink('https://music.163.com/#/song?id=1901371647'), id);
  assert.deepEqual(parseSongLink('https://music.163.com/song?id=1901371647&userid=123456'), id);
  assert.deepEqual(parseSongLink('http://music.163.com/song/1901371647/?userid=1'), id);
  assert.deepEqual(parseSongLink('https://y.music.163.com/m/song?id=1901371647&app_version=9.1'), id);
  assert.deepEqual(parseSongLink('music.163.com/#/song?id=1901371647'), id);
  assert.deepEqual(parseSongLink(' 1901371647 '), id);
  // App 里“分享 → 复制链接”出来的是一整段话。
  assert.deepEqual(parseSongLink('分享陈奕迅的单曲《孤勇者》: https://music.163.com/song?id=1901371647&uct2=abc (来自@网易云音乐)'), id);
  assert.deepEqual(parseSongLink('分享单曲《孤勇者》https://163cn.tv/AbCd12 (来自@网易云音乐)'), { short: 'https://163cn.tv/AbCd12' });
});

test('不是歌曲的链接、别的网站、随便一段话都不认', () => {
  assert.equal(parseSongLink('https://music.163.com/#/playlist?id=123456'), null);
  assert.equal(parseSongLink('https://music.163.com/#/album?id=123456'), null);
  assert.equal(parseSongLink('https://evil.example/song?id=1901371647'), null);
  assert.equal(parseSongLink('https://music.163.com.evil.example/song?id=1901371647'), null);
  assert.equal(parseSongLink('https://163cn.tv/a/b/c'), null);
  assert.equal(parseSongLink('晴天 周杰伦'), null);
  assert.equal(parseSongLink(''), null);
});

const lrc = '[00:00.000] 作词 : 某某\n[00:01.000] 作曲 : 某某\n[00:10.000]第一句\n[00:15.500]第二句\n[00:20.000]\n[00:21.000]第三句\n[00:30.000]制作人：某某\n';

test('逐行歌词：去掉署名行和空行，每一行到下一行开始为止', () => {
  const { lines, wordLevel, hasTranslation } = buildLyrics({ lrc, yrc: '', translation: '', roman: '' }, 40000);
  assert.equal(wordLevel, false);
  assert.equal(hasTranslation, false);
  assert.deepEqual(lines.map(line => line.words.map(word => word.word).join('')), ['第一句', '第二句', '第三句']);
  assert.deepEqual(lines.map(line => [line.startTime, line.endTime]), [[10000, 15500], [15500, 20000], [21000, 30000]]);
  // 最后一行后面什么都没有时，用歌曲长度收尾；不知道长度就给 8 秒。
  const tail = { lrc: '[00:10.000]第一句\n[00:15.500]最后一句\n', yrc: '', translation: '', roman: '' };
  assert.equal(buildLyrics(tail, 40000).lines[1].endTime, 40000);
  assert.equal(buildLyrics(tail).lines[1].endTime, 23500);
});

test('有逐字歌词就用逐字的，翻译按时间对上', () => {
  const yrc = '{"t":0,"c":[{"tx":"作词: "},{"tx":"某某"}]}\n[10020,5000](10020,400,0)第(10420,600,0)一(11020,900,0)句\n[15480,4000](15480,500,0)第(15980,500,0)二(16480,700,0)句\n';
  const translation = '[00:10.000]First line\n[00:15.500]Second line\n';
  const { lines, wordLevel, hasTranslation, hasRoman } = buildLyrics({ lrc, yrc, translation, roman: '' }, 40000);
  assert.equal(wordLevel, true);
  assert.equal(hasTranslation, true);
  assert.equal(hasRoman, false);
  assert.equal(lines.length, 2);
  assert.deepEqual(lines[0].words.map(word => [word.word, word.startTime, word.endTime]), [['第', 10020, 10420], ['一', 10420, 11020], ['句', 11020, 11920]]);
  assert.deepEqual(lines.map(line => line.translatedLyric), ['First line', 'Second line']);
});

test('没有歌词（纯音乐）时是空的，不报错', () => {
  assert.deepEqual(buildLyrics({ lrc: '', yrc: '', translation: '', roman: '' }).lines, []);
});

test('歌单和专辑的链接也认得出，但不当成歌曲', () => {
  assert.deepEqual(parseLink('https://music.163.com/#/playlist?id=3778678'), { playlist: '3778678' });
  assert.deepEqual(parseLink('https://music.163.com/playlist?id=3778678&userid=1'), { playlist: '3778678' });
  assert.deepEqual(parseLink('https://y.music.163.com/m/playlist?id=3778678'), { playlist: '3778678' });
  assert.deepEqual(parseLink('分享歌单: https://music.163.com/album?id=135070731&uct2=x'), { album: '135070731' });
  assert.deepEqual(parseLink('https://music.163.com/song?id=1901371647'), { id: '1901371647' });
  assert.equal(parseLink('https://music.163.com/#/mv?id=123456'), null);
  assert.equal(parseLink('https://music.163.com/song/media/outer/url?id=1901371647.mp3'), null);
});

// 网易云写在文件里的那段「163 key」：和真文件一样的加密方式，内容是测试用的。
const MARK = "163 key(Don't modify):";
const sealed = (info: object) => MARK + CryptoJS.AES.encrypt(
  CryptoJS.enc.Utf8.parse('music:' + JSON.stringify(info)), CryptoJS.enc.Hex.parse('2331346c6a6b5f215c5d2630553c2728'), { mode: CryptoJS.mode.ECB, padding: CryptoJS.pad.Pkcs7 },
).ciphertext.toString(CryptoJS.enc.Base64);
const INFO = { musicId: 1901371647, musicName: '孤勇者', artist: [['陈奕迅', 2116]], album: '孤勇者' };
const ascii = (text: string) => Uint8Array.from(text, char => char.charCodeAt(0));
const join = (...parts: Uint8Array[]) => { const out = new Uint8Array(parts.reduce((n, part) => n + part.length, 0)); let at = 0; for (const part of parts) { out.set(part, at); at += part.length; } return out; };
const u32le = (value: number) => { const out = new Uint8Array(4); new DataView(out.buffer).setUint32(0, value, true); return out; };

test('只读文件开头就知道是网易云的哪首歌：NCM', async () => {
  const meta = ascii(sealed(INFO)).map(byte => byte ^ 0x63);
  const head = join(ascii('CTENFDAM'), new Uint8Array(2), u32le(128), new Uint8Array(128), u32le(meta.length), meta, new Uint8Array(4000));
  assert.deepEqual(await readTag(new Blob([head])), { musicId: '1901371647', title: '孤勇者', artist: '陈奕迅' });
  // 真的 NCM 文件（测试样本里没有歌曲 id，但歌名读得出来）。
  const real = await readTag(new Blob([readFileSync(new URL('./fixtures/tone-mp3.ncm', import.meta.url))]));
  assert.equal(real?.title, 'Tone MP3');
  assert.equal(real?.musicId, undefined);
});

test('只读文件开头就知道是网易云的哪首歌：MP3 和 FLAC 的备注', async () => {
  const id3 = (body: Uint8Array) => join(ascii('ID3'), Uint8Array.of(3, 0, 0, (body.length >> 21) & 127, (body.length >> 14) & 127, (body.length >> 7) & 127, body.length & 127), body);
  const frame = (text: Uint8Array) => join(ascii('COMM'), Uint8Array.of(0, 0, (text.length >> 8) & 255, text.length & 255, 0, 0), text);
  const audio = new Uint8Array(300_000).fill(0x55);
  // 备注排在一张 20 万字节的封面后面，也要读得到。
  const cover = join(ascii('APIC'), Uint8Array.of(0, 3, 13, 64, 0, 0), new Uint8Array(200_000));
  const plain = id3(join(cover, frame(join(Uint8Array.of(0), ascii('eng\0'), ascii(sealed(INFO))))));
  assert.deepEqual(await readTag(new Blob([plain, audio])), { musicId: '1901371647', title: '孤勇者', artist: '陈奕迅' });
  // UTF-16 写的备注。
  const wide = Uint8Array.from(sealed(INFO).split('').flatMap(char => [char.charCodeAt(0), 0]));
  const utf16 = id3(frame(join(Uint8Array.of(1), ascii('eng'), Uint8Array.of(0xff, 0xfe, 0, 0, 0xff, 0xfe), wide)));
  assert.equal((await readTag(new Blob([utf16, audio])))?.musicId, '1901371647');
  // FLAC：写在 Vorbis 注释里。
  const flac = join(ascii('fLaC'), new Uint8Array(42), ascii('DESCRIPTION=' + sealed(INFO)), audio);
  assert.equal((await readTag(new Blob([flac])))?.musicId, '1901371647');
  // 普通文件、被改坏的标签：都是 null，不报错。
  assert.equal(await readTag(new Blob([readFileSync(new URL('./fixtures/tone.mp3', import.meta.url))])), null);
  assert.equal(await readTag(new Blob([ascii(MARK + 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='), audio])), null);
  assert.equal(await readTag(new Blob([])), null);
});

test('在下载的歌里找到链接对应的那一首', () => {
  const file = (path: string, tag?: Entry['tag'], size = 1000): Entry => {
    const name = path.slice(path.lastIndexOf('/') + 1), dot = name.lastIndexOf('.');
    return { path, stem: name.slice(0, dot), ext: name.slice(dot + 1), size, modified: 0, open: async () => new File([], name), tag };
  };
  const song = { id: '1901371647', title: '孤勇者', artists: ['陈奕迅'] };
  const library = [
    file('周杰伦 - 晴天.ncm', { musicId: '186016', title: '晴天', artist: '周杰伦' }),
    file('track 07.mp3', { musicId: '1901371647', title: '孤勇者', artist: '陈奕迅' }),
    file('陈奕迅 - 孤勇者 (Live).mp3', null),
    file('别人 - 孤勇者.mp3', null),
  ];
  // 文件里写的 id 对得上：文件名是什么都行。
  assert.equal(findSong(library, song)?.path, 'track 07.mp3');
  // 没有 id：文件名里要同时有歌名和歌手，翻唱的不算。
  assert.equal(findSong(library.filter(item => item.path !== 'track 07.mp3'), song)?.path, '陈奕迅 - 孤勇者 (Live).mp3');
  assert.equal(findSong([file('别人 - 孤勇者.mp3', null)], song), null);
  // 同一首歌有几个文件：无损的优先，名字最短的优先。
  const copies = [file('陈奕迅 - 孤勇者 (Live).flac', null), file('陈奕迅 - 孤勇者.mp3', null), file('陈奕迅 - 孤勇者.flac', null), file('Eason Chan,陈奕迅-孤勇者.ncm', null)];
  assert.equal(findSong(copies, song)?.path, '陈奕迅 - 孤勇者.flac');
  // 歌名、歌手的写法不完全一样（全角、空格、大小写）。
  assert.equal(findSong([file('G.E.M.邓紫棋 - 光年之外.ncm', null)], { id: '1', title: '光年之外', artists: ['G.E.M. 邓紫棋'] })?.path, 'G.E.M.邓紫棋 - 光年之外.ncm');
  assert.equal(findSong([file('Taylor Swift - Love Story（Taylor’s Version）.mp3', null)], { id: '1', title: "Love Story (Taylor's Version)", artists: ['Taylor Swift'] })?.stem.startsWith('Taylor'), true);
  assert.equal(findSong([], song), null);
  // 列表里按名字筛选。
  assert.deepEqual(filterEntries(library, '孤勇').map(item => item.path), ['track 07.mp3', '陈奕迅 - 孤勇者 (Live).mp3', '别人 - 孤勇者.mp3']);
  assert.equal(filterEntries(library, '').length, 4);
});
