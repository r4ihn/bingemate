import { Role } from '@bingemate/shared';
import type { AuthUser } from '@bingemate/shared';

/** Authors delete their own reviews and comments; admins delete any (TASKS.md section 3). UX only. */
export function canDelete(user: AuthUser | null, authorId: string): boolean {
  return user !== null && (user.role === Role.ADMIN || user.id === authorId);
}
