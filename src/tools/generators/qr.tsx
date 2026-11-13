'use client';
/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { FileRejection } from 'react-dropzone';
import { PiArrowSquareOut, PiCopy, PiCheck, PiX } from 'react-icons/pi';
import type QRCodeStyling from 'qr-code-styling';
import DropArea from '@/components/drop-area';
import { saveUrl } from '@/lib/download';
import { useStored } from '@/lib/stored';

type Style = 'square' | 'dots' | 'rounded';
type Content = 'text' | 'wifi';
const STYLES: { value: Style; label: string }[] = [
  { value: 'square', label: '方块' },
  { value: 'rounded', label: '圆角' },
  { value: 'dots', label: '圆点' },
];
const DEFAULTS = { style: 'square' as Style, color: '#000000', transparent: false };
const PREVIEW = 260, EXPORT = 1200;

/** Wi‑Fi 二维码的标准写法，手机相机扫了能直接连。特殊字符要转义。 */
const escapeWifi = (value: string) => value.replace(/([\;,:"])/g, '\\$1');
function wifiPayload({ ssid, password, security, hidden }: { ssid: string; password: string; security: string; hidden: boolean }) {
  if (!ssid) return '';
  return `WIFI:T:${security === 'nopass' ? 'nopass' : security};S:${escapeWifi(ssid)};${security === 'nopass' ? '' : `P:${escapeWifi(password)};`}${hidden ? 'H:true;' : ''};`;
}

/** qr-code-styling 默认按单字节写入，中文会乱码。先转成 UTF-8 字节，扫码时手机按 UTF-8 读回来。 */
const utf8 = (text: string) => Array.from(new TextEncoder().encode(text), byte => String.fromCharCode(byte)).join('');

function options(data: string, style: Style, color: string, transparent: boolean, image: string | undefined, size: number) {
  return {
    width: size, height: size, type: 'canvas' as const, data: utf8(data), margin: Math.round(size / 26), image,
    qrOptions: { errorCorrectionLevel: image ? 'H' as const : 'M' as const },
    dotsOptions: { type: style === 'dots' ? 'dots' as const : style === 'rounded' ? 'rounded' as const : 'square' as const, color, roundSize: true },
    cornersSquareOptions: { type: style === 'square' ? 'square' as const : 'extra-rounded' as const, color },
    cornersDotOptions: { type: style === 'dots' ? 'dot' as const : 'square' as const, color },
    backgroundOptions: { color: transparent ? 'transparent' : '#ffffff' },
    imageOptions: { margin: Math.round(size / 120), imageSize: 0.32, hideBackgroundDots: true },
  };
}

function Generate() {
  const [look, setLook] = useStored('sumerhub.qr', DEFAULTS);
  const [content, setContent] = useState<Content>('text');
  const [text, setText] = useState('');
  const [wifi, setWifi] = useState({ ssid: '', password: '', security: 'WPA', hidden: false });
  const [image, setImage] = useState<string>();
  const [error, setError] = useState('');
  const holder = useRef<HTMLDivElement>(null);
  const qr = useRef<QRCodeStyling | null>(null);
  const logoInput = useRef<HTMLInputElement>(null);

  const data = content === 'wifi' ? wifiPayload(wifi) : text.trim();
  const bytes = new TextEncoder().encode(data).length;
  const tooLong = bytes > (image ? 1200 : 2300);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { default: QRCode } = await import('qr-code-styling');
      if (cancelled || !holder.current) return;
      const next = options(data || 'https://www.ncmswift.xyz', look.style, look.color, look.transparent, image, PREVIEW);
      try {
        if (!qr.current) { qr.current = new QRCode(next); holder.current.replaceChildren(); qr.current.append(holder.current); }
        else qr.current.update(next);
        setError('');
      } catch { setError('内容太长，放不进一个二维码。'); }
    })();
    return () => { cancelled = true; };
  }, [data, look, image]);

  async function download(extension: 'png' | 'svg') {
    const { default: QRCode } = await import('qr-code-styling');
    const big = new QRCode({ ...options(data, look.style, look.color, look.transparent, image, EXPORT), type: extension === 'svg' ? 'svg' : 'canvas' });
    const blob = await big.getRawData(extension) as Blob | null;
    if (!blob) { setError('导出失败，请重试。'); return; }
    const url = URL.createObjectURL(blob);
    saveUrl(url, `qrcode.${extension}`);
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  function pickLogo(file?: File) {
    if (!file) return;
    if (!file.type.startsWith('image/')) { setError('中间只能放图片。'); return; }
    const reader = new FileReader();
    reader.onload = () => setImage(reader.result as string);
    reader.readAsDataURL(file);
  }

  return (
    <div className="qr-make">
      <div className="qr-form">
        <div className="segmented" role="group" aria-label="内容类型">
          <button aria-pressed={content === 'text'} onClick={() => setContent('text')}>文字或网址</button>
          <button aria-pressed={content === 'wifi'} onClick={() => setContent('wifi')}>Wi‑Fi</button>
        </div>
        {content === 'text' ? (
          <textarea className="input area" value={text} onChange={event => setText(event.target.value)} rows={5} placeholder="输入网址或任意文字" aria-label="二维码内容" autoFocus />
        ) : (
          <div className="qr-wifi">
            <input className="input" value={wifi.ssid} onChange={event => setWifi({ ...wifi, ssid: event.target.value })} placeholder="Wi‑Fi 名称" aria-label="Wi‑Fi 名称" autoComplete="off" />
            {wifi.security !== 'nopass' && <input className="input" value={wifi.password} onChange={event => setWifi({ ...wifi, password: event.target.value })} placeholder="密码" aria-label="Wi‑Fi 密码" autoComplete="off" />}
            <div className="qr-wifi-row">
              <select className="select" value={wifi.security} onChange={event => setWifi({ ...wifi, security: event.target.value })} aria-label="加密方式">
                <option value="WPA">WPA / WPA2 / WPA3</option>
                <option value="WEP">WEP</option>
                <option value="nopass">没有密码</option>
              </select>
              <label className="check"><input type="checkbox" checked={wifi.hidden} onChange={event => setWifi({ ...wifi, hidden: event.target.checked })} />隐藏的网络</label>
            </div>
          </div>
        )}

        <div className="qr-options">
          <div className="field">
            <span>样式</span>
            <div className="segmented" role="group" aria-label="样式">
              {STYLES.map(option => <button key={option.value} aria-pressed={look.style === option.value} onClick={() => setLook({ ...look, style: option.value })}>{option.label}</button>)}
            </div>
          </div>
          <label className="field">
            <span>颜色</span>
            <input type="color" className="swatch" value={look.color} onChange={event => setLook({ ...look, color: event.target.value })} aria-label="二维码颜色" />
          </label>
          <div className="field">
            <span>背景</span>
            <div className="segmented" role="group" aria-label="背景">
              <button aria-pressed={!look.transparent} onClick={() => setLook({ ...look, transparent: false })}>白色</button>
              <button aria-pressed={look.transparent} onClick={() => setLook({ ...look, transparent: true })}>透明</button>
            </div>
          </div>
          <div className="field">
            <span>中间</span>
            {image
              ? <span className="qr-logo"><img src={image} alt="" /><button className="icon" onClick={() => setImage(undefined)} aria-label="去掉中间的图"><PiX size={14} /></button></span>
              : <button className="button ghost small" onClick={() => logoInput.current?.click()}>放一张图</button>}
            <input ref={logoInput} type="file" accept="image/*" hidden onChange={event => { pickLogo(event.target.files?.[0]); event.target.value = ''; }} />
          </div>
        </div>
      </div>

      <div className="qr-output">
        <div className={'qr-card' + (look.transparent ? ' checker' : '') + (data ? '' : ' empty')}>
          <div ref={holder} className="qr-canvas" />
        </div>
        <p className="qr-status" role="status">
          {error || (tooLong ? '内容比较长，二维码会很密，可能不好扫。' : data ? `${bytes} 字节` : '先输入内容')}
        </p>
        <div className="qr-actions">
          <button className="button" onClick={() => void download('png')} disabled={!data}>下载 PNG</button>
          <button className="button ghost" onClick={() => void download('svg')} disabled={!data}>SVG</button>
        </div>
      </div>
    </div>
  );
}

