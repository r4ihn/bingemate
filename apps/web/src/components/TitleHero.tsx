import { Breadcrumb } from './Breadcrumb.js';
import { Pill } from './Pill.js';
import { formatRating } from '../format.js';
import type { TitleDetail } from '../types/title.js';

const SILHOUETTES = [
  'left-[12%] bottom-[8%] w-[20%] h-[46%]',
  'left-[30%] -bottom-[4%] w-[20%] h-[52%]',
  'left-[44%] bottom-[12%] w-[14%] h-[40%]',
  'left-[56%] -bottom-[2%] w-[20%] h-[48%]',
  'left-[76%] bottom-[10%] w-[14%] h-[36%]',
];

/** Full-bleed title hero from the reference design (docs/ui.md A5). Colours follow the title's hue. */
export function TitleHero({
  title,
  breadcrumb,
  scrollHint,
}: {
  title: TitleDetail;
  breadcrumb: string[];
  scrollHint?: { label: string; href: string };
}) {
  const h = title.hue ?? 25;
  const countries = title.countries ?? []; // UI-only field: real data may omit it
  const background = [
    `radial-gradient(ellipse 60% 55% at 50% 38%, hsl(${h} 100% 56%) 0%, hsl(${h} 92% 44%) 38%, transparent 70%)`,
    `radial-gradient(ellipse 120% 80% at 50% 0%, hsl(${h} 90% 28%) 0%, transparent 70%)`,
    `linear-gradient(hsl(${h} 75% 19%), hsl(${h} 70% 6%))`,
  ].join(', ');

  return (
    <section id="hero" className="relative min-h-screen overflow-hidden" style={{ background }}>
      <Breadcrumb items={breadcrumb} />
      {/* Mock silhouettes stand in for the poster art */}
      {SILHOUETTES.map((pos) => (
        <div
          key={pos}
          aria-hidden="true"
          className={`absolute ${pos} rounded-t-[50%] rounded-b-lg bg-gradient-to-b from-black/50 to-black/80 opacity-85`}
        />
      ))}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-b from-transparent from-55% to-black"
      />

      <h1 className="absolute top-36 left-8 z-10 text-display font-medium md:top-30">
        {title.name
          .replace(': ', ':\n')
          .split('\n')
          .map((line) => (
            <span key={line} className="block">
              {line}
            </span>
          ))}
      </h1>

      <div className="absolute right-8 bottom-52 left-8 z-10 md:top-30 md:right-8 md:bottom-auto md:left-auto md:w-[380px]">
        <p className="leading-relaxed">{title.synopsis}</p>
        <div className="mt-[18px]">
          <Pill filled>
            <strong className="font-bold tracking-tight">BingeMate</strong>{' '}
            {formatRating(title.avgRating)}
          </Pill>
        </div>
      </div>

      <button
        type="button"
        aria-label="Play trailer"
        className="absolute top-1/2 left-1/2 z-10 grid h-[110px] w-[110px] -translate-x-1/2 -translate-y-1/2 cursor-pointer place-items-center rounded-full bg-[rgb(120_100_90/0.6)] backdrop-blur-md"
      >
        <svg viewBox="0 0 24 24" className="ml-1 h-[34px] w-[34px] fill-white" aria-hidden="true">
          <path d="M6 3l15 9-15 9z" />
        </svg>
      </button>

      <dl className="absolute bottom-28 left-8 z-10 grid gap-2.5 text-[0.8rem]">
        {countries.length > 0 && (
          <div className="flex items-center gap-2.5">
            <dt className="min-w-[52px]">Country:</dt>
            {countries.map((c) => (
              <dd key={c}>
                <Pill>{c}</Pill>
              </dd>
            ))}
          </div>
        )}
        {title.studio && (
          <div className="flex items-center gap-2.5">
            <dt className="min-w-[52px]">Studio:</dt>
            <dd>
              <Pill>{title.studio}</Pill>
            </dd>
          </div>
        )}
        {title.runtime && (
          <div className="flex items-center gap-2.5">
            <dt className="min-w-[52px]" />
            <dd>
              <Pill>{title.runtime}</Pill>
            </dd>
          </div>
        )}
      </dl>

      {scrollHint && (
        <a href={scrollHint.href} className="absolute right-8 bottom-6 z-10 text-xs text-muted">
          {scrollHint.label}
        </a>
      )}
    </section>
  );
}
