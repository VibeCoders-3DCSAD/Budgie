export const PULL_PAGE_SIZE: number;

export const SYNC_REJECTION_REASONS: Readonly<{
  versionConflict: "version_conflict";
  recordDeleted: "record_deleted";
  recordNotFound: "record_not_found";
  referenceUnavailable: "reference_unavailable";
  invalidOperation: "invalid_operation";
  rejected: "sync_rejected";
}>;

export type SyncRejectionReason = typeof SYNC_REJECTION_REASONS[keyof typeof SYNC_REJECTION_REASONS];

export const DEVICE_NOT_REGISTERED: "device_not_registered";
