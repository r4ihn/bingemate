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

/** One title with the fields only the detail page needs. */
export interface TitleDetailDTO extends TitleSummary {
  description: string | null;
  releaseYear: number | null;
  genres: string[];
  people: TitlePersonDTO[];
}

export interface AuthorDTO {
  id: string;
  name: string;
  role: Role;
}

/** Media-specific extras on a review; a title's media type decides which ones apply. */
export interface ReviewFieldsDTO {
  runtimeMinutes?: number;
  chapters?: number;
  season?: number;
  episodes?: number;
}

export interface ReviewDTO {
  id: string;
  titleId: string;
  author: AuthorDTO;
  rating: number;
  body: string;
  fields: ReviewFieldsDTO;
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
