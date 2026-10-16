import type { ListStatus, MediaType, Role, TitleStatus } from '../enums.js';

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
