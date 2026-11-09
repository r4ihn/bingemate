import { TitleStatus } from '@bingemate/shared';
import type {
  ConnectionDTO,
  ConnectionStepDTO,
  PersonCreditDTO,
  PersonDetailDTO,
  PersonSummaryDTO,
} from '@bingemate/shared';
import { db } from '../mocks/db.js';
import { mockCredits, mockPeople } from '../mocks/people.js';
import { ApiError, apiFetch } from './client.js';
import { clone, delay, useMock } from './mockMode.js';
import { resolvePosterUrl } from './posterUrl.js';

export const MAX_DEPTH = 6;

const approvedTitle = (titleId: string) =>
  db.titles.find((t) => t.id === titleId && t.status === TitleStatus.APPROVED);
const approvedCredits = () => mockCredits.filter((c) => approvedTitle(c.titleId));

export const peopleApi = {
  /** People whose name contains `q` (2+ characters), the most credited first. */
  async search(q: string): Promise<PersonSummaryDTO[]> {
    const needle = q.trim().slice(0, 100);
    if (needle.length < 2) return [];
    if (!useMock) {
      return apiFetch<PersonSummaryDTO[]>(`/people?${new URLSearchParams({ q: needle })}`);
    }
    await delay();
    const credits = approvedCredits();
    return clone(
      mockPeople
        .filter((p) => p.name.toLowerCase().includes(needle.toLowerCase()))
        .map((p) => ({
          ...p,
          titleCount: new Set(credits.filter((c) => c.personId === p.id).map((c) => c.titleId))
            .size,
        }))
        .filter((p) => p.titleCount > 0)
        .sort((a, b) => b.titleCount - a.titleCount || a.name.localeCompare(b.name))
        .slice(0, 10),
    );
  },

  async get(id: string): Promise<PersonDetailDTO> {
    if (!useMock) {
      const dto = await apiFetch<PersonDetailDTO>(`/people/${encodeURIComponent(id)}`);
      return {
        ...dto,
        credits: dto.credits.map((c) => ({
          ...c,
          ...(c.posterUrl !== undefined && { posterUrl: resolvePosterUrl(c.posterUrl) }),
        })),
      };
    }
    await delay();
    const person = mockPeople.find((p) => p.id === id);
    if (!person) throw new ApiError(404, 'Person not found');
    const byTitle = new Map<string, PersonCreditDTO>();
    for (const c of approvedCredits().filter((c) => c.personId === id)) {
      const title = approvedTitle(c.titleId)!;
      const seen = byTitle.get(title.id);
      if (seen) seen.roles.push(c.role);
      else
        byTitle.set(title.id, {
          id: title.id,
          name: title.name,
          mediaType: title.mediaType,
          releaseYear: title.year ?? null,
          roles: [c.role],
        });
    }
    return clone({ ...person, credits: [...byTitle.values()] });
  },

  /** The shortest chain of shared titles between two people, or a null path. */
  async connection(fromId: string, toId: string, maxDepth = MAX_DEPTH): Promise<ConnectionDTO> {
    if (!useMock) {
      return apiFetch<ConnectionDTO>(
        `/people/${encodeURIComponent(fromId)}/connection/${encodeURIComponent(toId)}?maxDepth=${maxDepth}`,
      );
    }
    await delay();
    if (![fromId, toId].every((id) => mockPeople.some((p) => p.id === id))) {
      throw new ApiError(404, 'Person not found');
    }
    // The same breadth-first search the API runs in SQL, over the mock credits.
    const credits = approvedCredits();
    const parent = new Map<string, { from: string; via: string } | null>([[fromId, null]]);
    let frontier = [fromId];
    for (let depth = 0; depth < maxDepth && frontier.length && !parent.has(toId); depth++) {
      const next: string[] = [];
      for (const person of frontier) {
        for (const a of credits.filter((c) => c.personId === person)) {
          for (const b of credits.filter((c) => c.titleId === a.titleId)) {
            if (parent.has(b.personId)) continue;
            parent.set(b.personId, { from: person, via: a.titleId });
            next.push(b.personId);
          }
        }
      }
      frontier = next;
    }
    if (!parent.has(toId)) return { degrees: null, maxDepth, path: null };
    const path: ConnectionStepDTO[] = [];
    for (let at: string | undefined = toId; at !== undefined;) {
      const link = parent.get(at);
      const title = link ? approvedTitle(link.via)! : null;
      path.unshift({
        person: { id: at, name: mockPeople.find((p) => p.id === at)!.name },
        via: title ? { id: title.id, name: title.name, mediaType: title.mediaType } : null,
      });
      at = link?.from;
    }
    return { degrees: path.length - 1, maxDepth, path };
  },
};
