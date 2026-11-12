import Link from 'next/link';

/** 一轮落在地平线上的太阳：sumer → summer。 */
export function SunMark({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className="sun-mark">
      <rect width="32" height="32" rx="9" fill="var(--ink)" />
      <path d="M7 20a9 9 0 0 1 18 0Z" fill="var(--accent)" />
      <rect x="6" y="22" width="20" height="2" rx="1" fill="var(--bg)" />
    </svg>
  );
}

export default function Logo() {
  return (
    <Link href="/" className="logo" aria-label="Sumerhub 首页">
      <SunMark />
      <span>sumer<b>hub</b></span>
    </Link>
  );
}
