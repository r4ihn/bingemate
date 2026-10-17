import { useRef, useState } from 'react';
import { TitleStatus } from '@bingemate/shared';
import { adminApi } from '../../api/admin.js';
import { StateMessage } from '../../components/StateMessage.js';
import { Button } from '../../components/ui/Button.js';
import { Table, Td } from '../../components/ui/Table.js';
import { inputClass } from '../../components/ui/inputClass.js';
import { useAsync } from '../../hooks/useAsync.js';
import { MEDIA_LABEL } from '../../labels.js';
import type { TitleDetail } from '../../types/title.js';

export function ApprovalQueue() {
  const { state, reload } = useAsync(() => adminApi.pendingTitles(), []);
  const [decided, setDecided] = useState<ReadonlySet<string>>(new Set());
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set());
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(new Set<string>());

  async function decide(
    t: TitleDetail,
    status: typeof TitleStatus.APPROVED | typeof TitleStatus.REJECTED,
  ) {
    if (inFlight.current.has(t.id)) return; // a second click while the first is pending
    inFlight.current.add(t.id);
    setBusy(new Set(inFlight.current));
    setError(null);
    try {
      const reason =
        status === TitleStatus.REJECTED ? reasons[t.id]?.trim() || undefined : undefined;
      await adminApi.setTitleStatus(t.id, status, reason);
      setDecided((d) => new Set(d).add(t.id));
    } catch {
      setError(`Could not update “${t.name}”. Try again.`);
    } finally {
      inFlight.current.delete(t.id);
      setBusy(new Set(inFlight.current));
    }
  }

  if (state.status === 'loading') return <StateMessage kind="loading" />;
  if (state.status === 'error') {
    return <StateMessage kind="error" detail="The queue could not be loaded." onRetry={reload} />;
  }
  const rows = state.data.filter((t) => !decided.has(t.id));

  return (
    <>
      {error && (
        <p role="alert" className="mb-4 text-[0.85rem] text-danger">
          {error}
        </p>
      )}
      {rows.length === 0 ? (
        <StateMessage
          kind="empty"
          title="Queue is empty"
          detail="No titles are waiting for approval."
        />
      ) : (
        <Table
          caption="Titles waiting for approval"
          columns={['Title', 'Type', 'Rejection reason', '']}
        >
          {rows.map((t) => (
            <tr key={t.id}>
              <Td>{t.name}</Td>
              <Td>{MEDIA_LABEL[t.mediaType]}</Td>
              <Td>
                <input
                  aria-label={`Reason for ${t.name}`}
                  placeholder="Optional"
                  value={reasons[t.id] ?? ''}
                  onChange={(e) => setReasons((r) => ({ ...r, [t.id]: e.target.value }))}
                  className={`${inputClass} w-full min-w-40 py-2`}
                />
              </Td>
              <Td>
                <div className="flex gap-2">
                  <Button
                    disabled={busy.has(t.id)}
                    className="px-4 py-2 text-[0.8rem]"
                    onClick={() => void decide(t, TitleStatus.APPROVED)}
                  >
                    Approve <span className="sr-only">{t.name}</span>
                  </Button>
                  <Button
                    variant="danger"
                    disabled={busy.has(t.id)}
                    className="px-4 py-2 text-[0.8rem]"
                    onClick={() => void decide(t, TitleStatus.REJECTED)}
                  >
                    Reject <span className="sr-only">{t.name}</span>
                  </Button>
                </div>
              </Td>
            </tr>
          ))}
        </Table>
      )}
    </>
  );
}
