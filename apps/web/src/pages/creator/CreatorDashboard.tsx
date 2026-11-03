import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { creatorApi } from '../../api/creator.js';
import { StateMessage } from '../../components/StateMessage.js';
import { Button } from '../../components/ui/Button.js';
import { StatusBadge } from '../../components/ui/Badge.js';
import { Table, Td } from '../../components/ui/Table.js';
import { useAsync } from '../../hooks/useAsync.js';
import { MEDIA_LABEL } from '../../labels.js';
import { DeleteTitleButton } from './DeleteTitleButton.js';

export const primaryLink =
  'inline-flex rounded-full bg-accent px-6 py-3 font-semibold text-accent-ink';
export const secondaryLink =
  'inline-flex rounded-full border border-white px-6 py-3 font-semibold text-white';

export function CreatorDashboard() {
  const location = useLocation();
  const navigate = useNavigate();
  const incomingNotice = (location.state as { notice?: string } | null)?.notice;
  const [notice, setNotice] = useState(incomingNotice);

  // Consume the navigation notice so refreshing or returning to this history entry cannot repeat it.
  useEffect(() => {
    if (incomingNotice) {
      navigate(`${location.pathname}${location.search}${location.hash}`, {
        replace: true,
        state: null,
      });
    }
  }, [incomingNotice, location.pathname, location.search, location.hash, navigate]);

  const { state, reload } = useAsync(() => creatorApi.submissions(), []);

  return (
    <section>
      <h1 className="text-4xl font-semibold tracking-tight">Creator</h1>
      <p className="mt-2 text-muted">
        Your submissions. New and edited titles stay hidden until an admin approves them.
      </p>
      {notice && (
        <div role="alert" className="mt-6 rounded-xl border border-warn p-4 text-warn">
          <p>{notice}</p>
          <Button variant="secondary" className="mt-3" onClick={() => setNotice(undefined)}>
            Dismiss
          </Button>
        </div>
      )}
      <div className="mt-6 flex gap-3">
        <Link to="/creator/new" className={primaryLink}>
          New submission
        </Link>
        <Link to="/creator/stats" className={secondaryLink}>
          Stats
        </Link>
      </div>

      <div className="mt-8">
        {state.status === 'loading' && <StateMessage kind="loading" />}
        {state.status === 'error' && (
          <StateMessage
            kind="error"
            detail="Your submissions could not be loaded."
            onRetry={reload}
          />
        )}
        {state.status === 'ready' &&
          (state.data.length === 0 ? (
            <StateMessage
              kind="empty"
              title="No submissions yet"
              detail="Upload your first title with “New submission”."
            />
          ) : (
            <Table caption="My submissions" columns={['Title', 'Type', 'Status', 'Note', '']}>
              {state.data.map(({ title, rejectionReason }) => (
                <tr key={title.id}>
                  <Td>{title.name}</Td>
                  <Td>{MEDIA_LABEL[title.mediaType]}</Td>
                  <Td>
                    <StatusBadge status={title.status} />
                  </Td>
                  <Td className="text-muted">{rejectionReason ?? '—'}</Td>
                  <Td>
                    <Link to={`/creator/${title.id}/edit`} className="underline">
                      Edit <span className="sr-only">{title.name}</span>
                    </Link>
                    <DeleteTitleButton id={title.id} onDeleted={reload} />
                  </Td>
                </tr>
              ))}
            </Table>
          ))}
      </div>
    </section>
  );
}
