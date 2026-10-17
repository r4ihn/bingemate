import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from './Button.js';
import { Field } from './Field.js';

describe('Button', () => {
  it('primary uses accent classes and accent-ink text', () => {
    render(<Button>Save</Button>);
    const btn = screen.getByRole('button', { name: 'Save' });
    expect(btn).toHaveClass('bg-accent', 'text-accent-ink');
  });

  it('loading is disabled and ignores clicks', async () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Post
      </Button>,
    );
    const btn = screen.getByRole('button', { name: 'Post' });
    expect(btn).toBeDisabled();
    await userEvent.setup().click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe('Field', () => {
  it('links the label to the input and renders the error with role=alert', () => {
    render(
      <Field label="Email" error="Enter a valid email">
        <input />
      </Field>,
    );
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a valid email');
  });
});
