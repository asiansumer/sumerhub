'use client';

import { useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import 'dayjs/locale/zh-cn';
import relativeTime from 'dayjs/plugin/relativeTime';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import CopyButton from '@/components/copy-button';

dayjs.extend(utc); dayjs.extend(timezone); dayjs.extend(relativeTime);
dayjs.locale('zh-cn');

const ZONES = ['Asia/Shanghai', 'Europe/London', 'UTC', 'America/New_York', 'America/Los_Angeles', 'Asia/Tokyo', 'Europe/Paris', 'Australia/Sydney'];
const ZONE_NAMES: Record<string, string> = { 'Asia/Shanghai': '北京', 'Europe/London': '伦敦', UTC: 'UTC', 'America/New_York': '纽约', 'America/Los_Angeles': '洛杉矶', 'Asia/Tokyo': '东京', 'Europe/Paris': '巴黎', 'Australia/Sydney': '悉尼' };
const FORMAT = 'YYYY-MM-DD HH:mm:ss';

/** 10 位左右当成秒，13 位左右当成毫秒。 */
function readStamp(text: string) {
  const value = text.trim();
  if (!/^-?\d{1,16}(\.\d+)?$/.test(value)) return null;
  const number = Number(value);
  const unit = Math.abs(number) >= 1e11 ? 'ms' as const : 's' as const;
  const date = dayjs(unit === 'ms' ? number : number * 1000);
  return date.isValid() ? { date, unit } : null;
}

export default function TimePanel() {
  const local = useMemo(() => dayjs.tz.guess(), []);
  const zones = useMemo(() => [local, ...ZONES.filter(zone => zone !== local)], [local]);
  const [now, setNow] = useState(() => Date.now());
  const [stamp, setStamp] = useState('');
  const [picked, setPicked] = useState(() => dayjs().format('YYYY-MM-DDTHH:mm:ss'));
  const [zone, setZone] = useState(local);

  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);

  const read = readStamp(stamp);
  const made = useMemo(() => { const date = dayjs.tz(picked, zone); return date.isValid() ? date : null; }, [picked, zone]);
  const name = (value: string) => ZONE_NAMES[value] ?? value.split('/').pop()!.replace(/_/g, ' ');
  const seconds = Math.floor(now / 1000);

  return (
    <div className="kit">
      <div className="time-now">
        <span className="value-label">现在</span>
        <code>{seconds}</code><CopyButton text={String(seconds)} />
        <span className="time-now-date">{dayjs(now).format(FORMAT)}</span>
        <button className="link" onClick={() => setStamp(String(seconds))}>填到下面</button>
      </div>
      <div className="duo">
        <div className="pane">
          <div className="pane-head"><span>时间戳 → 日期</span>{read && <span className="pane-tag">按{read.unit === 's' ? '秒' : '毫秒'}算</span>}</div>
          <div className="pane-body">
            <input className="input mono" value={stamp} onChange={event => setStamp(event.target.value)} placeholder="1731456000" inputMode="numeric" spellCheck={false} aria-label="时间戳" autoFocus />
            {stamp.trim() && !read && <p className="row-error">这不是时间戳。时间戳是一串数字，比如 {seconds}。</p>}
            {read && (
              <ul className="rows values">
                {zones.slice(0, 4).map((value, index) => (
                  <li key={value} className="row"><span className="value-label">{index === 0 ? `本地（${name(value)}）` : name(value)}</span><code>{read.date.tz(value).format(FORMAT)}</code><CopyButton text={read.date.tz(value).format(FORMAT)} /></li>
                ))}
                <li className="row"><span className="value-label">ISO 8601</span><code>{read.date.toISOString()}</code><CopyButton text={read.date.toISOString()} /></li>
                <li className="row"><span className="value-label">距离现在</span><code>{read.date.from(dayjs(now))}</code></li>
              </ul>
            )}
          </div>
        </div>
        <div className="pane">
          <div className="pane-head"><span>日期 → 时间戳</span></div>
          <div className="pane-body">
            <div className="time-pick">
              <input className="input" type="datetime-local" step={1} value={picked} onChange={event => setPicked(event.target.value)} aria-label="日期和时间" />
              <select className="select" value={zone} onChange={event => setZone(event.target.value)} aria-label="时区">
                {zones.map(value => <option key={value} value={value}>{name(value)}</option>)}
              </select>
            </div>
            {made ? (
              <ul className="rows values">
                <li className="row"><span className="value-label">秒</span><code>{made.unix()}</code><CopyButton text={String(made.unix())} /></li>
                <li className="row"><span className="value-label">毫秒</span><code>{made.valueOf()}</code><CopyButton text={String(made.valueOf())} /></li>
                <li className="row"><span className="value-label">ISO 8601</span><code>{made.toISOString()}</code><CopyButton text={made.toISOString()} /></li>
              </ul>
            ) : <p className="row-error">先选一个日期和时间。</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
