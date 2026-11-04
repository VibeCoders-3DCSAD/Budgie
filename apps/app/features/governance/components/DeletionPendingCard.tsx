import { useState } from "react";
import { ClockCountdown } from "phosphor-react-native";
import type { AccountDeletionRequest } from "../types";
import { ActionButton, Illustration, SummaryRow, formatShortDate } from "./governanceUi";

type Props = {
  request: AccountDeletionRequest;
  online: boolean;
  onCancel: () => Promise<void>;
  onBack: () => void;
};

// The spec's deletion-pending state, drawn like the design's "deletion requested" screen: the account is
// queued and the request can still be cancelled.
export function DeletionPendingCard({ request, online, onCancel, onBack }: Props) {
  const [cancelling, setCancelling] = useState(false);

  async function handleCancel() {
    setCancelling(true);
    try {
      await onCancel();
    } finally {
      setCancelling(false);
    }
  }

  return (
    <>
      <Illustration icon={ClockCountdown} title="Deletion pending">
        Your account deletion request is pending. Cancel the request before it is processed if you want to keep your account.
      </Illustration>
      <SummaryRow label="Scheduled deletion" value={formatShortDate(request.scheduled_delete_at)} />
      <ActionButton label="Keep my account" onPress={handleCancel} busy={cancelling} dimmed={!online} />
      <ActionButton label="Back to Settings" variant="ghost" onPress={onBack} disabled={cancelling} />
    </>
  );
}
