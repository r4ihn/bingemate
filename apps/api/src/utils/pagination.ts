export interface PageParams {
  page: number;
  pageSize: number;
}

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

export function parsePageParams(query: {
  page?: unknown;
  pageSize?: unknown;
}): PageParams {
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(query.pageSize) || DEFAULT_PAGE_SIZE));
  return { page, pageSize };
}

export function toSkipTake({ page, pageSize }: PageParams) {
  return { skip: (page - 1) * pageSize, take: pageSize };
}
