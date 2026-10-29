/** Shared enums used by both apps/api and apps/web. Mirror the Prisma enums. */

export const Role = {
  ADMIN: 'ADMIN',
  CREATOR: 'CREATOR',
  CONSUMER: 'CONSUMER',
} as const;
export type Role = (typeof Role)[keyof typeof Role];

export const MediaType = {
  MOVIE: 'MOVIE',
  BOOK: 'BOOK',
  TV_SHOW: 'TV_SHOW',
} as const;
export type MediaType = (typeof MediaType)[keyof typeof MediaType];

export const TitleStatus = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
} as const;
export type TitleStatus = (typeof TitleStatus)[keyof typeof TitleStatus];

export const ListStatus = {
  COMPLETED: 'COMPLETED',
  IN_PROGRESS: 'IN_PROGRESS',
  PLAN_TO: 'PLAN_TO',
} as const;
export type ListStatus = (typeof ListStatus)[keyof typeof ListStatus];

export const PersonRole = {
  AUTHOR: 'AUTHOR',
  DIRECTOR: 'DIRECTOR',
  ACTOR: 'ACTOR',
  SHOWRUNNER: 'SHOWRUNNER',
  WRITER: 'WRITER',
} as const;
export type PersonRole = (typeof PersonRole)[keyof typeof PersonRole];
