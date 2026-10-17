import { Fragment } from 'react';

/** Centred breadcrumb; the last item is the current page (white), earlier ones are muted. */
export function Breadcrumb({ items }: { items: string[] }) {
  return (
    <nav
      aria-label="Breadcrumb"
      className="absolute top-[92px] left-1/2 z-10 hidden -translate-x-1/2 gap-3 text-[0.85rem] whitespace-nowrap text-muted md:flex"
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
