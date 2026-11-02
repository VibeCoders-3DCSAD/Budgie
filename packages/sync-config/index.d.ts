export const PULL_PAGE_SIZE: number;

export const SYNC_REJECTION_REASONS: Readonly<{
  versionConflict: "version_conflict";
  recordDeleted: "record_deleted";
  recordNotFound: "record_not_found";
  referenceUnavailable: "reference_unavailable";
  rejected: "sync_rejected";
}>;

export type SyncRejectionReason = typeof SYNC_REJECTION_REASONS[keyof typeof SYNC_REJECTION_REASONS];
