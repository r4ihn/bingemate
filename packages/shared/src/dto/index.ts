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
