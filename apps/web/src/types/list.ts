import type { ListEntryDTO, ListStatus, MediaType, TitleSummary } from '@bingemate/shared';

export interface ListItem extends ListEntryDTO {
  title: TitleSummary;
}

export interface ListQuery {
  status?: ListStatus;
  mediaType?: MediaType;
  page: number;
}
