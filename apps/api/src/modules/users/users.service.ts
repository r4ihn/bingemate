import { Prisma } from '@prisma/client';
import type { ProfileDTO } from '@bingemate/shared';
import { prisma } from '../../db/prisma.js';
import { HttpError } from '../../middleware/errorHandler.js';
import { comparePassword, hashPassword } from '../../utils/password.js';

// Never selects passwordHash: the profile is sent to the browser.
const PROFILE_SELECT = {
  id: true,
  email: true,
  username: true,
  role: true,
  createdAt: true,
} as const;

type ProfileRow = Prisma.UserGetPayload<{ select: typeof PROFILE_SELECT }>;

const toProfile = (row: ProfileRow): ProfileDTO => ({
  id: row.id,
  email: row.email,
  username: row.username ?? null,
  role: row.role,
  createdAt: row.createdAt.toISOString(),
});

// The token is still valid for up to 2 hours after an account is deleted, so a missing row means
// the session is dead. 401 makes the web client sign the person out.
const accountGone = () => new HttpError(401, 'This account no longer exists');

export async function getProfile(userId: string): Promise<ProfileDTO> {
  const row = await prisma.user.findUnique({ where: { id: userId }, select: PROFILE_SELECT });
  if (!row) throw accountGone();
  return toProfile(row);
}

/**
 * Renames the user. The caller has already normalised and validated the name. Whether somebody else
 * has it is decided by the unique index on lower(username), so two requests at the same moment
 * cannot both win; the loser's P2002 becomes a 409, the same answer signup gives.
 */
export async function updateUsername(userId: string, username: string): Promise<ProfileDTO> {
  const current = await prisma.user.findUnique({ where: { id: userId }, select: PROFILE_SELECT });
  if (!current) throw accountGone();
  if (current.username === username) return toProfile(current);
  const taken = await prisma.user.findFirst({
    where: {
    id: { not: userId },
    username: {
      equals: username,
      mode: 'insensitive',
    },
  },
  select: { id: true },
});

if (taken) {
  throw new HttpError(409, 'Username already taken');
}

  try {
    const updated = await prisma.user.update({
      where: { id: userId },
      data: { username },
      select: PROFILE_SELECT,
    });
    return toProfile(updated);
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new HttpError(409, 'Username already taken');
    }
    throw err;
  }
}

/**
 * Checks the current password, stores the new hash and returns the profile as it is now in the
 * database, so the caller can issue a fresh token. A wrong current password is a 400, never a 401:
 * the web client treats any 401 as an expired session and signs the person out.
 */
export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<ProfileDTO> {
  const row = await prisma.user.findUnique({
    where: { id: userId },
    select: { ...PROFILE_SELECT, passwordHash: true },
  });
  if (!row) throw accountGone();

  if (!(await comparePassword(currentPassword, row.passwordHash))) {
    throw new HttpError(400, 'Current password is incorrect');
  }
  if (currentPassword === newPassword) {
    throw new HttpError(400, 'Choose a password different from your current one');
  }

  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await hashPassword(newPassword) },
    select: { id: true },
  });
  return toProfile(row);
}
