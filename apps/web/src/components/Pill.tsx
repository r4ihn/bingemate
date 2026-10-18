import type { ReactNode } from 'react';

/** Outlined pill used for tags (country, studio, runtime). Filled variant is the rating pill. */
export function Pill({ children, filled = false }: { children: ReactNode; filled?: boolean }) {
  const base = 'inline-flex items-center gap-2 rounded-full px-[18px] py-2 text-sm';
  return (
    <span
      className={
        filled ? `${base} bg-accent font-medium text-accent-ink` : `${base} border border-white`
      }
    >
      {children}
    </span>
  );
}
