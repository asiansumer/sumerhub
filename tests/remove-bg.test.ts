import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { backgrounds, fill, models, outputFormat, type Settings } from '../src/tools/remove-bg/types.ts';

const base: Settings = { model: 'general', background: 'transparent', color: '#3b82f6', format: 'png' };

test('背景色：透明没有颜色，白、黑、自选各自对应', () => {
  assert.equal(fill(base), null);
  assert.equal(fill({ ...base, background: 'white' }), '#ffffff');
  assert.equal(fill({ ...base, background: 'black' }), '#000000');
  assert.equal(fill({ ...base, background: 'custom' }), '#3b82f6');
  assert.deepEqual(backgrounds.map(option => option.value), ['transparent', 'white', 'black', 'custom']);
});

test('透明背景只能存 PNG，纯色背景按选的格式', () => {
  assert.equal(outputFormat({ ...base, format: 'jpeg' }), 'png');
  assert.equal(outputFormat({ ...base, background: 'white', format: 'jpeg' }), 'jpeg');
  assert.equal(outputFormat({ ...base, background: 'white' }), 'png');
});

test('页面用到的每个模型，构建脚本都会取来，而且固定了版本和校验值', () => {
  const engine = fs.readFileSync('src/tools/remove-bg/lib/engine.ts', 'utf8');
  const script = fs.readFileSync('scripts/fetch-assets.mjs', 'utf8');
  const folders = [...engine.matchAll(/(?:general|fine): '([\w-]+)'/g)].map(match => match[1]);
  assert.equal(folders.length, models.length);
  for (const folder of folders) assert.ok(script.includes(`folder: 'public/models/${folder}'`), folder);
  // 下载地址里是提交号而不是 main，文件都带 sha256。
  assert.equal((script.match(/resolve\/[0-9a-f]{40}\//g) ?? []).length, models.length);
  assert.equal((script.match(/'[0-9a-f]{64}'/g) ?? []).length, models.length * 3);
});
