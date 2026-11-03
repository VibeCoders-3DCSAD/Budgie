// Most rows the server sends per table in one pull page.
const PULL_PAGE_SIZE = 1000;

// Stable reasons the server returns for rejected or conflicting sync operations.
// Database wording stays in server logs; clients branch on these codes only.
const SYNC_REJECTION_REASONS = Object.freeze({
  versionConflict: "version_conflict",
  recordDeleted: "record_deleted",
  recordNotFound: "record_not_found",
  referenceUnavailable: "reference_unavailable",
  // The operation failed request validation; resending it unchanged can never succeed.
  invalidOperation: "invalid_operation",
  rejected: "sync_rejected",
});

// Code on a push the server refuses because it has no active registration for the device.
// The client registers the device again and resends the batch.
const DEVICE_NOT_REGISTERED = "device_not_registered";

module.exports = { PULL_PAGE_SIZE, SYNC_REJECTION_REASONS, DEVICE_NOT_REGISTERED };
