import { useEffect, useId, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import type { MediaType } from '@bingemate/shared';
import { titlesApi } from '../api/titles.js';
import { useAsync } from '../hooks/useAsync.js';
import { MEDIA_FILTERS, MEDIA_LABEL } from '../labels.js';
import type { TitleDetail } from '../types/title.js';
import { posterBackground } from './MockPoster.js';

const MAX_SUGGESTIONS = 5;
const DEBOUNCE_MS = 150;

const SEARCH_ICON =
  'M10 2a8 8 0 105 14.3l5.4 5.4 1.4-1.4-5.4-5.4A8 8 0 0010 2zm0 2a6 6 0 110 12 6 6 0 010-12z';

/**
 * Dock search: a button that expands into a combobox with quick matches. Choosing a match opens
 * the title; Enter or "See all" opens Browse with the query (and media type) in the URL.
 */
export function NavSearch() {
  const navigate = useNavigate();
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [term, setTerm] = useState('');
  const [scope, setScope] = useState<MediaType | undefined>(undefined);
  const [scopeMenu, setScopeMenu] = useState(false);
  const [active, setActive] = useState(-1);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef(false);

  const scopeLabel = MEDIA_FILTERS.find((f) => f.value === scope)?.label ?? 'All';
  const trimmed = query.trim();

  // Wait for a pause in typing before asking for matches
  useEffect(() => {
    const id = setTimeout(() => setTerm(trimmed), DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [trimmed]);

  // Results are tagged with the scope and term they answer, so a stale result is never shown for a newer one
  const { state } = useAsync(async () => {
    const key = `${scope ?? ''}|${term}`;
    if (!term) return { key, items: [] as TitleDetail[] };
    const page = await titlesApi.search({ q: term, type: scope, pageSize: MAX_SUGGESTIONS });
    return { key, items: page.items };
  }, [term, scope]);
  const fresh = state.status === 'ready' && state.data.key === `${scope ?? ''}|${trimmed}`;
  const items = fresh && trimmed ? state.data.items : [];
  const showList = open && trimmed !== '' && fresh;
  const rowCount = items.length + 1; // the last row is "See all results"

  useEffect(() => {
    if (open) inputRef.current?.focus();
    else if (returnFocus.current) {
      returnFocus.current = false;
      buttonRef.current?.focus();
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) close(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  function close(restoreFocus: boolean) {
    returnFocus.current = restoreFocus;
    setOpen(false);
    setScopeMenu(false);
    setQuery('');
    setTerm('');
    setActive(-1);
  }

  function seeAll() {
    if (!trimmed) return;
    const p = new URLSearchParams({ q: trimmed });
    if (scope) p.set('type', scope);
    close(false);
    navigate(`/browse?${p.toString()}`);
  }

  function openTitle(t: TitleDetail) {
    close(false);
    navigate(`/titles/${t.id}`);
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      close(true);
    } else if (e.target !== inputRef.current) {
      return;
    } else if (e.key === 'ArrowDown' && showList) {
      e.preventDefault();
      setActive((a) => (a + 1) % rowCount);
    } else if (e.key === 'ArrowUp' && showList) {
      e.preventDefault();
      setActive((a) => (a <= 0 ? rowCount - 1 : a - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const picked = items[active];
      if (picked) openTitle(picked);
      else seeAll();
    }
  }

  if (!open) {
    return (
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-[46px] w-[54px] cursor-pointer flex-col items-center justify-center gap-[3px] rounded-[10px] bg-white/[0.06] text-[0.5rem] text-white/60 transition-colors hover:bg-white/15"
      >
        <svg viewBox="0 0 24 24" className="h-[15px] w-[15px] fill-white" aria-hidden="true">
          <path d={SEARCH_ICON} />
        </svg>
        Search
      </button>
    );
  }

  return (
    <>
      {/* Keeps the dock the same width while the bar covers it on small screens */}
      <span aria-hidden="true" className="h-[46px] w-[54px] flex-none lg:hidden" />
      <div
        ref={wrapRef}
        onKeyDown={onKeyDown}
        className="absolute inset-0 z-10 rounded-[14px] bg-surface p-1.5 lg:static lg:inset-auto lg:w-[30rem] lg:bg-transparent lg:p-0"
      >
        <div className="relative flex h-[46px] items-center gap-2 rounded-[10px] border border-accent bg-white/[0.08] pr-3 pl-2">
          <button
            type="button"
            aria-label={`Search scope: ${scopeLabel}`}
            aria-haspopup="menu"
            aria-expanded={scopeMenu}
            onClick={() => setScopeMenu((m) => !m)}
            className="h-[30px] cursor-pointer rounded-lg bg-white/[0.12] px-2 text-[0.75rem] font-medium"
          >
            {scopeLabel} ▾
          </button>
          <svg viewBox="0 0 24 24" className="h-4 w-4 flex-none fill-muted" aria-hidden="true">
            <path d={SEARCH_ICON} />
          </svg>
          <input
            ref={inputRef}
            role="combobox"
            aria-label="Search titles"
            aria-expanded={showList}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={showList && active >= 0 ? `${listId}-${active}` : undefined}
            value={query}
            placeholder={scope ? `Search ${scopeLabel.toLowerCase()}` : 'Search titles'}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(-1);
            }}
            className="min-w-0 flex-1 bg-transparent text-[0.875rem] outline-none placeholder:text-muted"
          />
          <kbd className="hidden rounded border border-line px-1.5 py-0.5 text-[0.6rem] text-muted sm:block">
            Esc
          </kbd>

          {scopeMenu && (
            <div
              role="menu"
              aria-label="Search scope"
              className="absolute top-[54px] left-0 z-20 w-44 rounded-xl border border-line bg-surface p-1.5"
            >
              {MEDIA_FILTERS.map((f) => (
                <button
                  key={f.label}
                  type="button"
                  role="menuitemradio"
                  aria-checked={f.value === scope}
                  onClick={() => {
                    setScope(f.value);
                    setScopeMenu(false);
                    inputRef.current?.focus();
                  }}
                  className="flex w-full cursor-pointer items-center justify-between rounded-lg px-2.5 py-2 text-left text-[0.8rem] hover:bg-white/10"
                >
                  {f.label}
                  {f.value === scope && <span aria-hidden="true">✓</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        {showList && (
          <ul
            id={listId}
            role="listbox"
            aria-label="Suggestions"
            className="absolute top-full right-0 left-0 mt-2 rounded-[14px] border border-line bg-surface p-1.5 lg:top-[54px] lg:mt-0"
          >
            {items.map((t, i) => (
              <li
                key={t.id}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={active === i}
                onMouseEnter={() => setActive(i)}
                onClick={() => openTitle(t)}
                className={`flex cursor-pointer items-center gap-3 rounded-[10px] p-2 ${
                  active === i ? 'bg-white/10' : ''
                }`}
              >
                <span
                  aria-hidden="true"
                  style={
                    t.posterUrl
                      ? { background: `center / cover url(${t.posterUrl})` }
                      : posterBackground(t.hue ?? 210)
                  }
                  className="h-[50px] w-[34px] flex-none rounded-md"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[0.875rem] font-semibold">{t.name}</span>
                  <span className="block text-[0.75rem] text-muted">
                    {t.year !== undefined && `${t.year} · `}
                    {MEDIA_LABEL[t.mediaType]}
                  </span>
                </span>
              </li>
            ))}
            <li
              id={`${listId}-${items.length}`}
              role="option"
              aria-selected={active === items.length}
              onMouseEnter={() => setActive(items.length)}
              onClick={seeAll}
              className={`mt-1 cursor-pointer rounded-[10px] border-t border-line px-2.5 py-3 text-[0.8125rem] font-medium text-accent ${
                active === items.length ? 'bg-white/10' : ''
              }`}
            >
              See all results for “{trimmed}” →
            </li>
          </ul>
        )}
      </div>
    </>
  );
}
