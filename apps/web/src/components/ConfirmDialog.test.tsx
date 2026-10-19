import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfirmDialog } from './ConfirmDialog.js';

function setup(props: Partial<Parameters<typeof ConfirmDialog>[0]> = {}) {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  render(
    <ConfirmDialog
      open
      title="Delete review?"
      body="This cannot be undone."
      confirmLabel="Delete"
      tone="danger"
      onConfirm={onConfirm}
      onCancel={onCancel}
      {...props}
    />,
  );
  return { onConfirm, onCancel, user: userEvent.setup() };
}

describe('ConfirmDialog', () => {
  it('does not render content when open=false', () => {
    setup({ open: false });
    expect(screen.queryByText('Delete review?')).not.toBeInTheDocument();
  });

  it('Escape calls onCancel', async () => {
    const { onCancel, user } = setup();
    await user.keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalled();
  });

  it('Cancel calls onCancel and does not confirm', async () => {
    const { onCancel, onConfirm, user } = setup();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('confirm button is disabled after the first click', async () => {
    const { onConfirm, user } = setup();
    const confirm = screen.getByRole('button', { name: 'Delete' });
    await user.click(confirm);
    await user.click(confirm);
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(confirm).toBeDisabled();
  });
});

function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open
      </button>
      <ConfirmDialog
        open={open}
        title="Sure?"
        body="Really."
        confirmLabel="Yes"
        onConfirm={() => setOpen(false)}
        onCancel={() => setOpen(false)}
      />
    </>
  );
}

describe('ConfirmDialog focus return', () => {
  it('returns focus to the control that opened it after Cancel', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const opener = screen.getByRole('button', { name: 'Open' });
    await user.click(opener);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(opener).toHaveFocus();
  });

  it('returns focus to the opener after Escape', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const opener = screen.getByRole('button', { name: 'Open' });
    await user.click(opener);
    await user.keyboard('{Escape}');
    expect(opener).toHaveFocus();
  });
});
