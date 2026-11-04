import { SYNC_REJECTION_REASONS } from "@odin/sync-config";
import type { SyncQueueIssue } from "../services/syncQueue";

const PAYLOAD_TOO_LARGE_MESSAGE = "This change is too big and can't be synced with the server. Discard this to continue.";

// A rejection reason with its own advice replaces the generic message stored when the change was queued.
export function syncIssueMessage(issue: Pick<SyncQueueIssue, "failure_message" | "last_error">): string {
  if (issue.last_error === SYNC_REJECTION_REASONS.payloadTooLarge) return PAYLOAD_TOO_LARGE_MESSAGE;
  return issue.failure_message;
}
