import { describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Dropdown } from './Dropdown.js';

const options = [
  { value: 'a', label: 'Alpha' },
  { value: 'b', label: 'Beta' },
  { value: 'x', label: 'Remove', tone: 'danger' as const },
];

function Harness({
  onChange = vi.fn(),
  initial = '',
}: {
  onChange?: (v: string) => void;
  initial?: string;
}) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <Dropdown
        label="Pick one"
        value={value}
        placeholder="Choose"
        options={options}
        onChange={(v) => {
          setValue(v);
          onChange(v);
        }}
      />
      <button type="button">after</button>
    </>
  );
}

const combo = () => screen.getByRole('combobox', { name: 'Pick one' });

describe('Dropdown', () => {
  it('shows the placeholder, then opens a listbox on click with the chosen option marked', async () => {
    const u = userEvent.setup();
    render(<Harness initial="b" />);
    expect(combo()).toHaveTextContent('Beta');
    expect(combo()).toHaveAttribute('aria-expanded', 'false');
    await u.click(combo());
    expect(combo()).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('option', { name: 'Beta' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('option', { name: 'Alpha' })).toHaveAttribute('aria-selected', 'false');
  });

  it('shows the placeholder while nothing is chosen', () => {
    render(<Harness />);
    expect(combo()).toHaveTextContent('Choose');
  });

  it('chooses with the mouse, closes, and returns focus to the button', async () => {
    const onChange = vi.fn();
    const u = userEvent.setup();
    render(<Harness onChange={onChange} />);
    await u.click(combo());
    await u.click(screen.getByRole('option', { name: 'Alpha' }));
    expect(onChange).toHaveBeenCalledWith('a');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(combo()).toHaveFocus();
    expect(combo()).toHaveTextContent('Alpha');
  });

  it('works from the keyboard: arrows move, Enter chooses', async () => {
    const onChange = vi.fn();
    const u = userEvent.setup();
    render(<Harness onChange={onChange} />);
    combo().focus();
    await u.keyboard('{ArrowDown}'); // opens on the first option
    expect(screen.getByRole('listbox')).toHaveFocus();
    await u.keyboard('{ArrowDown}{Enter}');
    expect(onChange).toHaveBeenCalledWith('b');
    expect(combo()).toHaveFocus();
  });

  it('Home and End jump to the first and last option, and the arrows stop at the ends', async () => {
    const onChange = vi.fn();
    const u = userEvent.setup();
    render(<Harness onChange={onChange} />);
    combo().focus();
    await u.keyboard('{ArrowDown}{End}{ArrowDown}{Enter}');
    expect(onChange).toHaveBeenCalledWith('x');
    combo().focus();
    await u.keyboard('{ArrowUp}{Home}{ArrowUp}{Enter}');
    expect(onChange).toHaveBeenLastCalledWith('a');
  });

  it('Escape closes without changing anything and returns focus', async () => {
    const onChange = vi.fn();
    const u = userEvent.setup();
    render(<Harness onChange={onChange} />);
    await u.click(combo());
    await u.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
    expect(combo()).toHaveFocus();
  });

  it('Tab closes the menu and moves on to the next control', async () => {
    const u = userEvent.setup();
    render(<Harness />);
    await u.click(combo());
    await u.tab();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'after' })).toHaveFocus();
  });

  it('closes on a press outside', async () => {
    const u = userEvent.setup();
    render(<Harness />);
    await u.click(combo());
    await u.click(document.body);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('does not call onChange when the current option is chosen again', async () => {
    const onChange = vi.fn();
    const u = userEvent.setup();
    render(<Harness onChange={onChange} initial="a" />);
    await u.click(combo());
    await u.click(screen.getByRole('option', { name: 'Alpha' }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('cannot be opened while disabled', async () => {
    const u = userEvent.setup();
    render(<Dropdown label="Pick one" value="" options={options} onChange={vi.fn()} disabled />);
    await u.click(combo());
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
});
