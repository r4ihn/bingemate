import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Table } from './Table.js';

describe('Table', () => {
  it('scrolls sideways inside a positioned wrapper, so sr-only text cannot widen the page', () => {
    render(
      <Table caption="Users" columns={['Name']}>
        <tr>
          <td>
            <span className="sr-only">hidden label</span>
          </td>
        </tr>
      </Table>,
    );
    // Absolutely positioned sr-only children escape an overflow box unless it is also positioned
    const wrapper = screen.getByRole('table').parentElement;
    expect(wrapper).toHaveClass('overflow-x-auto', 'relative');
  });
});
