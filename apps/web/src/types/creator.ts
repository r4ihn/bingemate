import type { MediaType } from '@bingemate/shared';
import type { TitleDetail } from './title.js';

export interface Submission {
  title: TitleDetail;
  rejectionReason?: string;
}

export interface SubmissionInput {
  name: string;
  mediaType: MediaType;
  synopsis: string;
  /** A new image, already shrunk by `shrinkPoster`. Left out when the creator did not pick one. */
  poster?: Blob;
  /** Edit only: take the title's current image away. */
  removePoster?: boolean;
}

export interface CreatorStat {
  titleId: string;
  name: string;
  avgRating: number;
  reviewCount: number;
  listAdds: number;
}
