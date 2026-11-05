import { TitleStatus } from '@bingemate/shared';
import { resolvePosterUrl } from './posterUrl.js';
import type {
  ReplyDTO,
  ReviewDTO,
  SubmissionDTO,
  TitleDetailDTO,
  TitleDetailsDTO,
  TitleSummary,
  TrendingCardDTO,
} from '@bingemate/shared';
import type { Submission } from '../types/creator.js';
import type { ListItem } from '../types/list.js';
import type { Reply, Review } from '../types/review.js';
import type { TitleDetail } from '../types/title.js';

export function mapListItem(item: ListItem): ListItem {
  return {
    ...item,
    title: {
      ...item.title,
      ...(item.title.posterUrl !== undefined && {
        posterUrl: resolvePosterUrl(item.title.posterUrl),
      }),
    },
  };
}

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
    rankInType: null,
    topPercent: null,
    ...(s.posterUrl !== undefined && { posterUrl: resolvePosterUrl(s.posterUrl) }),
    ...(s.trailerKey !== undefined && { trailerKey: s.trailerKey }),
    ...(s.createdById !== undefined && { createdById: s.createdById }),
  };
}

export function mapSubmission(dto: SubmissionDTO): Submission {
  return {
    title: { ...summaryToTitle(dto), synopsis: dto.description ?? '', version: dto.updatedAt },
    rejectionReason: dto.rejectionReason ?? undefined,
  };
}

/** The facts the title page shows for a media type; a blank value adds no field. */
function mapDetails(d: TitleDetailsDTO | null) {
  if (d?.mediaType === 'MOVIE') {
    return {
      ...(d.runtimeMin != null && { runtime: `${d.runtimeMin} min` }),
      ...(d.rated != null && { rated: d.rated }),
    };
  }
  if (d?.mediaType === 'TV_SHOW') {
    return {
      ...(d.numSeasons != null && {
        seasons: `${d.numSeasons} ${d.numSeasons === 1 ? 'season' : 'seasons'}`,
      }),
      ...(d.duration != null && { runtime: `${d.duration} min per episode` }),
      ...(d.contentRating != null && { rated: d.contentRating }),
    };
  }
  if (d?.mediaType === 'BOOK') return d.publisher != null ? { publisher: d.publisher } : {};
  return {};
}

/** Genres and people are not shown by the UI yet, so they are dropped here. */
export function detailToTitle(d: TitleDetailDTO): TitleDetail {
  return {
    ...summaryToTitle(d),
    rankInType: d.rankInType,
    topPercent: d.topPercent,
    synopsis: d.description ?? '',
    ...(d.releaseYear != null && { year: d.releaseYear }),
    ...mapDetails(d.details),
  };
}

export function mapReview(r: ReviewDTO): Review {
  return {
    id: r.id,
    titleId: r.titleId,
    author: { id: r.author.id, name: r.author.name, role: r.author.role },
    rating: r.rating,
    body: r.body,
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

/** Trending has no description or release year; retain only the card facts it supplies. */
export function trendingToTitle(card: TrendingCardDTO): TitleDetail {
  return summaryToTitle({
    id: card.titleId,
    name: card.name,
    mediaType: card.mediaType,
    status: TitleStatus.APPROVED,
    avgRating: card.avgRating,
    reviewCount: card.reviewCount,
    ...(card.posterUrl !== undefined && { posterUrl: card.posterUrl }),
  });
}
