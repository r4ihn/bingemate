import type {
  ReplyDTO,
  ReviewDTO,
  ReviewFieldsDTO,
  TitleDetailDTO,
  TitleSummary,
} from '@bingemate/shared';
import type { NoFields, Reply, Review, ReviewFields } from '../types/review.js';
import type { TitleDetail } from '../types/title.js';

/** The list endpoint returns summaries only: no description or year, so synopsis stays empty. */
export function summaryToTitle(s: TitleSummary): TitleDetail {
  return {
    id: s.id,
    name: s.name,
    mediaType: s.mediaType,
    status: s.status,
    avgRating: s.avgRating,
    reviewCount: s.reviewCount,
    synopsis: '',
    ...(s.posterUrl !== undefined && { posterUrl: s.posterUrl }),
    ...(s.createdById !== undefined && { createdById: s.createdById }),
  };
}

/** Genres and people are not shown by the UI yet, so they are dropped here. */
export function detailToTitle(d: TitleDetailDTO): TitleDetail {
  return {
    ...summaryToTitle(d),
    synopsis: d.description ?? '',
    ...(d.releaseYear != null && { year: d.releaseYear }),
  };
}

/** Keeps a media group only when it is complete; anything else becomes `{}` (no details line). */
export function mapReviewFields(f: ReviewFieldsDTO): ReviewFields | NoFields {
  if (f.runtimeMinutes !== undefined) return { runtimeMinutes: f.runtimeMinutes };
  if (f.chapters !== undefined) return { chapters: f.chapters };
  if (f.season !== undefined && f.episodes !== undefined) {
    return { season: f.season, episodes: f.episodes };
  }
  return {};
}

export function mapReview(r: ReviewDTO): Review {
  return {
    id: r.id,
    titleId: r.titleId,
    author: { id: r.author.id, name: r.author.name, role: r.author.role },
    rating: r.rating,
    body: r.body,
    fields: mapReviewFields(r.fields ?? {}),
    createdAt: r.createdAt,
  };
}

/** Replies are one flat list; `editedAt` is present only once the writer changed the text. */
export function mapReply(r: ReplyDTO): Reply {
  return {
    id: r.id,
    reviewId: r.reviewId,
    author: { id: r.author.id, name: r.author.name, role: r.author.role },
    body: r.body,
    createdAt: r.createdAt,
    ...(r.editedAt ? { editedAt: r.editedAt } : {}),
  };
}
