import type { ListStatus, MediaType, PersonRole, Role, TitleStatus } from '../enums.js';

/** Request/response shapes shared across the API boundary. */

export interface AuthUser {
  id: string;
  email: string;
  role: Role;
}

export interface RegisterRequest {
  email: string;
  password: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface TitleSummary {
  id: string;
  name: string;
  mediaType: MediaType;
  status: TitleStatus;
  avgRating: number;
  reviewCount: number;
  posterUrl?: string;
  /** Owner of a creator-submitted title; null for imported ones. Lets the UI show creator-only actions. */
  createdById?: string | null;
}

export interface SubmissionDTO extends TitleSummary {
  updatedAt: string;
  description: string | null;
  rejectionReason: string | null;
}

export interface Paginated<T> {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
}

export interface ListEntryDTO {
  id: string;
  titleId: string;
  status: ListStatus;
}

export interface TitlePersonDTO {
  id: string;
  name: string;
  role: PersonRole;
}

/** Facts only one media type has. `mediaType` says which shape this is. */
export type TitleDetailsDTO =
  | {
      mediaType: 'MOVIE';
      runtimeMin: number | null;
      tagline: string | null;
      rated: string | null;
      letterboxdRating: number | null;
    }
  | {
      mediaType: 'TV_SHOW';
      numSeasons: number | null;
      duration: number | null;
      contentRating: string | null;
      metascore: number | null;
      userscore: number | null;
    }
  | { mediaType: 'BOOK'; publisher: string | null; ratingsCount: number | null };

/** One title with the fields only the detail page needs. */
export interface TitleDetailDTO extends TitleSummary {
  rankInType: number | null;
  topPercent: number | null;
  description: string | null;
  releaseYear: number | null;
  genres: string[];
  people: TitlePersonDTO[];
  details: TitleDetailsDTO | null;
}

export interface AuthorDTO {
  id: string;
  name: string;
  role: Role;
}

export interface ReviewDTO {
  id: string;
  titleId: string;
  author: AuthorDTO;
  rating: number;
  body: string;
  createdAt: string;
}

/** A reply under a review: one flat list per review, no replies to replies. */
export interface ReplyDTO {
  id: string;
  reviewId: string;
  author: AuthorDTO;
  body: string;
  createdAt: string;
  /** Set once the writer has changed the text; createdAt stays as it was. */
  editedAt?: string;
}

/** One title on the signed-in user's list, with enough of the title to draw a card. */
export interface ListItemDTO extends ListEntryDTO {
  title: TitleSummary;
}

/** One genre in the browse filter, with how many approved titles carry it. */
export interface GenreOptionDTO {
  id: string;
  name: string;
  titleCount: number;
}

/** One row of GET /creator/stats: how a creators own title is doing. */
export interface CreatorTitleStatsDTO {
  titleId: string;
  name: string;
  status: TitleStatus;
  reviewCount: number;
  avgRating: number;
  listAdds: number;
}

/** A trending title as stored in MongoDB: enough to draw a card without asking PostgreSQL. */
export interface TrendingCardDTO {
  titleId: string;
  name: string;
  mediaType: MediaType;
  posterUrl?: string;
  avgRating: number;
  reviewCount: number;
  recentReviews: number;
  score: number;
}
