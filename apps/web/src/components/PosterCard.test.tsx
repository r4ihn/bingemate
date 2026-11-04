import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, screen } from '@testing-library/react';
import { renderWithProviders } from '../test/utils.js';
import { PosterCard } from './PosterCard.js';

const title = {
  id: 't1',
  name: 'Heat',
  year: 1995,
  posterUrl: 'https://img.test/heat.jpg',
} as Parameters<typeof PosterCard>[0]['title'];

/** Stands in for the browser's Image so a test decides whether the poster loads. */
function stubImage() {
  const probes: { onerror: (() => void) | null; src: string }[] = [];
  vi.stubGlobal(
    'Image',
    class {
      onerror: (() => void) | null = null;
      src = '';
      constructor() {
        probes.push(this);
      }
    },
  );
  return probes;
}

afterEach(() => vi.unstubAllGlobals());

describe('PosterCard', () => {
  it('shows the image, not the name overlay, when the poster loads', () => {
    stubImage();
    renderWithProviders(<PosterCard title={title} />);
    const link = screen.getByRole('link', { name: 'Heat' });
    expect(link.style.background).toContain('https://img.test/heat.jpg');
    expect(screen.getByText('Heat')).toHaveClass('sr-only');
    expect(screen.queryByText('1995')).not.toBeInTheDocument();
  });

  it('falls back to the gradient with the name and year when the image fails', () => {
    const probes = stubImage();
    renderWithProviders(<PosterCard title={title} />);
    act(() => probes[0]?.onerror?.());
    const link = screen.getByRole('link', { name: /Heat/ });
    expect(link.style.background).not.toContain('img.test');
    expect(screen.getByText('Heat')).not.toHaveClass('sr-only');
    expect(screen.getByText('1995')).toBeInTheDocument();
  });

  it('draws the gradient and overlay when the title has no poster', () => {
    renderWithProviders(
      <PosterCard title={{ id: 't2', name: 'Heat', year: 1995 } as typeof title} />,
    );
    expect(screen.getByText('1995')).toBeInTheDocument();
  });
});
