import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FilterPill } from './FilterPill.js';
import { inputClass } from './ui/inputClass.js';

describe('touch targets and control borders', () => {
  it('a filter pill is at least 44px tall and has a visible border when inactive', () => {
    render(
      <FilterPill active={false} onClick={() => {}}>
        Movies
      </FilterPill>,
    );
    expect(screen.getByRole('button', { name: 'Movies' })).toHaveClass('min-h-11', 'border-field');
  });

  it('text inputs use the stronger field border, not the hairline', () => {
    expect(inputClass).toContain('border-field');
    expect(inputClass).not.toContain('border-line');
  });
});
