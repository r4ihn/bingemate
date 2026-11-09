import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { peopleApi } from '../api/people.js';
import { resetDb } from '../mocks/db.js';
import { renderWithProviders } from '../test/utils.js';
import { Person } from './Person.js';
import { TitleDetail } from './TitleDetail.js';

function renderAt(route: string) {
  return renderWithProviders(
    <Routes>
      <Route path="/people/:id" element={<Person />} />
      <Route path="/titles/:id" element={<TitleDetail />} />
    </Routes>,
    { route },
  );
}

beforeEach(() => resetDb());
afterEach(() => vi.restoreAllMocks());

async function connectTo(name: string) {
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText('Another person'), name.slice(0, 4));
  await user.click(await screen.findByRole('button', { name: new RegExp(name) }));
}

describe('Person', () => {
  it('shows the person and their credits with roles', async () => {
    renderAt('/people/person-1');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Mara Quill' }),
    ).toBeInTheDocument();
    const credits = screen.getByRole('list', { name: 'Credits' });
    expect(within(credits).getAllByRole('listitem')).toHaveLength(2);
    expect(within(credits).getByText(/Director, Writer/)).toBeInTheDocument();
  });

  it('a title page links its cast and crew to their person pages', async () => {
    renderAt('/titles/mock-1');
    const credits = await screen.findByRole('region', { name: 'Cast & crew' });
    const link = within(credits).getByRole('link', { name: /Mara Quill/ });
    expect(link).toHaveAttribute('href', '/people/person-1');
  });

  it('finds the chain of shared titles to another person', async () => {
    renderAt('/people/person-1');
    await connectTo('Jun Halloway');

    expect(await screen.findByText('degrees of separation')).toBeInTheDocument();
    const chain = screen.getByRole('list', { name: 'Connection' });
    expect(
      within(chain)
        .getAllByRole('link')
        .map((l) => l.textContent),
    ).toEqual([
      'Mara Quill',
      'Last Light',
      'Theo Varga',
      'Ember Run',
      'Ines Okafor',
      'Isone',
      'Jun Halloway',
    ]);
  });

  it('says so when there is no link', async () => {
    renderAt('/people/person-1');
    await connectTo('Odile Marsh');
    expect(await screen.findByText(/No link to Odile Marsh within 6 steps/)).toBeInTheDocument();
  });

  it('shows an error when the lookup fails', async () => {
    vi.spyOn(peopleApi, 'connection').mockRejectedValueOnce(new Error('down'));
    renderAt('/people/person-1');
    await connectTo('Theo Varga');
    expect(await screen.findByRole('alert')).toHaveTextContent(/Could not look up/);
  });

  it('shows 404 for an unknown person', async () => {
    renderAt('/people/nobody');
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
  });
});