type Found = { id: string; name: string; url: string; texts: string[]; error?: string; working: boolean };

function Read() {
  const [items, setItems] = useState<Found[]>([]);
  const [copied, setCopied] = useState('');
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const read = useCallback(async (files: File[], rejected: FileRejection[] = []) => {
    const added = files.map(file => ({ id: crypto.randomUUID(), name: file.name || '粘贴的图片', url: URL.createObjectURL(file), texts: [], working: true }));
    const skipped = rejected.map(({ file }) => ({ id: crypto.randomUUID(), name: file.name, url: '', texts: [], working: false, error: '不是图片' }));
    setItems(previous => [...added, ...skipped, ...previous]);
    if (!added.length) return;
    const { prepareZXingModule, readBarcodes } = await import('zxing-wasm/reader');
    prepareZXingModule({ overrides: { locateFile: (path: string, prefix: string) => path.endsWith('.wasm') ? '/vendor/zxing/' + path : prefix + path } });
    await Promise.all(files.map(async (file, i) => {
      let texts: string[] = [], error: string | undefined;
      try {
        const results = await readBarcodes(file, { tryHarder: true, maxNumberOfSymbols: 8 });
        texts = [...new Set(results.filter(result => result.isValid).map(result => result.text))];
        if (!texts.length) error = '没有找到二维码';
      } catch { error = '读不出这张图'; }
      setItems(previous => previous.map(item => item.id === added[i].id ? { ...item, texts, error, working: false } : item));
    }));
  }, []);

  // 支持直接粘贴截图。
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const files = [...(event.clipboardData?.files ?? [])].filter(file => file.type.startsWith('image/'));
      if (files.length) { event.preventDefault(); void read(files); }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [read]);

  useEffect(() => () => itemsRef.current.forEach(item => item.url && URL.revokeObjectURL(item.url)), []);

  async function copy(text: string) {
    try { await navigator.clipboard.writeText(text); setCopied(text); setTimeout(() => setCopied(''), 1500); } catch { /* 忽略 */ }
  }
  const isLink = (text: string) => /^https?:\/\/\S+$/i.test(text);

  return (
    <div className="qr-read">
      <DropArea accept={{ 'image/*': [] }} compact={items.length > 0} onFiles={read} inputLabel="选择有二维码的图片"
        title="把有二维码的图片拖到这里" hint="截图、照片都可以，也可以直接粘贴（⌘V / Ctrl+V）" compactTitle="继续拖入或粘贴图片" compactButton="再选一张" />
      {items.length > 0 && (
        <ul className="rows qr-found">
          {items.map(item => (
            <li key={item.id} className="row">
              <span className="thumb">{item.url && <img src={item.url} alt="" />}</span>
              <div className="row-text">
                {item.working ? <><strong>{item.name}</strong><span>正在识别…</span></>
                  : item.error ? <><strong>{item.name}</strong><span className="row-error">{item.error}</span></>
                  : item.texts.map(text => <strong key={text} className="qr-text" title={text}>{text}</strong>)}
              </div>
              {item.texts.length === 1 && isLink(item.texts[0]) && (
                <a className="icon" href={item.texts[0]} target="_blank" rel="noopener noreferrer" aria-label="打开链接"><PiArrowSquareOut size={16} /></a>
              )}
              {item.texts.length > 0 && (
                <button className="icon" onClick={() => void copy(item.texts.join('\n'))} aria-label="复制内容">
                  {copied === item.texts.join('\n') ? <PiCheck size={16} /> : <PiCopy size={16} />}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function QrPanel() {
  const [mode, setMode] = useState<'make' | 'read'>('make');
  return (
    <div className="qr">
      <div className="controls">
        <div className="segmented" role="group" aria-label="生成或识别">
          <button aria-pressed={mode === 'make'} onClick={() => setMode('make')}>生成</button>
          <button aria-pressed={mode === 'read'} onClick={() => setMode('read')}>识别</button>
        </div>
      </div>
      {mode === 'make' ? <Generate /> : <Read />}
    </div>
  );
}
