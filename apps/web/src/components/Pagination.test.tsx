import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Pagination } from './Pagination.js';

describe('Pagination', () => {
  it('renders nothing when total <= pageSize', () => {
    const { container } = render(
      <Pagination page={1} pageSize={20} total={20} onChange={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('disables Previous on page 1 and Next on the last page', () => {
    const first = render(<Pagination page={1} pageSize={20} total={45} onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled();
    first.unmount();

    render(<Pagination page={3} pageSize={20} total={45} onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    expect(screen.getByText('Page 3 of 3')).toBeInTheDocument();
  });

  it('calls onChange(page + 1) when Next is clicked', async () => {
    const onChange = vi.fn();
    render(<Pagination page={2} pageSize={20} total={100} onChange={onChange} />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Next' }));
    expect(onChange).toHaveBeenCalledWith(3);
  });
});
