import { cloneElement, isValidElement, useId } from 'react';
import type { ReactNode } from 'react';

/**
 * Wraps a control in its label, so the label is bound without ids. The error sits outside the
 * <label> so it does not become part of the control's accessible name; the control is marked
 * aria-invalid and described by the error so it is read when the control is focused.
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
  const errorId = useId();
  const control =
    error && isValidElement<Record<string, unknown>>(children)
      ? cloneElement(children, { 'aria-invalid': true, 'aria-describedby': errorId })
      : children;

  return (
    <div className="grid gap-2">
      <label className="grid gap-2 text-sm text-muted">
        <span>{label}</span>
        {control}
      </label>
      {error && (
        <p id={errorId} role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
