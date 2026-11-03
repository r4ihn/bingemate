import type { TitleSummary } from '@bingemate/shared';

/** UI-side title shape. `hue`/`year` exist only on mock data; real data will carry `posterUrl`. */
export interface TitleDetail extends TitleSummary {
  rankInType: number | null;
  topPercent: number | null;
  synopsis: string;
  /** The API's updatedAt, so an admin's decision applies only to the version they saw. */
  version?: string;
  /** Not in the dataset: the UI hides them when missing or empty. */
  countries?: string[];
  studio?: string;
  /** From the title's details; the UI hides whichever the title lacks. */
  runtime?: string;
  rated?: string;
  seasons?: string;
  publisher?: string;
  year?: number;
  hue?: number;
}
