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

module.exports = { PULL_PAGE_SIZE, SYNC_REJECTION_REASONS };
