import type { TitleSummary } from '@bingemate/shared';

/** UI-side title shape. `hue`/`year` exist only on mock data; real data will carry `posterUrl`. */
export interface TitleDetail extends TitleSummary {
  synopsis: string;
  countries: string[];
  studio: string;
  runtime: string;
  year?: number;
  hue?: number;
}
