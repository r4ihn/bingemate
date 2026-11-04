import { useId, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  PASSWORD_HINT,
  Role,
  USERNAME_MAX,
  USERNAME_MIN,
  normalizeUsername,
  passwordProblem,
  usernameError,
} from '@bingemate/shared';
import type { ProfileDTO } from '@bingemate/shared';
import { ApiError } from '../api/client.js';
import { listsApi } from '../api/lists.js';
import { usersApi } from '../api/users.js';
import { useAuth } from '../auth/AuthContext.js';
import { StateMessage } from '../components/StateMessage.js';
import { Badge } from '../components/ui/Badge.js';
import { Button } from '../components/ui/Button.js';
import { Field } from '../components/ui/Field.js';
import { Panel } from '../components/ui/Panel.js';
import { inputClass } from '../components/ui/inputClass.js';
import { useAsync } from '../hooks/useAsync.js';
import { LIST_STATUSES } from '../labels.js';

const ROLE_LABEL: Record<Role, string> = {
  [Role.CONSUMER]: 'Member',
  [Role.CREATOR]: 'Creator',
  [Role.ADMIN]: 'Admin',
};

// Same wording as the signup form
const USERNAME_HINT = `${USERNAME_MIN} to ${USERNAME_MAX} characters: letters, digits, spaces, _ - and .`;
const FALLBACK_ERROR = 'Something went wrong. Try again.';

/** Same fallback the API shows next to reviews for an account that has no username. */
const displayName = (p: ProfileDTO) => p.username ?? `user-${p.id.slice(0, 6)}`;

