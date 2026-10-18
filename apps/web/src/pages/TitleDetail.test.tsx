import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { Role } from '@bingemate/shared';
import { commentsApi } from '../api/reviews.js';
import { ApiError } from '../api/client.js';
import { titlesApi } from '../api/titles.js';
import { resetDb } from '../mocks/db.js';
import type { Comment } from '../types/review.js';
import { rate, renderWithProviders } from '../test/utils.js';
import { TitleDetail } from './TitleDetail.js';

function renderTitle(id: string, role?: Role) {
  return renderWithProviders(
    <Routes>
      <Route path="/titles/:id" element={<TitleDetail />} />
    </Routes>,
    { route: `/titles/${id}`, role },
  );
}

beforeEach(() => resetDb());
afterEach(() => vi.restoreAllMocks());

describe('TitleDetail', () => {
  it('shows loading, then the title name and rating', async () => {
    renderTitle('mock-1');
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Last Light' }),
    ).toBeInTheDocument();
    expect(screen.getByText('4.1')).toBeInTheDocument();
  });

  it('shows an empty state when there are no reviews', async () => {
    renderTitle('mock-20');
    expect(await screen.findByText('No reviews yet')).toBeInTheDocument();
  });

  it('shows an error with Retry when the title fails to load, and recovers on Retry', async () => {
    vi.spyOn(titlesApi, 'get').mockRejectedValueOnce(new ApiError(500, 'Server error'));
    renderTitle('mock-1');
    const retry = await screen.findByRole('button', { name: 'Retry' });
    await userEvent.setup().click(retry);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Last Light' }),
    ).toBeInTheDocument();
  });

  it('renders "Page not found" for an unknown title id', async () => {
    renderTitle('nope');
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument();
  });

  it('offers Reply on top-level comments only (one reply level)', async () => {
    renderTitle('mock-1', Role.CONSUMER);
    await screen.findByText('Great pacing in the second half.');
    // r-mock-1-0 has two top-level comments (c1, c4) and two replies (c2, c3)
    expect(screen.getAllByRole('button', { name: 'Reply' })).toHaveLength(2);
  });

  it('renders an official reply before other replies, whatever order the API returns', async () => {
    const at = (m: number) => new Date(Date.UTC(2026, 9, 17, 10, m)).toISOString();
    const author = { id: 'a', name: 'someone', role: Role.CONSUMER };
    const creator = { id: 'b', name: 'studio_north', role: Role.CREATOR };
    const thread: Comment[] = [
      {
        id: 'x1',
        reviewId: 'r-mock-1-0',
        parentId: null,
        author,
        body: 'Top comment',
        isOfficial: false,
        createdAt: at(1),
      },
      {
        id: 'x2',
        reviewId: 'r-mock-1-0',
        parentId: 'x1',
        author,
        body: 'Plain reply',
        isOfficial: false,
        createdAt: at(2),
      },
      {
        id: 'x3',
        reviewId: 'r-mock-1-0',
        parentId: 'x1',
        author: creator,
        body: 'Official words',
        isOfficial: true,
        createdAt: at(3),
      },
    ];
    vi.spyOn(commentsApi, 'list').mockImplementation((id) =>
      Promise.resolve(id === 'r-mock-1-0' ? thread : []),
    );
    renderTitle('mock-1');
    const official = await screen.findByText('Official words');
    const plain = screen.getByText('Plain reply');
    expect(official.compareDocumentPosition(plain) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const row = official.closest('li') as HTMLElement;
    expect(within(row).getByText('Official reply')).toBeInTheDocument();
    expect(within(row).getByText('Creator')).toBeInTheDocument();
  });

  it('posting a comment adds it to the thread', async () => {
    renderTitle('mock-1', Role.CONSUMER);
    await screen.findByText('Great pacing in the second half.');
    const u = userEvent.setup();
    const [form] = screen.getAllByLabelText('Add a comment');
    await u.type(form as HTMLElement, 'My new comment');
    const card = (form as HTMLElement).closest('article') as HTMLElement;
    await u.click(within(card).getByRole('button', { name: 'Post comment' }));
    await waitFor(() => expect(screen.getByText('My new comment')).toBeInTheDocument());
  });

  it('posting a review replaces the empty state with the new review', async () => {
    renderTitle('mock-20', Role.CONSUMER);
    await screen.findByText('No reviews yet');
    const u = userEvent.setup();
    await rate(u, 5);
    await u.type(screen.getByLabelText('Your review'), 'A fresh take');
    await u.type(screen.getByLabelText(/^(Runtime|Chapters|Season)/), '3');
    await u.click(screen.getByRole('button', { name: 'Post review' }));
    expect(await screen.findByText('A fresh take')).toBeInTheDocument();
    expect(screen.queryByText('No reviews yet')).not.toBeInTheDocument();
  });

  it('hides comment forms from anonymous visitors', async () => {
    renderTitle('mock-1');
    await screen.findByText('Great pacing in the second half.');
    expect(screen.queryByLabelText('Add a comment')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reply' })).not.toBeInTheDocument();
  });
});

describe('TitleDetail breadcrumb', () => {
  it('names the media section after the title type, not always Films', async () => {
    renderTitle('mock-9'); // a BOOK in the seed data
    const crumbs = await screen.findByRole('navigation', { name: 'Breadcrumb' });
    expect(within(crumbs).getByText('Books')).toBeInTheDocument();
    expect(within(crumbs).queryByText('Films')).not.toBeInTheDocument();
  });
});

describe('TitleDetail layout', () => {
  it('puts the poster before the title and the title before the reviews', async () => {
    renderTitle('mock-1');
    const h1 = await screen.findByRole('heading', { level: 1, name: 'Last Light' });
    const poster = screen.getByRole('img', { name: 'Poster for Last Light' });
    const reviews = screen.getByRole('heading', { level: 2, name: 'Reviews' });
    expect(poster.compareDocumentPosition(h1) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(h1.compareDocumentPosition(reviews) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('is not the full-screen hero used on Home', async () => {
    renderTitle('mock-1');
    await screen.findByRole('heading', { level: 1, name: 'Last Light' });
    expect(document.getElementById('hero')).toBeNull();
  });

  it('shows the synopsis, facts, rating and review count next to the poster', async () => {
    renderTitle('mock-1');
    await screen.findByRole('heading', { level: 1, name: 'Last Light' });
    const facts = screen.getByText('Studio').closest('dl') as HTMLElement;
    expect(within(facts).getByText('Country')).toBeInTheDocument();
    expect(within(facts).getByText('Runtime')).toBeInTheDocument();
    expect(screen.getByText('4.1')).toBeInTheDocument();
    expect(screen.getByText(/\d+ reviews?/)).toBeInTheDocument();
  });

  it('offers Add to list to signed-in users and a sign-in link to visitors', async () => {
    const view = renderTitle('mock-20', Role.CONSUMER);
    expect(await screen.findByRole('combobox', { name: 'Add to list' })).toBeInTheDocument();
    view.unmount();
    renderTitle('mock-20');
    expect(await screen.findByRole('link', { name: 'Sign in to add to list' })).toBeInTheDocument();
  });

  it('keeps a skip-to-reviews link', async () => {
    renderTitle('mock-1');
    expect(await screen.findByRole('link', { name: /Scroll for reviews/ })).toHaveAttribute(
      'href',
      '#reviews',
    );
  });
});
