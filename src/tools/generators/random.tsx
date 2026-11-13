'use client';

import { useCallback, useEffect, useState } from 'react';
import { customAlphabet, nanoid } from 'nanoid';
import { PiArrowsClockwise } from 'react-icons/pi';
import CopyButton from '@/components/copy-button';
import { useStored } from '@/lib/stored';

type Kind = 'password' | 'uuid' | 'id';
const SETS = {
  upper: { label: 'A–Z', chars: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' },
  lower: { label: 'a–z', chars: 'abcdefghijklmnopqrstuvwxyz' },
  digits: { label: '0–9', chars: '0123456789' },
  symbols: { label: '!@#', chars: '!@#$%^&*-_=+?' },
} as const;
type SetName = keyof typeof SETS;
const LOOKALIKE = /[0OoIl1]/g;
const DEFAULTS = { kind: 'password' as Kind, length: 16, count: 5, upper: true, lower: true, digits: true, symbols: false, clear: true };

/** 密码强度的大概估计：每个字符有多少种可能 × 长度。 */
function strength(alphabet: number, length: number) {
  const bits = Math.log2(Math.max(alphabet, 1)) * length;
  return bits < 50 ? '偏弱' : bits < 80 ? '够用' : '很强';
}

export default function RandomPanel() {
  const [settings, setSettings] = useStored('sumerhub.random', DEFAULTS);
  const [values, setValues] = useState<string[]>([]);
  const [round, setRound] = useState(0);
  const { kind, length, count } = settings;

  let alphabet = (Object.keys(SETS) as SetName[]).filter(name => settings[name]).map(name => SETS[name].chars).join('');
  if (settings.clear) alphabet = alphabet.replace(LOOKALIKE, '');

  const generate = useCallback(() => {
    const make = kind === 'uuid' ? () => crypto.randomUUID() : kind === 'id' ? () => nanoid(length) : alphabet ? customAlphabet(alphabet, length) : () => '';
    setValues(Array.from({ length: count }, make));
  }, [kind, length, count, alphabet]);
  useEffect(generate, [generate, round]);

  const set = (change: Partial<typeof DEFAULTS>) => setSettings({ ...settings, ...change });

  return (
    <div className="kit">
      <div className="controls">
        <div className="field">
          <div className="segmented" role="group" aria-label="生成什么">
            <button aria-pressed={kind === 'password'} onClick={() => set({ kind: 'password' })}>密码</button>
            <button aria-pressed={kind === 'uuid'} onClick={() => set({ kind: 'uuid' })}>UUID</button>
            <button aria-pressed={kind === 'id'} onClick={() => set({ kind: 'id' })} title="网址里能直接用的短编号">短 ID</button>
          </div>
        </div>
        {kind !== 'uuid' && (
          <label className="field">
            <span>长度</span>
            <input type="range" min={kind === 'id' ? 6 : 6} max={kind === 'id' ? 36 : 64} value={length} onChange={event => set({ length: Number(event.target.value) })} />
            <output>{length}</output>
          </label>
        )}
        {kind === 'password' && (
          <>
            <div className="field">
              <span>包含</span>
              <div className="segmented" role="group" aria-label="包含哪些字符">
                {(Object.keys(SETS) as SetName[]).map(name => <button key={name} aria-pressed={settings[name]} onClick={() => set({ [name]: !settings[name] })}>{SETS[name].label}</button>)}
              </div>
            </div>
            <label className="check" title="去掉 0 O o I l 1 这些容易看错的字符"><input type="checkbox" checked={settings.clear} onChange={event => set({ clear: event.target.checked })} />去掉易混字符</label>
          </>
        )}
        <div className="field">
          <span>数量</span>
          <div className="segmented" role="group" aria-label="数量">
            {[1, 5, 10].map(value => <button key={value} aria-pressed={count === value} onClick={() => set({ count: value })}>{value}</button>)}
          </div>
        </div>
      </div>

      <div className="results-head">
        <span>{kind === 'password' ? (alphabet ? `强度：${strength(alphabet.length, length)}` : '至少选一种字符') : kind === 'uuid' ? 'UUID v4' : '短 ID（Nano ID）'}</span>
        <div>
          <button className="link" onClick={() => setRound(round + 1)}><PiArrowsClockwise size={13} style={{ verticalAlign: '-2px', marginRight: 5 }} />换一批</button>
          {values.length > 1 && <CopyButton text={values.join('\n')} label="全部复制" />}
        </div>
      </div>
      <ul className="rows values">
        {values.filter(Boolean).map((value, index) => (
          <li key={index + value} className="row"><code>{value}</code><CopyButton text={value} /></li>
        ))}
      </ul>
    </div>
  );
}
