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
}

export interface CreatorStat {
  titleId: string;
  name: string;
  avgRating: number;
  reviewCount: number;
  listAdds: number;
}
