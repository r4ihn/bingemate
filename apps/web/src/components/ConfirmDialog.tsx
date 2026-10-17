import { useEffect, useRef, useState } from 'react';
import { Button } from './ui/Button.js';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  tone?: 'primary' | 'danger';
  /** Return a promise to keep the button disabled until it settles; otherwise it stays disabled. */
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}

function Modal({
  title,
  body,
  confirmLabel,
  tone = 'primary',
  onConfirm,
  onCancel,
}: Omit<ConfirmDialogProps, 'open'>) {
  const ref = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);

  // showModal() traps focus; start on Cancel (first button) so Enter/Space never confirms by accident
  useEffect(() => {
    const el = ref.current;
    if (!el || el.open) return;
    if (typeof el.showModal === 'function') el.showModal();
    else el.setAttribute('open', '');
    el.querySelector('button')?.focus();
  }, []);

  function confirm() {
    if (busy) return;
    setBusy(true);
    const result: unknown = onConfirm();
    if (result instanceof Promise) void result.finally(() => setBusy(false));
  }

  return (
    <dialog
      ref={ref}
      aria-labelledby="confirm-title"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          onCancel();
        }
      }}
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
      className="m-auto w-[min(92vw,26rem)] rounded-2xl border border-line bg-surface p-6 text-white backdrop:bg-black/70"
    >
      <h2 id="confirm-title" className="text-xl font-semibold tracking-tight">
        {title}
      </h2>
      <p className="mt-2 text-muted">{body}</p>
      <div className="mt-6 flex justify-end gap-3">
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant={tone} disabled={busy} onClick={confirm}>
          {confirmLabel}
        </Button>
      </div>
    </dialog>
  );
}

export function ConfirmDialog({ open, ...rest }: ConfirmDialogProps) {
  return open ? <Modal {...rest} /> : null;
}
