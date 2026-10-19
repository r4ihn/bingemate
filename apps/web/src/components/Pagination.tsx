import { Button } from './ui/Button.js';

export function Pagination({
  page,
  pageSize,
  total,
  onChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onChange: (page: number) => void;
}) {
  const pages = Math.ceil(total / pageSize);
  if (pages <= 1) return null;

  return (
    <nav aria-label="Pagination" className="flex items-center justify-center gap-4 pt-8">
      <Button variant="secondary" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        Previous
      </Button>
      <span aria-live="polite" className="text-sm text-muted">
        Page {page} of {pages}
      </span>
      <Button variant="secondary" disabled={page >= pages} onClick={() => onChange(page + 1)}>
        Next
      </Button>
    </nav>
  );
}
