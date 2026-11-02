import { MediaType } from '@bingemate/shared';

export interface ReviewFieldConfig {
  name: string;
  label: string;
  type: 'number' | 'text';
  min?: number;
  optional?: boolean;
}

/** Media-specific review fields; names match the Mongo discriminators (TASKS.md section 5). */
export const fieldConfig: Record<MediaType, ReviewFieldConfig[]> = {
  [MediaType.MOVIE]: [
    { name: 'runtimeMinutes', label: 'Runtime watched (minutes)', type: 'number', min: 1 },
  ],
  [MediaType.BOOK]: [{ name: 'chapters', label: 'Chapters read', type: 'number', min: 1 }],
  [MediaType.TV_SHOW]: [
    { optional: true, name: 'season', label: 'Season', type: 'number', min: 1 },
    { optional: true, name: 'episodes', label: 'Episodes watched', type: 'number', min: 1 },
  ],
};
