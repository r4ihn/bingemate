import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { Role } from '@bingemate/shared';
import { commentsApi } from '../api/reviews.js';
import { ApiError } from '../api/client.js';
import { titlesApi } from '../api/titles.js';
import { db, resetDb } from '../mocks/db.js';
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

  it('badges the creator of this title in the thread, but not the same account on another title', async () => {
    const studio = { id: 'u-studio', name: 'studio_north', role: Role.CREATOR };
    const comment = (reviewId: string): Comment => ({
      id: `x-${reviewId}`,
      reviewId,
      parentId: null,
      author: studio,
      body: `Studio words on ${reviewId}`,
      createdAt: new Date(Date.UTC(2026, 9, 17, 10, 1)).toISOString(),
    });
    vi.spyOn(commentsApi, 'list').mockImplementation((id) =>
      Promise.resolve(id === 'r-mock-1-0' || id === 'r-mock-2-0' ? [comment(id)] : []),
    );
    // mock-1 was created by u-studio; mock-2 was not
    const own = renderTitle('mock-1');
    const ownRow = (await screen.findByText('Studio words on r-mock-1-0')).parentElement;
    expect(within(ownRow as HTMLElement).getByText('Creator')).toBeInTheDocument();
    own.unmount();
    renderTitle('mock-2');
    const otherRow = (await screen.findByText('Studio words on r-mock-2-0')).parentElement;
    expect(within(otherRow as HTMLElement).queryByText('Creator')).not.toBeInTheDocument();
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

describe('TitleDetail when the reviews change', () => {
  const countText = () => screen.getByText(/^\d+ reviews?$/).textContent;
  const mine = (titleId: string) => ({
    id: 'r-mine',
    titleId,
    author: { id: 'test-user', name: 'You', role: Role.CONSUMER },
    rating: 4,
    body: 'My own take',
    fields: { runtimeMinutes: 100 },
    createdAt: new Date().toISOString(),
  });

  it('posting a review raises the review count and average in the overview', async () => {
    const title = db.titles.find((t) => t.id === 'mock-20')!;
    Object.assign(title, { avgRating: 3, reviewCount: 4 });
    renderTitle('mock-20', Role.CONSUMER);
    await screen.findByText('No reviews yet');
    expect(countText()).toBe('4 reviews');
    const u = userEvent.setup();
    await rate(u, 5);
    await u.type(screen.getByLabelText('Your review'), 'A fresh take');
    await u.type(screen.getByLabelText(/^(Runtime|Chapters|Season)/), '3');
    await u.click(screen.getByRole('button', { name: 'Post review' }));
    await screen.findByText('A fresh take');
    await waitFor(() => expect(countText()).toBe('5 reviews'));
    expect(screen.getByText('3.4')).toBeInTheDocument(); // (3 * 4 + 5) / 5
  });

  it('after posting, the form gives way to a message that the user has reviewed this title', async () => {
    renderTitle('mock-20', Role.CONSUMER);
    await screen.findByText('No reviews yet');
    const u = userEvent.setup();
    await rate(u, 5);
    await u.type(screen.getByLabelText('Your review'), 'A fresh take');
    await u.type(screen.getByLabelText(/^(Runtime|Chapters|Season)/), '3');
    await u.click(screen.getByRole('button', { name: 'Post review' }));
    expect(await screen.findByText(/You have already reviewed this title/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Your review')).not.toBeInTheDocument();
  });

  it('deleting your review lowers the count and brings the form back', async () => {
    const title = db.titles.find((t) => t.id === 'mock-20')!;
    Object.assign(title, { avgRating: 4, reviewCount: 1 });
    db.reviews.push(mine('mock-20'));
    renderTitle('mock-20', Role.CONSUMER);
    await screen.findByText('My own take');
    expect(screen.getByText(/You have already reviewed this title/)).toBeInTheDocument();
    const u = userEvent.setup();
    await u.click(screen.getByRole('button', { name: 'Delete review by You' }));
    await u.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(countText()).toBe('0 reviews'));
    expect(await screen.findByLabelText('Your review')).toBeInTheDocument();
  });

  it('still lets a user who already reviewed reply to comments more than once', async () => {
    db.reviews.push(mine('mock-1'));
    renderTitle('mock-1', Role.CONSUMER);
    await screen.findByText('Great pacing in the second half.');
    const u = userEvent.setup();
    const [form] = screen.getAllByLabelText('Add a comment') as HTMLElement[];
    for (const text of ['First comment', 'Second comment']) {
      await u.type(form as HTMLElement, text);
      const card = (form as HTMLElement).closest('article') as HTMLElement;
      await u.click(within(card).getByRole('button', { name: 'Post comment' }));
      await screen.findByText(text);
    }
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
