import type { Role } from '@bingemate/shared';

// UI-side types: align with HS before moving to packages/shared.
export interface MovieFields {
  runtimeMinutes: number;
}
export interface BookFields {
  chapters: number;
}
export interface TvFields {
  season: number;
  episodes: number;
}
export type ReviewFields = MovieFields | BookFields | TvFields;
/** Imported reviews carry no media-specific extras; the API sends `{}` for them. */
export type NoFields = Record<string, never>;

export interface Author {
  id: string;
  name: string;
  role: Role;
}

export interface Review {
  id: string;
  titleId: string;
  author: Author;
  rating: number;
  body: string;
  fields: ReviewFields | NoFields;
  createdAt: string;
}

export interface ReviewInput {
  rating: number;
  body: string;
  fields: ReviewFields;
}

/** A reply under a review: one flat list per review, no replies to replies. */
export interface Reply {
  id: string;
  reviewId: string;
  author: Author;
  body: string;
  createdAt: string;
  /** Set once the writer has changed the text; createdAt stays as it was. */
  editedAt?: string;
}
