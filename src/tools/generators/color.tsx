'use client';

import { useMemo, useState } from 'react';
import Color from 'color';
import CopyButton from '@/components/copy-button';
import { useStored } from '@/lib/stored';

const round = (value: number, digits = 0) => +value.toFixed(digits);

function parse(text: string) {
  const value = text.trim();
  if (!value) return null;
  // 允许不带 # 的十六进制写法。
  for (const candidate of [value, /^[0-9a-f]{3,8}$/i.test(value) ? '#' + value : '']) {
    if (!candidate) continue;
    try { return Color(candidate); } catch { /* 试下一种 */ }
  }
  return null;
}

export default function ColorPanel() {
  const [saved, setSaved] = useStored('sumerhub.color', { text: '#5fb37c' });
  const [draft, setDraft] = useState<string | null>(null);
  const text = draft ?? saved.text;
  const color = useMemo(() => parse(text), [text]);
  const set = (value: string) => { setDraft(null); setSaved({ text: value }); };

  const formats = useMemo(() => {
    if (!color) return [];
    const alpha = color.alpha();
    const [r, g, b] = color.rgb().array().map(value => Math.round(value));
    const [h, s, l] = color.hsl().array();
    const [, w, k] = color.hwb().array();
    const [c, m, y, key] = color.cmyk().array();
    const a = alpha < 1 ? ` / ${round(alpha, 2)}` : '';
    return [
      { label: 'HEX', value: (alpha < 1 ? color.hexa() : color.hex()).toLowerCase() },
      { label: 'RGB', value: `rgb(${r} ${g} ${b}${a})` },
      { label: 'HSL', value: `hsl(${round(h)} ${round(s)}% ${round(l)}%${a})` },
      { label: 'HWB', value: `hwb(${round(h)} ${round(w)}% ${round(k)}%${a})` },
      { label: 'CMYK', value: `${round(c)}% ${round(m)}% ${round(y)}% ${round(key)}%` },
    ];
  }, [color]);

  // 同一个色相从浅到深的一排，点一下就换过去。
  const shades = useMemo(() => color ? [92, 80, 68, 56, 44, 32, 20, 10].map(lightness => color.hsl().lightness(lightness).alpha(1).hex().toLowerCase()) : [], [color]);
  const onWhite = color ? color.alpha(1).contrast(Color('#ffffff')) : 0;
  const onBlack = color ? color.alpha(1).contrast(Color('#000000')) : 0;
  const grade = (ratio: number) => ratio >= 7 ? '很清楚' : ratio >= 4.5 ? '清楚' : ratio >= 3 ? '大字可以' : '看不清';

  return (
    <div className="kit color-kit">
      <div className="color-top">
        <label className={'color-chip' + (color ? '' : ' none')} style={color ? { background: color.string() } : undefined}>
          <input type="color" value={color ? color.alpha(1).hex() : '#000000'} onChange={event => set(event.target.value)} aria-label="取色" />
          <span style={color ? { color: color.isLight() ? '#000' : '#fff' } : undefined}>{color ? '点这里取色' : '认不出这个颜色'}</span>
        </label>
        <div className="color-side">
          <input className="input" value={text} onChange={event => { setDraft(event.target.value); if (parse(event.target.value)) setSaved({ text: event.target.value }); }} onBlur={() => setDraft(null)}
            placeholder="#5fb37c、rgb(95 179 124)、hsl(141 36% 54%)、tomato" spellCheck={false} autoCapitalize="off" aria-label="颜色" />
          <ul className="rows values">
            {formats.map(format => (
              <li key={format.label} className="row"><span className="value-label">{format.label}</span><code>{format.value}</code><CopyButton text={format.value} /></li>
            ))}
          </ul>
        </div>
      </div>
      {color && (
        <div className="color-more">
          <div className="shades" role="group" aria-label="深浅">
            {shades.map(shade => <button key={shade} style={{ background: shade }} onClick={() => set(shade)} title={shade} aria-label={shade} />)}
          </div>
          <dl className="facts inline">
            <div><dt>配白字</dt><dd><i style={{ background: color.alpha(1).hex(), color: '#fff' }}>文字</i>{round(onWhite, 2)} : 1<em>{grade(onWhite)}</em></dd></div>
            <div><dt>配黑字</dt><dd><i style={{ background: color.alpha(1).hex(), color: '#000' }}>文字</i>{round(onBlack, 2)} : 1<em>{grade(onBlack)}</em></dd></div>
          </dl>
        </div>
      )}
    </div>
  );
}
