import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { Breadcrumb } from '../components/Breadcrumb.js';
import { posterBackground } from '../components/MockPoster.js';
import { TitleHero } from '../components/TitleHero.js';
import { titlesApi } from '../api/titles.js';
import { StateMessage } from '../components/StateMessage.js';
import { TypeRails } from '../components/TypeRails.js';
import { useAsync } from '../hooks/useAsync.js';
import { MEDIA_SECTION } from '../labels.js';
import type { TitleDetail } from '../types/title.js';

// Temporary: until SJ's trending queries exist (TASKS.md section 6/8), the hero and strip show the
// first approved titles from the titles API
const STRIP_SIZE = 7;

// Vertical offsets make the posters settle unevenly, as in the reference
const OFFSETS = ['0px', '-30px', '-10px', '0px', '0px', '-34px', '0px'];

function Strip({ titles }: { titles: TitleDetail[] }) {
  const ref = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);

  // Stagger the posters in once the strip scrolls into view
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setVisible(true);
          io.disconnect();
        }
      },
      { threshold: 0.35 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <section
      id="strip"
      ref={ref}
      className="relative flex min-h-screen items-center justify-center overflow-hidden bg-black pt-36 pb-12"
    >
      <Breadcrumb items={['Main', 'Trending now']} />
      <ul className="relative z-10 flex max-w-full items-end gap-[22px] overflow-x-auto px-6 pt-[60px] md:overflow-visible">
        {titles.map((t, i) => (
          <li
            key={t.id}
            style={
              {
                transitionDelay: visible ? `${i * 90}ms` : '0ms',
                '--dy': OFFSETS[i % OFFSETS.length],
              } as CSSProperties
            }
            className={`transition-[opacity,translate,scale,filter] duration-700 motion-reduce:translate-x-0 motion-reduce:opacity-100 motion-reduce:transition-none ${
              visible ? 'translate-x-0 opacity-100' : '-translate-x-24 opacity-0'
            }`}
          >
            <Link
              to={`/titles/${t.id}`}
              style={posterBackground(t.hue ?? 210)}
              className="relative block h-[480px] w-[145px] translate-y-[var(--dy)] overflow-hidden rounded-lg brightness-75 grayscale transition-[translate,scale,filter] duration-300 hover:z-10 hover:-translate-y-[34px] hover:scale-105 hover:brightness-100 hover:grayscale-0 focus-visible:-translate-y-[34px] focus-visible:scale-105 focus-visible:brightness-100 focus-visible:grayscale-0"
            >
              <span className="absolute top-3 left-2.5 text-xs tracking-widest opacity-80">
                {t.year}
              </span>
              <span className="absolute right-2.5 bottom-3.5 left-2.5 text-lg leading-none font-bold tracking-tight uppercase">
                {t.name}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function Home() {
  const { state, reload } = useAsync(() => titlesApi.search({ pageSize: STRIP_SIZE + 1 }), []);

  if (state.status !== 'ready' || state.data.items.length === 0) {
    return (
      <div className="mx-auto max-w-[1100px] px-8 pt-32 pb-16">
        {state.status === 'loading' && <StateMessage kind="loading" />}
        {state.status === 'error' && (
          <StateMessage kind="error" detail="Titles could not be loaded." onRetry={reload} />
        )}
        {state.status === 'ready' && (
          <StateMessage kind="empty" title="No titles yet" detail="Check back soon." />
        )}
      </div>
    );
  }

  const [featured, ...rest] = state.data.items as [TitleDetail, ...TitleDetail[]];
  return (
    <>
      <TitleHero
        title={featured}
        breadcrumb={['Main', MEDIA_SECTION[featured.mediaType], featured.name]}
        scrollHint={{ label: 'Scroll for more titles ↓', href: '#strip' }}
      />
      <Strip titles={rest} />
      <TypeRails />
    </>
  );
}
