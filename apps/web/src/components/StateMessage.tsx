import { Button } from './ui/Button.js';

type Kind = 'loading' | 'empty' | 'error';

const DEFAULTS: Record<Kind, { ghost: string; title: string }> = {
  loading: { ghost: '…', title: 'Loading…' },
  empty: { ghost: '0', title: 'Nothing here yet' },
  error: { ghost: '!', title: 'Something went wrong' },
};

const ROLES = { loading: 'status', empty: undefined, error: 'alert' } as const;

/** Loading, empty and error states: a ghost headline plus muted text (docs/ui.md B5). */
export function StateMessage({
  kind,
  title,
  detail,
  onRetry,
}: {
  kind: Kind;
  title?: string;
  detail?: string;
  onRetry?: () => void;
}) {
  const d = DEFAULTS[kind];
  return (
    <div role={ROLES[kind]} className="py-12">
      <p
        aria-hidden="true"
        className="text-[10vw] leading-none font-medium tracking-[-0.06em] text-ghost"
      >
        {d.ghost}
      </p>
      <h2 className="text-2xl font-semibold tracking-tight">{title ?? d.title}</h2>
      {detail && <p className="mt-2 text-muted">{detail}</p>}
      {kind === 'error' && onRetry && (
        <Button variant="secondary" className="mt-4" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}
