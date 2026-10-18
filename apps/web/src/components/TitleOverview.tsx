import { Breadcrumb } from './Breadcrumb.js';
import { ListControl } from './ListControl.js';
import { Pill } from './Pill.js';
import { posterStyle } from './MockPoster.js';
import { MEDIA_LABEL } from '../labels.js';
import { formatRating } from '../format.js';
import type { TitleDetail } from '../types/title.js';

/** Title page header: poster on the left, name, rating, synopsis, facts and list control on the right. */
export function TitleOverview({ title, breadcrumb }: { title: TitleDetail; breadcrumb: string[] }) {
  const countries = title.countries ?? []; // UI-only fields: real data may omit them
  const facts: { label: string; values: string[] }[] = [
    { label: 'Country', values: countries },
    { label: 'Studio', values: title.studio ? [title.studio] : [] },
    { label: 'Runtime', values: title.runtime ? [title.runtime] : [] },
  ].filter((f) => f.values.length > 0);

  return (
    <section className="mx-auto max-w-[1100px] px-6 pt-32 pb-16 sm:px-8">
      <Breadcrumb items={breadcrumb} inline />

      <div className="mt-7 grid grid-cols-[132px_minmax(0,1fr)] items-end gap-x-4 gap-y-6 md:grid-cols-[minmax(0,340px)_minmax(0,1fr)] md:grid-rows-[auto_1fr] md:items-start md:gap-x-14 md:gap-y-8">
        <div
          role="img"
          aria-label={`Poster for ${title.name}`}
          style={posterStyle(title)}
          className="aspect-[2/3] w-full overflow-hidden rounded-xl border border-line md:row-span-2 md:rounded-2xl"
        />

        <div className="min-w-0 md:col-start-2 md:row-start-1">
          <h1 className="text-3xl leading-tight font-semibold tracking-tight md:text-6xl md:leading-[1.02]">
            {title.name}
          </h1>
          <p className="mt-3 text-sm text-muted md:mt-4">
            {[MEDIA_LABEL[title.mediaType], title.year, title.runtime].filter(Boolean).join(', ')}
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-4 md:mt-6">
            <Pill filled>
              <strong className="font-bold tracking-tight">BingeMate</strong>{' '}
              <span className="text-lg font-bold">{formatRating(title.avgRating)}</span>
            </Pill>
            <span className="hidden text-sm text-muted md:inline">
              {title.reviewCount} {title.reviewCount === 1 ? 'review' : 'reviews'}
            </span>
          </div>
        </div>

        <div className="col-span-2 md:col-span-1 md:col-start-2 md:row-start-2">
          <p className="max-w-[65ch] leading-relaxed text-[#d4d4d4]">{title.synopsis}</p>

          {facts.length > 0 && (
            <dl className="mt-8 grid grid-cols-[5rem_minmax(0,1fr)] items-center gap-x-4 gap-y-3 text-sm">
              {facts.map((f) => (
                <div key={f.label} className="contents">
                  <dt className="text-muted">{f.label}</dt>
                  <dd className="flex flex-wrap gap-2">
                    {f.values.map((v) => (
                      <Pill key={v}>{v}</Pill>
                    ))}
                  </dd>
                </div>
              ))}
            </dl>
          )}

          <div className="mt-8 flex flex-wrap items-center gap-4">
            <ListControl titleId={title.id} titleName={title.name} />
          </div>
          <a href="#reviews" className="mt-8 inline-block text-sm text-muted">
            Scroll for reviews ↓
          </a>
        </div>
      </div>
    </section>
  );
}
