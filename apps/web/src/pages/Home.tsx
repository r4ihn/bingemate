import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { Breadcrumb } from '../components/Breadcrumb.js';
import { posterBackground } from '../components/MockPoster.js';
import { Pill } from '../components/Pill.js';
import { featuredTitle, mockTitles } from '../mocks/titles.js';

// Vertical offsets make the posters settle unevenly, as in the reference
const OFFSETS = ['0px', '-30px', '-10px', '0px', '0px', '-34px', '0px'];

function Hero() {
  const f = featuredTitle;
  return (
    <section
      id="hero"
      className="relative min-h-screen overflow-hidden bg-[radial-gradient(ellipse_60%_55%_at_50%_38%,#ff8a1f_0%,#d9540a_38%,transparent_70%),radial-gradient(ellipse_120%_80%_at_50%_0%,#8c2f06_0%,transparent_70%),linear-gradient(#5a1b04,#1a0702)]"
    >
      <Breadcrumb items={['Main', 'Films', f.person, f.name]} />
      {/* Mock silhouettes stand in for the poster art */}
      {[
        'left-[12%] bottom-[8%] w-[20%] h-[46%]',
        'left-[30%] -bottom-[4%] w-[20%] h-[52%]',
        'left-[44%] bottom-[12%] w-[14%] h-[40%]',
        'left-[56%] -bottom-[2%] w-[20%] h-[48%]',
        'left-[76%] bottom-[10%] w-[14%] h-[36%]',
      ].map((pos) => (
        <div
          key={pos}
          aria-hidden="true"
          className={`absolute ${pos} rounded-t-[50%] rounded-b-lg bg-gradient-to-b from-[#2a0f05] to-[#120502] opacity-85`}
        />
      ))}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-b from-transparent from-55% to-black"
      />

      <h1 className="absolute top-36 left-8 z-10 text-display font-medium md:top-30">
        {f.name
          .replace(': ', ':\n')
          .split('\n')
          .map((line) => (
            <span key={line} className="block">
              {line}
            </span>
          ))}
      </h1>

      <div className="absolute right-8 bottom-52 left-8 z-10 md:top-30 md:right-8 md:bottom-auto md:left-auto md:w-[380px]">
        <p className="leading-relaxed">{f.synopsis}</p>
        <div className="mt-[18px]">
          <Pill filled>
            <strong className="font-bold tracking-tight">BingeMate</strong> {f.rating}
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
        <div className="flex items-center gap-2.5">
          <dt className="min-w-[52px]">Country:</dt>
          {f.countries.map((c) => (
            <dd key={c}>
              <Pill>{c}</Pill>
            </dd>
          ))}
        </div>
        <div className="flex items-center gap-2.5">
          <dt className="min-w-[52px]">Studio:</dt>
          <dd>
            <Pill>{f.studio}</Pill>
          </dd>
        </div>
        <div className="flex items-center gap-2.5">
          <dt className="min-w-[52px]" />
          <dd>
            <Pill>{f.runtime}</Pill>
          </dd>
        </div>
      </dl>

      <a href="#strip" className="absolute right-8 bottom-6 z-10 text-xs text-muted">
        Scroll for filmography ↓
      </a>
    </section>
  );
}

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
      <Breadcrumb items={['Main', 'Films', featuredTitle.person]} />
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
              <span className="absolute top-3 left-2.5 text-[0.65rem] tracking-widest opacity-80">
                {t.year}
              </span>
              <span className="absolute right-2.5 bottom-3.5 left-2.5 text-[1.05rem] leading-none font-bold tracking-tight uppercase">
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
      <Hero />
      <Strip />
    </>
  );
}
