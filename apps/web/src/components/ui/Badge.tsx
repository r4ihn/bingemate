import type { ReactNode } from 'react';
import type { ListStatus, TitleStatus } from '@bingemate/shared';

type Tone = 'pending' | 'approved' | 'rejected' | 'neutral' | 'creator';

const TONES: Record<Tone, string> = {
  pending: 'border-current text-warn',
  approved: 'border-current text-success',
  rejected: 'border-current text-danger',
  neutral: 'border-current text-muted',
  creator: 'border-accent bg-accent text-accent-ink',
};

export function Badge({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-[5px] text-xs font-medium ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}

const STATUS: Record<TitleStatus | ListStatus, { tone: Tone; label: string }> = {
  PENDING: { tone: 'pending', label: 'Pending' },
  APPROVED: { tone: 'approved', label: 'Approved' },
  REJECTED: { tone: 'rejected', label: 'Rejected' },
  COMPLETED: { tone: 'neutral', label: 'Completed' },
  IN_PROGRESS: { tone: 'neutral', label: 'In progress' },
  PLAN_TO: { tone: 'neutral', label: 'Plan to' },
};

export function StatusBadge({ status }: { status: TitleStatus | ListStatus }) {
  const { tone, label } = STATUS[status];
  return <Badge tone={tone}>{label}</Badge>;
}
