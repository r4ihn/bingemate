import { useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { AuthUser } from '@bingemate/shared';
import { ApiError } from '../api/client.js';
import { useAuth } from '../auth/AuthContext.js';
import { validateCredentials } from '../auth/validate.js';
import type { CredentialErrors } from '../auth/validate.js';
import { Button } from '../components/ui/Button.js';
import { Field } from '../components/ui/Field.js';
import { Panel } from '../components/ui/Panel.js';
import { inputClass } from '../components/ui/inputClass.js';

/** Email + password form shared by Login and Register. `strict` applies the registration rules. */
export function AuthForm({
  title,
  submitLabel,
  strict,
  submit,
  footer,
}: {
  title: string;
  submitLabel: string;
  strict: boolean;
  submit: (email: string, password: string) => Promise<AuthUser>;
  footer: ReactNode;
}) {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname ?? '/';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<CredentialErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (pending) return;
    const found: CredentialErrors = strict
      ? validateCredentials(email, password)
      : {
          ...(email.trim() ? {} : { email: 'Enter your email' }),
          ...(password ? {} : { password: 'Enter your password' }),
        };
    setErrors(found);
    setSubmitError(null);
    if (found.email || found.password) return;

    setPending(true);
    try {
      const user = await submit(email.trim(), password);
      signIn(user);
      navigate(from, { replace: true });
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : 'Something went wrong. Try again.');
      setPending(false);
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <Panel>
        <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        <form onSubmit={(e) => void onSubmit(e)} noValidate className="mt-6 grid gap-4">
          <Field label="Email" error={errors.email}>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Password" error={errors.password}>
            <input
              type="password"
              autoComplete={strict ? 'new-password' : 'current-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass}
            />
          </Field>
          {submitError && (
            <p role="alert" className="text-[0.8rem] text-danger">
              {submitError}
            </p>
          )}
          <Button type="submit" loading={pending}>
            {submitLabel}
          </Button>
        </form>
        <p className="mt-6 text-[0.8rem] text-muted">{footer}</p>
      </Panel>
    </div>
  );
}
