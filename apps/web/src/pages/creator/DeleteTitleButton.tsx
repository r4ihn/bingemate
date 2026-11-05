import { useRef, useState } from 'react';
import { ApiError } from '../../api/client.js';
import { creatorApi } from '../../api/creator.js';
import { Button } from '../../components/ui/Button.js';

export function DeleteTitleButton({ id, onDeleted }: { id: string; onDeleted: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  async function remove() {
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setError(null);
    try {
      await creatorApi.remove(id);
      setConfirming(false);
      onDeleted();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not delete. Try again.');
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  return (
    <div className="grid gap-2">
      {confirming ? (
        <>
          <p className="text-sm">Delete this title? This cannot be undone.</p>
          <div className="flex gap-2">
            <Button variant="danger" loading={pending} onClick={() => void remove()}>
              Confirm
            </Button>
            <Button variant="secondary" disabled={pending} onClick={() => setConfirming(false)}>
              Cancel
            </Button>
          </div>
        </>
      ) : (
        <Button variant="danger" loading={pending} onClick={() => setConfirming(true)}>
          Delete
        </Button>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
