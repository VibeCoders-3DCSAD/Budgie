import { useState } from "react";
import { ActivityIndicator } from "react-native";
import { router } from "expo-router";
import { ClockCounterClockwise, Info, Pulse, TrendUp, WarningCircle } from "phosphor-react-native";
import { ROUTES } from "../../routes";
import { useSession } from "../auth/components/AccessProvider";
import { useLogout } from "../sync/SyncProvider";
import { useConnectivityStore } from "../../services/connectivity";
import { useToast } from "../../components/Toast";
import { InnerPage } from "../shell/components/InnerPage";
import { goBackOr } from "../shell/helpers/shellNavigation";
import { confirmAccountDeletion, requestAccountDeletion } from "./api";
import type { AccountDeletionRequest } from "./types";
import { ActionButton, CheckRow, Illustration, ListCard, ListRow, Nudge, PageStack, privacyTones } from "./components/governanceUi";
import { DeletionHistory } from "./components/DeletionHistory";
import { DeletionPendingCard } from "./components/DeletionPendingCard";
import { useActiveAccountDeletion } from "./hooks/useActiveAccountDeletion";
import { useDeletionHistory } from "./hooks/useDeletionHistory";

const ACKNOWLEDGEMENT = "I understand this permanently deletes my account and all data.";
const OFFLINE_MESSAGE = "This action can only be done while online";

// Settings → Delete account. Queues the account for deletion 30 days out; while queued, it can be cancelled here.
export default function AccountOffboardingScreen() {
  const { accessToken } = useSession();
  const { showDeletionSuccess } = useLogout();
  const [checked, setChecked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const online = useConnectivityStore(state => state.online);
  const { showToast } = useToast();
  const activeDeletion = useActiveAccountDeletion(accessToken, online);
  const history = useDeletionHistory(accessToken, online);

  const back = () => goBackOr(ROUTES.settings);

  async function handleCancelPending(requestId: string) {
    if (!online) {
      showToast(OFFLINE_MESSAGE);
      return;
    }
    try {
      if (await activeDeletion.cancel(requestId)) {
        history.reload();
        showToast("Deletion request cancelled. Your account stays.", "success");
        return;
      }
      showToast("Couldn't cancel the deletion request. Try again.");
    } catch {
      showToast("Couldn't cancel the deletion request. Try again.");
    }
  }

  // A request created earlier whose confirmation never went through is confirmed instead of duplicated.
  async function createOrReuseRequest(): Promise<AccountDeletionRequest | null> {
    const { state } = activeDeletion;
    if (state.kind === "active" && state.request.status === "requested") return state.request;
    const { response, body } = await requestAccountDeletion(accessToken);
    if (!response.ok) {
      if (response.status === 409) {
        showToast("You already have an active deletion request.");
        return null;
      }
      showToast(body.message ?? "Failed to create deletion request.");
      return null;
    }
    const created = body.payload?.request;
    if (!created) showToast("Unexpected response. Please try again.");
    return created ?? null;
  }

  async function handleDelete() {
    if (!checked || submitting) return;
    if (!online) {
      showToast(OFFLINE_MESSAGE);
      return;
    }
    setSubmitting(true);
    try {
      const deletionRequest = await createOrReuseRequest();
      if (!deletionRequest) {
        setSubmitting(false);
        return;
      }
      const { response, body } = await confirmAccountDeletion(accessToken, deletionRequest.id);
      if (!response.ok) {
        showToast(body.message ?? "Failed to confirm deletion.");
        setSubmitting(false);
        return;
      }
      showDeletionSuccess(body.payload?.request.scheduled_delete_at ?? deletionRequest.scheduled_delete_at ?? "");
    } catch {
      showToast("Couldn't complete request.");
      setSubmitting(false);
    }
  }

  function renderBody() {
    const { state } = activeDeletion;
    if (state.kind === "loading") return <ActivityIndicator color={privacyTones.danger} style={{ marginTop: 24 }} />;
    if (state.kind === "active" && state.request.status === "processing") {
      const pending = state.request;
      return <DeletionPendingCard request={pending} online={online} onCancel={() => handleCancelPending(pending.id)} onBack={back} />;
    }
    return (
      <>
        <Illustration icon={WarningCircle} title="This can't be undone">Deleting your account permanently removes:</Illustration>
        <ListCard>
          <ListRow icon={ClockCounterClockwise} tone="red" title="All transactions & history" />
          <ListRow icon={TrendUp} tone="red" title="Budgets, goals & debt plans" divider />
          <ListRow icon={Pulse} tone="red" title="Your personalization settings" divider />
        </ListCard>
        <Nudge icon={Info} title="Export your data first" body="Get a CSV file of your data before you delete." actionLabel="Export" onAction={() => router.push(ROUTES.dataExport)} />
        <CheckRow checked={checked} onToggle={() => setChecked(!checked)} label={ACKNOWLEDGEMENT} />
        <ActionButton label="Delete my account" variant="danger" onPress={handleDelete} busy={submitting} disabled={!checked} dimmed={!online} />
        <ActionButton label="Cancel" variant="ghost" onPress={back} disabled={submitting} />
      </>
    );
  }

  return (
    <InnerPage title="Delete account" fallbackHref={ROUTES.settings}>
      <PageStack>
        {renderBody()}
        {activeDeletion.state.kind === "loading" ? null : <DeletionHistory requests={history.requests} />}
      </PageStack>
    </InnerPage>
  );
}
