import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StarRating, StarsDisplay } from './StarRating.js';

describe('StarRating', () => {
  it('is a labelled group of five radios, none chosen at first', () => {
    render(<StarRating value={0} onChange={vi.fn()} />);
    const group = screen.getByRole('radiogroup', { name: 'Your rating' });
    expect(group).toBeInTheDocument();
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(5);
    expect(radios.every((r) => !(r as HTMLInputElement).checked)).toBe(true);
    expect(screen.getByText('Tap a star')).toBeInTheDocument();
  });

  it('clicking a star reports that number', async () => {
    const onChange = vi.fn();
    render(<StarRating value={0} onChange={onChange} />);
    await userEvent.setup().click(screen.getByRole('radio', { name: '4 stars' }));
    expect(onChange).toHaveBeenCalledWith(4);
  });

  it('names the chosen value in words', () => {
    render(<StarRating value={4} onChange={vi.fn()} />);
    expect(screen.getByRole('radio', { name: '4 stars' })).toBeChecked();
    expect(screen.getByText('Liked it')).toBeInTheDocument();
  });

  it('hovering a star previews its word without choosing it', async () => {
    const onChange = vi.fn();
    render(<StarRating value={0} onChange={onChange} />);
    await userEvent.setup().hover(screen.getByTestId('star-5'));
    expect(screen.getByText('Loved it')).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('arrow keys move the choice', async () => {
    const onChange = vi.fn();
    render(<StarRating value={3} onChange={onChange} />);
    const user = userEvent.setup();
    screen.getByRole('radio', { name: '3 stars' }).focus();
    await user.keyboard('{ArrowRight}');
    expect(onChange).toHaveBeenCalledWith(4);
  });

  it('shows an error under the stars', () => {
    render(<StarRating value={0} onChange={vi.fn()} error="Choose a rating from 1 to 5 stars" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Choose a rating from 1 to 5 stars');
  });
});

describe('StarsDisplay', () => {
  it('reads as an image with the rating in words for screen readers', () => {
    render(<StarsDisplay value={4} />);
    expect(screen.getByRole('img', { name: '4 out of 5 stars' })).toBeInTheDocument();
  });
});
