import { ListStatus, MediaType, Role, TitleStatus } from '@bingemate/shared';
import type { AdminUser } from '../types/admin.js';
import type { ListItem } from '../types/list.js';
import type { Author, Comment, Review, ReviewFields } from '../types/review.js';
import type { TitleDetail } from '../types/title.js';
import { mockTitles } from './titles.js';

/** In-memory stand-in for the backend. Mutated by the mock API modules; `resetDb()` restores the seed. */
export interface StoredTitle extends TitleDetail {
  createdBy?: string;
  rejectionReason?: string;
}

export interface Db {
  titles: StoredTitle[];
  reviews: Review[];
  comments: Comment[];
  lists: ListItem[];
  users: AdminUser[];
}

export const MOCK_USER = 'mock-user';

const SYNOPSIS =
  'Placeholder synopsis. A short description of the story goes here so layouts have realistic text.';
const NAMES = [
  'Salt Archive',
  'Harbour Nine',
  'Quiet Orbit',
  'Paper Lanterns',
  'Static Bloom',
  'Glass Meridian',
  'Low Tide',
  'Night Ferry',
  'Copper Sky',
  'The Long Table',
  'Wild Signal',
  'Rooftop Season',
  'Ash and Ivory',
  'Cold Harbour',
  'Paper Moons',
  'Velvet Static',
  'Late Bloomers',
  'Iron Garden',
  'Northern Lights Club',
  'Salt Road',
  'Blue Hour',
];
const TYPES = [MediaType.MOVIE, MediaType.BOOK, MediaType.TV_SHOW];
const RUNTIME: Record<MediaType, string> = {
  MOVIE: '1h 55min',
  BOOK: '320 pages',
  TV_SHOW: '3 seasons',
};

const AUTHORS: Author[] = [
  { id: 'u-maya', name: 'maya_r', role: Role.CONSUMER },
  { id: 'u-studio', name: 'studio_north', role: Role.CREATOR },
  { id: 'u-dev', name: 'dev_k', role: Role.CONSUMER },
];

function fieldsFor(mediaType: MediaType, n: number): ReviewFields {
  if (mediaType === MediaType.BOOK) return { chapters: 10 + n };
  if (mediaType === MediaType.TV_SHOW) return { season: 1 + (n % 3), episodes: 6 + n };
  return { runtimeMinutes: 90 + n * 5 };
}

function seedTitles(): StoredTitle[] {
  const base: StoredTitle[] = mockTitles.map((t) => ({
    ...t,
    synopsis: SYNOPSIS,
    countries: ['Usa', 'Canada'],
    studio: 'North Star Pictures',
    runtime: RUNTIME[t.mediaType],
  }));
  const extra: StoredTitle[] = NAMES.map((name, i) => {
    const mediaType = TYPES[i % 3] as MediaType;
    return {
      id: `mock-${i + 8}`,
      name,
      year: 2005 + i,
      hue: (i * 47) % 360,
      mediaType,
      status: TitleStatus.APPROVED,
      avgRating: 6 + ((i * 7) % 35) / 10,
      reviewCount: 10 + i * 13,
      synopsis: SYNOPSIS,
      countries: ['Canada'],
      studio: 'Lantern Studio',
      runtime: RUNTIME[mediaType],
    };
  });
  const all = [...base, ...extra];
  const patch = (id: string, p: Partial<StoredTitle>) => {
    const t = all.find((x) => x.id === id);
    if (t) Object.assign(t, p);
  };
  // The mock creator owns four titles in different states; one more pending title belongs to someone else
  patch('mock-24', { createdBy: MOCK_USER });
  patch('mock-25', { createdBy: MOCK_USER, status: TitleStatus.PENDING });
  patch('mock-26', {
    createdBy: MOCK_USER,
    status: TitleStatus.REJECTED,
    rejectionReason: 'Poster missing',
  });
  patch('mock-27', { createdBy: MOCK_USER, status: TitleStatus.PENDING });
  patch('mock-28', { createdBy: 'other-creator', status: TitleStatus.PENDING });
  return all;
}

function seedReviews(titles: StoredTitle[]): Review[] {
  const counts: Record<string, number> = { 'mock-1': 7, 'mock-2': 3, 'mock-3': 3 };
  return Object.entries(counts).flatMap(([titleId, n]) => {
    const mediaType = titles.find((t) => t.id === titleId)?.mediaType ?? MediaType.MOVIE;
    return Array.from({ length: n }, (_, i): Review => ({
      id: `r-${titleId}-${i}`,
      titleId,
      author: AUTHORS[i % AUTHORS.length] as Author,
      rating: 6 + (i % 5),
      body: `Placeholder review ${i + 1}. Pacing, performances and ending all get a mention here.`,
      fields: fieldsFor(mediaType, i),
      createdAt: new Date(Date.UTC(2026, 9, 17 - i)).toISOString(),
    }));
  });
}

function seedComments(): Comment[] {
  const c = (
    id: string,
    parentId: string | null,
    a: number,
    body: string,
    isOfficial = false,
  ): Comment => ({
    id,
    reviewId: 'r-mock-1-0',
    parentId,
    author: AUTHORS[a] as Author,
    body,
    isOfficial,
    createdAt: new Date(Date.UTC(2026, 9, 17, 10, Number(id.slice(1)))).toISOString(),
  });
  return [
    c('c1', null, 0, 'Great pacing in the second half.'),
    c('c2', 'c1', 1, 'Thank you for watching!', true),
    c('c3', 'c1', 2, 'Agreed, the ending landed.'),
    c('c4', null, 2, 'Did anyone else cry at the finale?'),
  ];
}

function seedLists(titles: StoredTitle[]): ListItem[] {
  const statuses = [ListStatus.COMPLETED, ListStatus.IN_PROGRESS, ListStatus.PLAN_TO];
  return titles.slice(0, 12).map((title, i) => ({
    id: `l-${i + 1}`,
    titleId: title.id,
    status: statuses[i % 3] as ListStatus,
    title,
  }));
}

function seedUsers(): AdminUser[] {
  return Array.from({ length: 25 }, (_, i) => ({
    id: `user-${i + 1}`,
    email: `user${i + 1}@mock.dev`,
    role: i === 0 ? Role.ADMIN : i === 1 ? Role.CREATOR : Role.CONSUMER,
  }));
}

function seed(): Db {
  const titles = seedTitles();
  return {
    titles,
    reviews: seedReviews(titles),
    comments: seedComments(),
    lists: seedLists(titles),
    users: seedUsers(),
  };
}

export const db: Db = seed();

export function resetDb(): void {
  Object.assign(db, seed());
}

let seq = 0;
export function newId(prefix: string): string {
  seq += 1;
  return `${prefix}-new-${seq}`;
}
