import { Role } from '@bingemate/shared';
import type { AuthUser } from '@bingemate/shared';
import { HttpError } from '../middleware/errorHandler.js';

export function assertCanWrite(user: AuthUser): void {
  if (user.role === Role.ADMIN) throw new HttpError(403, 'Admins cannot write reviews or replies');
}
