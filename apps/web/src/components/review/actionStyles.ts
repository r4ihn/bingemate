/** Quiet text buttons for the action row under a review or reply (Reply, Edit, Delete). */
const base =
  'inline-flex min-h-11 cursor-pointer items-center text-sm font-medium text-muted transition-colors hover:underline focus-visible:underline';

export const actionClass = `${base} hover:text-white focus-visible:text-white`;
/** Delete stays quiet until it is pointed at or focused, then turns red. */
export const dangerActionClass = `${base} hover:text-danger focus-visible:text-danger`;
