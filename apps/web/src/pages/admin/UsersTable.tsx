import { useRef, useState } from 'react';
import { Role } from '@bingemate/shared';
import { adminApi } from '../../api/admin.js';
import { ConfirmDialog } from '../../components/ConfirmDialog.js';
import { Pagination } from '../../components/Pagination.js';
import { StateMessage } from '../../components/StateMessage.js';
import { Table, Td } from '../../components/ui/Table.js';
import { inputClass } from '../../components/ui/inputClass.js';
import { useAuth } from '../../auth/AuthContext.js';
import { useAsync } from '../../hooks/useAsync.js';
import type { AdminUser } from '../../types/admin.js';

const ROLE_LABEL: Record<Role, string> = {
  [Role.CONSUMER]: 'Consumer',
  [Role.CREATOR]: 'Creator',
  [Role.ADMIN]: 'Admin',
};

export function UsersTable() {
  const { user: me } = useAuth();
  const [page, setPage] = useState(1);
  const { state, reload } = useAsync(() => adminApi.users(page), [page]);
  // Roles shown before the server confirms. Each user's requests are numbered so a late failure of an
  // earlier request cannot roll back a newer one; a rollback goes to the last role the server accepted.
  const [overrides, setOverrides] = useState<Record<string, Role>>({});
  const confirmed = useRef<Record<string, Role>>({});
  const latest = useRef<Record<string, number>>({});
  const [promoting, setPromoting] = useState<AdminUser | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function changeRole(user: AdminUser, role: Role) {
    setError(null);
    const seq = (latest.current[user.id] ?? 0) + 1;
    latest.current[user.id] = seq;
    setOverrides((o) => ({ ...o, [user.id]: role }));
    try {
      await adminApi.setRole(user.id, role);
      confirmed.current[user.id] = role;
    } catch {
      if (latest.current[user.id] === seq) {
        setOverrides((o) => ({ ...o, [user.id]: confirmed.current[user.id] ?? user.role }));
      }
      setError(`Could not change the role for ${user.email}. Try again.`);
    }
  }

  function requestRole(user: AdminUser, role: Role) {
    const current = overrides[user.id] ?? user.role;
    if (role === current) return;
    // Granting admin is a privilege escalation: confirm first
    if (role === Role.ADMIN) setPromoting(user);
    else void changeRole(user, role);
  }

  if (state.status === 'loading') return <StateMessage kind="loading" />;
  if (state.status === 'error') {
    return <StateMessage kind="error" detail="Users could not be loaded." onRetry={reload} />;
  }
  const { data, pageSize, total } = state.data;

  return (
    <>
      {error && (
        <p role="alert" className="mb-4 text-sm text-danger">
          {error}
        </p>
      )}
      <Table caption="Users and roles" columns={['Email', 'Role']}>
        {data.map((u) => (
          <tr key={u.id}>
            <Td>{u.email}</Td>
            <Td>
              <select
                aria-label={`Role for ${u.email}`}
                value={overrides[u.id] ?? u.role}
                disabled={u.id === me?.id}
                title={u.id === me?.id ? 'You cannot change your own role' : undefined}
                onChange={(e) => requestRole(u, e.target.value as Role)}
                className={`${inputClass} py-2 text-sm`}
              >
                {Object.values(Role).map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </option>
                ))}
              </select>
            </Td>
          </tr>
        ))}
      </Table>
      <Pagination page={page} pageSize={pageSize} total={total} onChange={setPage} />
      <ConfirmDialog
        open={promoting !== null}
        title={promoting ? `Make ${promoting.email} an admin?` : ''}
        body="Admins can manage users, approve titles and delete any review or reply."
        confirmLabel="Make admin"
        tone="danger"
        onConfirm={async () => {
          const user = promoting;
          setPromoting(null);
          if (user) await changeRole(user, Role.ADMIN);
        }}
        onCancel={() => setPromoting(null)}
      />
    </>
  );
}
