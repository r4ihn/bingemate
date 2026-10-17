import type { Role } from '@bingemate/shared';

export interface AdminUser {
  id: string;
  email: string;
  role: Role;
}

export interface ModerationReview {
  id: string;
  titleId: string;
  titleName: string;
  author: { id: string; name: string };
  rating: number;
  body: string;
  createdAt: string;
}
