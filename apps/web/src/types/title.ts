import type { TitleSummary } from '@bingemate/shared';

/** UI-side title shape. `hue`/`year` exist only on mock data; real data will carry `posterUrl`. */
export interface TitleDetail extends TitleSummary {
  synopsis: string;
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
