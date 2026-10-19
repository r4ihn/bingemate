import { Fragment } from 'react';

/** Centred breadcrumb; the last item is the current page (white), earlier ones are muted. */
/** `inline` keeps it in the page flow (the title page); otherwise it is pinned under the dock. */
export function Breadcrumb({ items, inline = false }: { items: string[]; inline?: boolean }) {
  return (
    <nav
      aria-label="Breadcrumb"
      className={
        inline
          ? 'flex flex-wrap gap-3 text-sm text-muted'
          : 'absolute top-[92px] left-1/2 z-10 hidden -translate-x-1/2 gap-3 text-sm whitespace-nowrap text-muted md:flex'
      }
    >
      {items.map((item, i) => (
        <Fragment key={item}>
          {i > 0 && <span aria-hidden="true">›</span>}
          <span className={i === items.length - 1 ? 'font-medium text-white' : undefined}>
            {item}
          </span>
        </Fragment>
      ))}
    </nav>
  );
}
