import type { ReactNode } from 'react';

/** Pill-shaped toggle used for tabs and filters (docs/ui.md B4). */
export function FilterPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`min-h-11 cursor-pointer rounded-full border px-[18px] text-sm transition-colors ${
        active
          ? 'border-white bg-white text-black'
          : 'border-field text-muted hover:border-white hover:text-white'
      }`}
    >
      {children}
    </button>
  );
}
