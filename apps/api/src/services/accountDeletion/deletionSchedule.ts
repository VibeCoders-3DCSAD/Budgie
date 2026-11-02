const MIN_DELETION_DELAY_DAYS = 30;

export type DeletionSchedule = { scheduledDeleteAt: string } | { error: string };

// Accounts are deleted no sooner than 30 days after the request. Without a requested date, the earliest one is used.
export function resolveScheduledDeleteAt(requested: unknown, now = new Date()): DeletionSchedule {
  const minDate = new Date(now);
  minDate.setDate(minDate.getDate() + MIN_DELETION_DELAY_DAYS);
  const minDeleteAt = minDate.toISOString();

  if (requested === undefined) return { scheduledDeleteAt: minDeleteAt };

  const parsed = new Date(requested as string);
  if (isNaN(parsed.getTime())) return { error: "scheduled_delete_at must be a valid date string" };

  const scheduledDeleteAt = parsed.toISOString();
  if (scheduledDeleteAt < minDeleteAt) return { error: `scheduled_delete_at must be at least ${MIN_DELETION_DELAY_DAYS} days from now` };
  return { scheduledDeleteAt };
}
