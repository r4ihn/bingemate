import { useEffect, useId, useRef, useState } from 'react';
import type { FocusEvent, KeyboardEvent } from 'react';

export interface DropdownOption {
  value: string;
  label: string;
  tone?: 'danger';
}

/**
 * A select drawn by the page instead of the browser, so the open menu matches the site and stays
 * under its button on a phone. The ARIA "select-only combobox" pattern: the trigger is a combobox
 * button, the menu a listbox. Arrow keys move, Enter/Space choose, Escape closes and returns focus.
 */
export function Dropdown({
  label,
  value,
  options,
  placeholder = '',
  onChange,
  disabled = false,
  className = '',
}: {
  /** Accessible name of the control, e.g. "Status for Heat". */
  label: string;
  /** The chosen option's value, or '' when nothing is chosen yet. */
  value: string;
  options: DropdownOption[];
  /** Shown on the button while nothing is chosen. */
  placeholder?: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  /** Shape and size of the button (rounding, text size). */
  className?: string;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const selected = options.findIndex((o) => o.value === value);
  const shown = options[selected]?.label ?? placeholder;

  function show() {
    setActive(Math.max(selected, 0));
    setOpen(true);
  }

  function close() {
    setOpen(false);
    button.current?.focus();
  }

  function pick(index: number) {
    const option = options[index];
    close();
    if (option && option.value !== value) onChange(option.value);
  }

  // Focus the menu when it opens so the arrow keys work, and close it on a press outside
  useEffect(() => {
    if (!open) return;
    list.current?.focus();
    const away = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [open]);

  function onButtonKey(e: KeyboardEvent) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      show();
    }
  }

  function onListKey(e: KeyboardEvent) {
    const last = options.length - 1;
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActive((i) => Math.min(i + 1, last));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActive((i) => Math.max(i - 1, 0));
        break;
      case 'Home':
        e.preventDefault();
        setActive(0);
        break;
      case 'End':
        e.preventDefault();
        setActive(last);
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        pick(active);
        break;
      case 'Escape':
        e.preventDefault();
        close();
        break;
      case 'Tab':
        // Put focus back on the button first: the menu unmounts, and a focused element that vanishes
        // would send Tab back to the top of the page. The browser then moves on from the button.
        button.current?.focus();
        setOpen(false);
        break;
    }
  }

  // Focus leaving the control by any other route (a click elsewhere, a screen reader) closes the menu
  function onBlur(e: FocusEvent) {
    if (!root.current?.contains(e.relatedTarget as Node | null)) setOpen(false);
  }

  return (
    <div ref={root} onBlur={onBlur} className="relative">
      <button
        ref={button}
        type="button"
        role="combobox"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id}-menu`}
        disabled={disabled}
        onClick={() => (open ? close() : show())}
        onKeyDown={onButtonKey}
        className={`inline-flex min-h-11 w-full cursor-pointer items-center justify-between gap-3 border border-field bg-bg px-4 py-2 text-left font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      >
        <span className={selected < 0 ? 'text-muted' : ''}>{shown}</span>
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          className={`h-4 w-4 shrink-0 fill-none stroke-current transition-transform motion-reduce:transition-none ${
            open ? 'rotate-180' : ''
          }`}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <ul
          ref={list}
          id={`${id}-menu`}
          role="listbox"
          tabIndex={-1}
          aria-label={label}
          aria-activedescendant={`${id}-${active}`}
          onKeyDown={onListKey}
          className="absolute left-0 z-30 mt-2 w-max min-w-full max-w-[calc(100vw-2rem)] rounded-2xl border border-line bg-surface p-1 shadow-xl shadow-black/60 outline-none"
        >
          {options.map((o, i) => (
            <li
              key={o.value}
              id={`${id}-${i}`}
              role="option"
              aria-selected={i === selected}
              onClick={() => pick(i)}
              onMouseEnter={() => setActive(i)}
              className={`flex min-h-11 cursor-pointer items-center justify-between gap-4 rounded-xl px-4 text-sm font-semibold ${
                o.tone === 'danger' ? 'text-danger' : 'text-white'
              } ${i === active ? 'bg-surface-2' : ''}`}
            >
              {o.label}
              {i === selected && (
                <svg
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                  className="h-4 w-4 shrink-0 fill-none stroke-accent"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M5 12.5l4.5 4.5L19 7.5" />
                </svg>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
