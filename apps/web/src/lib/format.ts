const dateTime = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' });

export const formatDateTime = (iso: string | null | undefined) =>
  iso ? dateTime.format(new Date(iso)) : '—';

export const USER_STATUS_LABEL = {
  ACTIVE: 'Active',
  INACTIVE: 'Inactive',
  LOCKED: 'Locked',
} as const;
export const USER_STATUS_TONE = { ACTIVE: 'green', INACTIVE: 'gray', LOCKED: 'red' } as const;
