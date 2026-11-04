import { useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { normalizeUsername, usernameError, USERNAME_MIN, USERNAME_MAX } from '@bingemate/shared';
import type { AuthUser } from '@bingemate/shared';
import { ApiError } from '../api/client.js';
import { useAuth } from '../auth/AuthContext.js';
import { validateCredentials } from '../auth/validate.js';
import type { CredentialErrors } from '../auth/validate.js';
import { Button } from '../components/ui/Button.js';
import { Field } from '../components/ui/Field.js';
import { Panel } from '../components/ui/Panel.js';
import { inputClass } from '../components/ui/inputClass.js';

/** Credentials form shared by Login and Register. `strict` applies the registration rules. */
export function AuthForm({
  title,
  submitLabel,
  strict,
  withUsername = false,
  submit,
  footer,
}: {
  title: string;
  submitLabel: string;
  strict: boolean;
  withUsername?: boolean;
  submit: (credentials: {
    email: string;
    password: string;
    username?: string;
  }) => Promise<AuthUser>;
  footer: ReactNode;
}) {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const fromState = (
    location.state as { from?: { pathname?: string; search?: string; hash?: string } } | null
  )?.from;
  const from = fromState?.pathname
    ? `${fromState.pathname}${fromState.search ?? ''}${fromState.hash ?? ''}`
    : '/';

  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const emailRef = useRef<HTMLInputElement>(null);
  const usernameRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<CredentialErrors & { username?: string }>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (pending) return;
    const found: CredentialErrors & { username?: string } = strict
      ? validateCredentials(email, password)
      : {
          ...(email.trim() ? {} : { email: 'Enter your email' }),
          ...(password ? {} : { password: 'Enter your password' }),
        };
    if (withUsername) found.username = usernameError(username) ?? undefined;
    setErrors(found);
    setSubmitError(null);
    if (found.email || found.username || found.password) {
      (found.email ? emailRef : found.username ? usernameRef : passwordRef).current?.focus();
      return;
    }

    setPending(true);
    try {
      const user = await submit({
        email: email.trim(),
        password,
        ...(withUsername ? { username: normalizeUsername(username) } : {}),
      });
      signIn(user);
      navigate(from, { replace: true });
    } catch (err) {
      if (
        withUsername &&
        err instanceof ApiError &&
        err.status === 409 &&
        err.message === 'Username already taken'
      ) {
        setErrors({ username: err.message });
        usernameRef.current?.focus();
      } else {
        setSubmitError(err instanceof ApiError ? err.message : 'Something went wrong. Try again.');
      }
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
              ref={emailRef}
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
            />
          </Field>
          {withUsername && (
            <Field
              label="Username"
              error={errors.username}
              hint={`${USERNAME_MIN} to ${USERNAME_MAX} characters: letters, digits, spaces, _ - and .`}
            >
              <input
                ref={usernameRef}
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className={inputClass}
              />
            </Field>
          )}
          <Field label="Password" error={errors.password}>
            <input
              ref={passwordRef}
              type="password"
              autoComplete={strict ? 'new-password' : 'current-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass}
            />
          </Field>
          {submitError && (
            <p role="alert" className="text-sm text-danger">
              {submitError}
            </p>
          )}
          <Button type="submit" loading={pending}>
            {submitLabel}
          </Button>
        </form>
        <p className="mt-6 text-sm text-muted">{footer}</p>
      </Panel>
    </div>
  );
}
