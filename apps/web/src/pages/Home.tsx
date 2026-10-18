import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { Breadcrumb } from '../components/Breadcrumb.js';
import { posterBackground } from '../components/MockPoster.js';
import { TypeRails } from '../components/TypeRails.js';
import { TitleHero } from '../components/TitleHero.js';
import { db } from '../mocks/db.js';
import { mockTitles } from '../mocks/titles.js';
import type { TitleDetail } from '../types/title.js';

// Temporary: SJ replaces these with trending data (TASKS.md section 6/8)
const FEATURED = db.titles[1] as TitleDetail;
const PERSON = 'Ines Calloway';

// Vertical offsets make the posters settle unevenly, as in the reference
const OFFSETS = ['0px', '-30px', '-10px', '0px', '0px', '-34px', '0px'];

function Strip() {
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
      className="relative flex min-h-screen items-center justify-center overflow-hidden bg-black"
    >
      <Breadcrumb items={['Main', 'Films', PERSON]} />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute bottom-[-6vw] left-1/2 -translate-x-1/2 text-[27vw] leading-none font-medium tracking-[-0.06em] whitespace-nowrap text-ghost select-none"
      >
        Calloway
      </div>
      <ul className="relative z-10 flex max-w-full items-end gap-[22px] overflow-x-auto px-6 pt-[60px] md:overflow-visible">
        {mockTitles.map((t, i) => (
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
              style={posterBackground(t.hue)}
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
  return (
    <>
      <TitleHero
        title={FEATURED}
        breadcrumb={['Main', 'Films', PERSON, FEATURED.name]}
        scrollHint={{ label: 'Scroll for filmography ↓', href: '#strip' }}
      />
      <Strip />
      <TypeRails />
    </>
  );
}
