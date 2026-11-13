'use client';

import { useMemo, useState } from 'react';
import { jwtDecode } from 'jwt-decode';
import CopyButton from '@/components/copy-button';
import Code from './highlight';

const TIMES: Record<string, string> = { iat: '签发时间', nbf: '生效时间', exp: '过期时间', auth_time: '登录时间' };
const stamp = (seconds: number) => new Date(seconds * 1000).toLocaleString('zh-CN', { hour12: false });

export default function JwtPanel() {
  const [token, setToken] = useState('');

  const result = useMemo(() => {
    const value = token.trim().replace(/^Bearer\s+/i, '');
    if (!value) return null;
    try {
      const header = jwtDecode<Record<string, unknown>>(value, { header: true });
      const payload = jwtDecode<Record<string, unknown>>(value);
      return { header, payload };
    } catch { return { error: '这不是一个能读的 JWT。它应该是用两个点分成三段的一长串字符。' }; }
  }, [token]);

  const payload = result && 'payload' in result ? result.payload! : null;
  const times = payload ? Object.keys(TIMES).filter(key => typeof payload[key] === 'number') : [];
  const exp = payload && typeof payload.exp === 'number' ? payload.exp : null;
  const expired = exp !== null && exp * 1000 < Date.now();

  return (
    <div className="kit">
      <div className="duo">
        <div className="pane">
          <div className="pane-head"><span>JWT</span>{token && <button className="link" onClick={() => setToken('')}>清空</button>}</div>
          <textarea className="code-in wrap" value={token} onChange={event => setToken(event.target.value)} placeholder="把 JWT 粘贴到这里（eyJ 开头的一长串）" spellCheck={false} aria-label="JWT 输入" autoFocus />
        </div>
        <div className="pane">
          {!result ? <><div className="pane-head"><span>内容</span></div><pre className="code-out empty">里面装的内容会出现在这里</pre></>
            : 'error' in result ? <><div className="pane-head"><span>读不出来</span></div><div className="pane-problem"><p className="row-error">{result.error}</p></div></>
            : (
              <>
                {times.length > 0 && (
                  <dl className="facts">
                    {times.map(key => (
                      <div key={key}><dt>{TIMES[key]}</dt><dd>{stamp(payload![key] as number)}{key === 'exp' && <em className={expired ? 'bad' : 'good'}>{expired ? '已过期' : '还有效'}</em>}</dd></div>
                    ))}
                  </dl>
                )}
                <div className="pane-head"><span>内容（payload）</span><CopyButton text={JSON.stringify(result.payload, null, 2)} label="复制" /></div>
                <Code code={JSON.stringify(result.payload, null, 2)} language="json" />
                <div className="pane-head sub"><span>头部（header）</span></div>
                <Code code={JSON.stringify(result.header, null, 2)} language="json" />
              </>
            )}
        </div>
      </div>
    </div>
  );
}
