'use client';

import { useCallback, useEffect, useState, type SetStateAction } from 'react';

/** 记在浏览器里的设置（下次打开还在）。读写失败（无痕模式等）时就当没有。 */
export function useStored<T extends object>(key: string, fallback: T) {
  const [value, setValue] = useState<T>(fallback);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(key);
      if (saved) setValue({ ...fallback, ...JSON.parse(saved) });
    } catch { /* 用默认值 */ }
    // 只在打开时读一次。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const set = useCallback((next: SetStateAction<T>) => {
    setValue(previous => {
      const value = typeof next === 'function' ? (next as (previous: T) => T)(previous) : next;
      try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* 忽略 */ }
      return value;
    });
  }, [key]);
  return [value, set] as const;
}
