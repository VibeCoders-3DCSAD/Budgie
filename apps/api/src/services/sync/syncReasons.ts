import { SYNC_REJECTION_REASONS, type SyncRejectionReason } from "@odin/sync-config";

// Database rejection text is internal wording and stays in server logs; clients receive a stable code.
export function publicSyncReason(reason: string | null | undefined): SyncRejectionReason {
  if (!reason) return SYNC_REJECTION_REASONS.rejected;
  if (reason.endsWith("version changed")) return SYNC_REJECTION_REASONS.versionConflict;
  if (reason === "record is deleted") return SYNC_REJECTION_REASONS.recordDeleted;
  if (/inaccessible|not accessible|does not reference/.test(reason)) return SYNC_REJECTION_REASONS.referenceUnavailable;
  if (reason.endsWith("not found")) return SYNC_REJECTION_REASONS.recordNotFound;
  return SYNC_REJECTION_REASONS.rejected;
}