function memberSince(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** The signed-in user's account page: who they are, a username and password form, and list counts. */
export function Profile() {
  const { state, reload } = useAsync(() => usersApi.me(), []);

  if (state.status === 'loading') return <StateMessage kind="loading" />;
  if (state.status === 'error') {
    return (
      <StateMessage
        kind="error"
        title="Could not load your profile"
        detail={state.error instanceof Error ? state.error.message : undefined}
        onRetry={reload}
      />
    );
  }
  return <ProfileView initial={state.data} />;
}

function ProfileView({ initial }: { initial: ProfileDTO }) {
  // The name card and the username form share this, so a saved name shows at once
  const [profile, setProfile] = useState(initial);

  return (
    <div>
      <h1 className="text-4xl font-semibold tracking-tight">Profile</h1>
      <div className="mt-8 flex flex-wrap items-start gap-6">
        <aside className="min-w-0 flex-[1_1_300px]">
          <AccountCard profile={profile} />
        </aside>
        <div className="flex min-w-0 flex-[2_1_440px] flex-col gap-6">
          <UsernameForm profile={profile} onSaved={setProfile} />
          <PasswordForm />
        </div>
      </div>
      <Activity />
    </div>
  );
}

function AccountCard({ profile }: { profile: ProfileDTO }) {
  const name = displayName(profile);
  return (
    <Panel>
      <div
        aria-hidden="true"
        className="flex size-[72px] items-center justify-center rounded-full bg-accent text-3xl font-bold text-accent-ink"
      >
        {[...name][0]?.toUpperCase()}
      </div>
      <h2 className="mt-4 text-2xl font-semibold tracking-tight">{name}</h2>
      <div className="mt-2">
        <Badge tone="neutral">{ROLE_LABEL[profile.role]}</Badge>
      </div>
      <dl className="mt-6 grid gap-4 border-t border-line pt-5">
        <div>
          <dt className="text-sm text-muted">Email</dt>
          <dd className="break-all">{profile.email}</dd>
          <dd className="text-sm text-muted">Only you can see your email.</dd>
        </div>
        <div>
          <dt className="text-sm text-muted">Member since</dt>
          <dd>{memberSince(profile.createdAt)}</dd>
        </div>
      </dl>
    </Panel>
  );
}

function UsernameForm({
  profile,
  onSaved,
}: {
  profile: ProfileDTO;
  onSaved: (profile: ProfileDTO) => void;
}) {
  const { signIn } = useAuth();
  const headingId = useId();
  const [value, setValue] = useState(profile.username ?? '');
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (pending) return;
    setSaved(false);
    setSubmitError(null);
    const problem = usernameError(value) ?? undefined;
    setFieldError(problem);
    if (problem) return;

    setPending(true);
    try {
      const updated = await usersApi.updateUsername(normalizeUsername(value));
      onSaved(updated);
      // The header and every other screen read the signed-in user from here
      signIn({
        id: updated.id,
        email: updated.email,
        role: updated.role,
        username: updated.username,
      });
      setValue(updated.username ?? '');
      setFieldError(undefined);
      setSaved(true);
    } catch (err) {
      // The API's 400 and 409 are about the name itself ("Username already taken"), so they belong to the field
      if (err instanceof ApiError && (err.status === 400 || err.status === 409)) {
        setFieldError(err.message);
      } else {
        setSubmitError(err instanceof ApiError ? err.message : FALLBACK_ERROR);
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <Panel>
      <section aria-labelledby={headingId}>
        <h2 id={headingId} className="text-xl font-semibold">
          Username
        </h2>
        <p className="mt-1 text-sm text-muted">
          This is the name other readers see next to your reviews and replies.
        </p>
        <form onSubmit={(e) => void onSubmit(e)} noValidate className="mt-5 grid gap-4">
          <Field label="Username" error={fieldError} hint={USERNAME_HINT}>
            <input
              type="text"
              autoComplete="nickname"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className={inputClass}
            />
          </Field>
          {submitError && (
            <p role="alert" className="text-sm text-danger">
              {submitError}
            </p>
          )}
          <p role="status" className="text-sm text-success empty:hidden">
            {saved ? 'Username updated.' : ''}
          </p>
          <div>
            <Button type="submit" loading={pending}>
              Save username
            </Button>
          </div>
        </form>
      </section>
    </Panel>
  );
}

interface PasswordErrors {
  current?: string;
  next?: string;
  confirm?: string;
}

function PasswordForm() {
  const headingId = useId();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<PasswordErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (pending) return;
    setSaved(false);
    setSubmitError(null);

    const found: PasswordErrors = {};
    if (!current) found.current = 'Enter your current password';
    const problem = passwordProblem(next);
    if (problem) found.next = problem;
    else if (next === current) found.next = 'Choose a password different from your current one';
    if (confirm !== next) found.confirm = 'Passwords do not match';
    setErrors(found);
    if (found.current || found.next || found.confirm) return;

    setPending(true);
    try {
      await usersApi.changePassword(current, next);
      setCurrent('');
      setNext('');
      setConfirm('');
      setSaved(true);
    } catch (err) {
      setSubmitError(err instanceof ApiError ? err.message : FALLBACK_ERROR);
    } finally {
      setPending(false);
    }
  }

  return (
    <Panel>
      <section aria-labelledby={headingId}>
        <h2 id={headingId} className="text-xl font-semibold">
          Change password
        </h2>
        <p className="mt-1 text-sm text-muted">Enter your current password to set a new one.</p>
        <form onSubmit={(e) => void onSubmit(e)} noValidate className="mt-5 grid gap-4">
          <Field label="Current password" error={errors.current}>
            <input
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="New password" error={errors.next} hint={PASSWORD_HINT}>
            <input
              type="password"
              autoComplete="new-password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Confirm new password" error={errors.confirm}>
            <input
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className={inputClass}
            />
          </Field>
          {submitError && (
            <p role="alert" className="text-sm text-danger">
              {submitError}
            </p>
          )}
          <p role="status" className="text-sm text-success empty:hidden">
            {saved ? 'Password updated.' : ''}
          </p>
          <div>
            <Button type="submit" loading={pending}>
              Update password
            </Button>
          </div>
        </form>
      </section>
    </Panel>
  );
}

/**
 * How many titles are on each of the person's lists. Left out when the counts cannot be loaded, so
 * a failure here never gets in the way of the account forms.
 */
function Activity() {
  const headingId = useId();
  const { state } = useAsync(
    () =>
      Promise.all(
        LIST_STATUSES.map(({ status }) => listsApi.list({ status, page: 1 }).then((r) => r.total)),
      ),
    [],
  );
  if (state.status !== 'ready') return null;

  return (
    <div className="mt-6">
      <Panel>
        <section aria-labelledby={headingId}>
          <h2 id={headingId} className="text-xl font-semibold">
            Your activity
          </h2>
          <p className="mt-1 text-sm text-muted">What is on your lists right now.</p>
          <div className="mt-5 grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
            {LIST_STATUSES.map(({ status, label }, i) => (
              <div key={status} className="rounded-xl bg-ghost p-5">
                <p className="text-3xl font-bold tracking-tight">{state.data[i]}</p>
                <p className="text-sm text-muted">{label}</p>
                <Link
                  to="/me/lists"
                  className="mt-3 inline-block text-sm font-medium text-accent"
                  aria-label={`View ${label.toLowerCase()} in My Lists`}
                >
                  View in My Lists
                </Link>
              </div>
            ))}
          </div>
        </section>
      </Panel>
    </div>
  );
}
