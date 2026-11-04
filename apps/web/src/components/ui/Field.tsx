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
  hint,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}) {
  const errorId = useId();
  const hintId = useId();
  const description = [hint ? hintId : '', error ? errorId : ''].filter(Boolean).join(' ');
  const control =
    description && isValidElement<Record<string, unknown>>(children)
      ? cloneElement(children, {
          'aria-invalid': error ? true : undefined,
          'aria-describedby': description,
        })
      : children;

  return (
    <div className="grid gap-2">
      <label className="grid gap-2 text-sm text-muted">
        <span>{label}</span>
        {control}
      </label>
      {hint && (
        <p id={hintId} className="text-sm text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
