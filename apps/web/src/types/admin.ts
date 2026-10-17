import type { Role } from '@bingemate/shared';

export interface AdminUser {
  id: string;
  email: string;
  role: Role;
}
