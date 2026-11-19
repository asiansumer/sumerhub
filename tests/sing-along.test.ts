import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSongLink } from '../src/tools/sing-along/lib/link.ts';
import { buildLyrics } from '../src/tools/sing-along/lib/lyrics.ts';

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
