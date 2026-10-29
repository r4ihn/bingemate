import { useState } from 'react';
import { Link } from 'react-router-dom';
import { adminApi } from '../../api/admin.js';
import { ConfirmDialog } from '../../components/ConfirmDialog.js';
import { Pagination } from '../../components/Pagination.js';
import { StateMessage } from '../../components/StateMessage.js';
import { Button } from '../../components/ui/Button.js';
import { Table, Td } from '../../components/ui/Table.js';
import { useAsync } from '../../hooks/useAsync.js';
import type { ModerationReview } from '../../types/admin.js';

export function Moderation() {
  const [page, setPage] = useState(1);
  const { state, reload } = useAsync(() => adminApi.reviews(page), [page]);
  const [removed, setRemoved] = useState<ReadonlySet<string>>(new Set());
  const [deleting, setDeleting] = useState<ModerationReview | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function confirmDelete() {
    if (!deleting) return;
    const review = deleting;
    setError(null);
    try {
      await adminApi.removeReview(review.id);
      const left =
        state.status === 'ready'
          ? state.data.data.filter((r) => r.id !== review.id && !removed.has(r.id)).length
          : 1;
      if (left > 0) {
        setRemoved((r) => new Set(r).add(review.id));
      } else {
        // That was the last review on this page: go back a page (or refetch) instead of an empty state
        setRemoved(new Set());
        if (page > 1) setPage(page - 1);
        else reload();
      }
    } catch {
      setError(`Could not delete ${review.author.name}’s review. Try again.`);
    } finally {
      setDeleting(null);
    }
  }

  if (state.status === 'loading') return <StateMessage kind="loading" />;
  if (state.status === 'error') {
    return <StateMessage kind="error" detail="Reviews could not be loaded." onRetry={reload} />;
  }
  const { data, pageSize, total } = state.data;
  const rows = data.filter((r) => !removed.has(r.id));

  return (
    <>
      {error && (
        <p role="alert" className="mb-4 text-sm text-danger">
          {error}
        </p>
      )}
      {rows.length === 0 ? (
        <StateMessage kind="empty" title="No reviews to moderate" />
      ) : (
        <>
          <Table caption="Reviews" columns={['Title', 'Author', 'Rating', 'Review', '']}>
            {rows.map((r) => (
              <tr key={r.id}>
                <Td>
                  <Link to={`/titles/${r.titleId}`} className="underline">
                    {r.titleName}
                  </Link>
                </Td>
                <Td>{r.author.name}</Td>
                <Td>{r.rating}/5</Td>
                <Td className="max-w-xs truncate text-muted">{r.body}</Td>
                <Td>
                  <Button
                    variant="danger"
                    className="px-4 py-2 text-sm"
                    onClick={() => setDeleting(r)}
                  >
                    Delete{' '}
                    <span className="sr-only">
                      review by {r.author.name} on {r.titleName}
                    </span>
                  </Button>
                </Td>
              </tr>
            ))}
          </Table>
          <Pagination
            page={page}
            pageSize={pageSize}
            total={total}
            onChange={(p) => {
              setPage(p);
              setRemoved(new Set());
            }}
          />
        </>
      )}
      <ConfirmDialog
        open={deleting !== null}
        title="Delete review?"
        body={
          deleting
            ? `${deleting.author.name}’s review of “${deleting.titleName}” and its replies will be deleted.`
            : ''
        }
        confirmLabel="Delete"
        tone="danger"
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />
    </>
  );
}
