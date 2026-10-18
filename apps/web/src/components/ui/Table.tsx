import type { ReactNode } from 'react';

/** Panel-styled data table (docs/ui.md B4). `caption` is read by screen readers only. */
export function Table({
  caption,
  columns,
  children,
}: {
  caption: string;
  columns: string[];
  children: ReactNode;
}) {
  return (
    <div className="relative overflow-x-auto rounded-2xl border border-line bg-surface">
      <table className="w-full border-collapse text-[0.85rem]">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c}
                scope="col"
                className="px-4 py-3 text-left text-xs font-medium tracking-wider text-muted uppercase"
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function Td({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <td className={`border-t border-line px-4 py-3.5 ${className}`}>{children}</td>;
}
