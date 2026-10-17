import type { ReactNode } from 'react';

/**
 * Wraps a control in its label, so the label is bound without ids. The error sits outside the
 * <label> so it does not become part of the control's accessible name; role=alert announces it.
 */
export function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-2">
      <label className="grid gap-2 text-[0.8rem] text-muted">
        <span>{label}</span>
        {children}
      </label>
      {error && (
        <p role="alert" className="text-[0.8rem] text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
