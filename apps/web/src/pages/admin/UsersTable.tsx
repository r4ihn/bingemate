import { useState } from 'react';
import { Role } from '@bingemate/shared';
import { adminApi } from '../../api/admin.js';
import { Pagination } from '../../components/Pagination.js';
import { StateMessage } from '../../components/StateMessage.js';
import { Table, Td } from '../../components/ui/Table.js';
import { inputClass } from '../../components/ui/inputClass.js';
import { useAsync } from '../../hooks/useAsync.js';
import type { AdminUser } from '../../types/admin.js';

const ROLE_LABEL: Record<Role, string> = {
  [Role.CONSUMER]: 'Consumer',
  [Role.CREATOR]: 'Creator',
  [Role.ADMIN]: 'Admin',
};

export function UsersTable() {
  const [page, setPage] = useState(1);
  const { state, reload } = useAsync(() => adminApi.users(page), [page]);
  // Roles shown before the server confirms; a failure removes the override (rolls back)
  const [overrides, setOverrides] = useState<Record<string, Role>>({});
  const [error, setError] = useState<string | null>(null);

  async function changeRole(user: AdminUser, role: Role) {
    setError(null);
    setOverrides((o) => ({ ...o, [user.id]: role }));
    try {
      await adminApi.setRole(user.id, role);
    } catch {
      setOverrides((o) => {
        const next = { ...o };
        delete next[user.id];
        return next;
      });
      setError(`Could not change the role for ${user.email}. Try again.`);
    }
  }

  if (state.status === 'loading') return <StateMessage kind="loading" />;
  if (state.status === 'error') {
    return <StateMessage kind="error" detail="Users could not be loaded." onRetry={reload} />;
  }
  const { data, pageSize, total } = state.data;

  return (
    <>
      {error && (
        <p role="alert" className="mb-4 text-[0.85rem] text-danger">
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
                onChange={(e) => void changeRole(u, e.target.value as Role)}
                className={`${inputClass} py-2 text-[0.8rem]`}
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
    </>
  );
}
