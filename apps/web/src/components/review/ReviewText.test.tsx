import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FOLD_AT, ReviewText } from './ReviewText.js';

const words = (n: number) => Array.from({ length: n }, (_, i) => `word${i}`).join(' ');

describe('ReviewText', () => {
  it('shows a short review whole, with no button', () => {
    render(<ReviewText text="Short and sweet." />);
    expect(screen.getByText('Short and sweet.')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('does not fold a review of exactly the limit', () => {
    render(<ReviewText text={'a'.repeat(FOLD_AT)} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('folds a longer review at a word boundary and unfolds on request', async () => {
    const text = words(300); // far over the limit
    render(<ReviewText text={text} />);
    const u = userEvent.setup();
    const shown = screen.getByText(/^word0 /).textContent as string;
    expect(shown.endsWith('…')).toBe(true);
    expect(shown.length).toBeLessThanOrEqual(FOLD_AT + 1);
    expect(shown.slice(0, -1)).toMatch(/word\d+$/); // ends on a whole word, not halfway through one

    const more = screen.getByRole('button', { name: 'Read more of this review' });
    expect(more).toHaveAttribute('aria-expanded', 'false');
    await u.click(more);
    expect(screen.getByText(text)).toBeInTheDocument();
    const less = screen.getByRole('button', { name: 'Show less' });
    expect(less).toHaveAttribute('aria-expanded', 'true');
    await u.click(less);
    expect(screen.queryByText(text)).not.toBeInTheDocument();
  });

  it('points the button at the text it controls', () => {
    render(<ReviewText text={words(300)} />);
    const button = screen.getByRole('button');
    expect(document.getElementById(button.getAttribute('aria-controls') as string)).toBe(
      screen.getByText(/^word0 /),
    );
  });

  it('cuts a text with no spaces at the limit instead of failing', () => {
    render(<ReviewText text={'x'.repeat(FOLD_AT * 3)} />);
    expect(screen.getByText(/^x+…$/).textContent).toHaveLength(FOLD_AT + 1);
  });

  it('keeps line breaks and wraps long unbroken text rather than widening the card', () => {
    render(<ReviewText text={'line one\n\nline two'} />);
    const p = screen.getByText(/line one/);
    expect(p).toHaveClass('whitespace-pre-line');
    expect(p).toHaveClass('break-words');
    expect(p.textContent).toBe('line one\n\nline two');
  });
});
