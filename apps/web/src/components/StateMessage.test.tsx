import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StateMessage } from './StateMessage.js';

describe('StateMessage', () => {
  it('error calls onRetry when Retry is clicked', async () => {
    const onRetry = vi.fn();
    render(<StateMessage kind="error" onRetry={onRetry} />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('loading is announced with role=status and has no Retry button', () => {
    render(<StateMessage kind="loading" />);
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('empty shows a custom title and detail', () => {
    render(<StateMessage kind="empty" title="No reviews yet" detail="Be the first." />);
    expect(screen.getByRole('heading', { name: 'No reviews yet' })).toBeInTheDocument();
    expect(screen.getByText('Be the first.')).toBeInTheDocument();
  });
});
