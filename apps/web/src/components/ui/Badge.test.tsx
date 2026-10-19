import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ListStatus, TitleStatus } from '@bingemate/shared';
import { StatusBadge } from './Badge.js';

describe('StatusBadge', () => {
  it('shows "In progress" for IN_PROGRESS', () => {
    render(<StatusBadge status={ListStatus.IN_PROGRESS} />);
    expect(screen.getByText('In progress')).toBeInTheDocument();
  });

  it('colours PENDING as warn and REJECTED as danger', () => {
    render(
      <>
        <StatusBadge status={TitleStatus.PENDING} />
        <StatusBadge status={TitleStatus.REJECTED} />
      </>,
    );
    expect(screen.getByText('Pending')).toHaveClass('text-warn');
    expect(screen.getByText('Rejected')).toHaveClass('text-danger');
  });
});
