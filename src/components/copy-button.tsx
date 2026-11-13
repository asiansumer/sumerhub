'use client';

import { useState } from 'react';
import { PiCheck, PiCopy } from 'react-icons/pi';

/** 复制一段文字。传 label 就是带字的按钮，不传是一个小图标。 */
export default function CopyButton({ text, label, disabled }: { text: string | (() => string); label?: string; disabled?: boolean }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(typeof text === 'function' ? text() : text);
      setCopied(true); setTimeout(() => setCopied(false), 1400);
    } catch { /* 浏览器不让复制时什么都不做 */ }
  }
  return label
    ? <button className="button ghost small" onClick={copy} disabled={disabled}>{copied ? '已复制' : label}</button>
    : <button className="icon" onClick={copy} disabled={disabled} aria-label="复制">{copied ? <PiCheck size={15} /> : <PiCopy size={15} />}</button>;
}
