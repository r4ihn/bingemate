import type { Role } from '@bingemate/shared';

// UI-side types: align with HS before moving to packages/shared.

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
  createdAt: string;
}

export interface ReviewInput {
  rating: number;
  body: string;
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
