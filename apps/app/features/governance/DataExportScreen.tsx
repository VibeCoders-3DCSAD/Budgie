import { Platform } from "react-native";
import { DownloadSimple, ShieldCheck } from "phosphor-react-native";
import { ROUTES } from "../../routes";
import { useSession } from "../auth/components/AccessProvider";
import { useConnectivityStore } from "../../services/connectivity";
import { useToast } from "../../components/Toast";
import { InnerPage } from "../shell/components/InnerPage";
import { goBackOr } from "../shell/helpers/shellNavigation";
import { ExportProgressCard } from "./components/ExportProgressCard";
import { ActionButton, GroupLabel, ListCard, ListRow, PageStack, StatusCard, WarnBanner } from "./components/governanceUi";
import { useDataExport } from "./dataExport/useDataExport";
import type { DataExportState } from "./dataExport/useDataExport";

const SAVE_LABEL = Platform.OS === "web" ? "Download file" : "Save file";
const SAVE_AGAIN_LABEL = Platform.OS === "web" ? "Download again" : "Save another copy";

const INCLUDED = [
  "Profile & account information",
  "All transaction history",
  "Budget plans & goals",
  "Debt management records",
  "Billers, remittances & consents",
];

// The server's wait, rounded up to whole minutes so the user never comes back too early.
export function exportLimitMessage(retryAfterMs: number): string {
  const minutes = Math.max(1, Math.ceil(retryAfterMs / 60_000));
  return `You have started too many exports. Try again in ${minutes} ${minutes === 1 ? "minute" : "minutes"}.`;
}

function primaryLabel(state: DataExportState): string {
  if (state.kind === "failed") return "Try the export again";
  if (state.kind !== "ready") return "Export my data";
  return state.saved ? SAVE_AGAIN_LABEL : SAVE_LABEL;
}

// Progress while the export is prepared and saved, the design's "export requested" card once there is a result;
// before that (default, offline) the page shows what the export holds.
function ExportStatus({ state }: { state: DataExportState }) {
  if (state.kind === "preparing") return <ExportProgressCard step={state} />;
  if (state.kind === "ready" && state.saving) return <ExportProgressCard step={{ kind: "saving" }} />;
  if (state.kind === "failed" && state.retryAfterMs !== null) {
    return <StatusCard tone="err" title="Export limit reached">{exportLimitMessage(state.retryAfterMs)}</StatusCard>;
  }
  if (state.kind === "failed") {
    return <StatusCard tone="err" title="Export failed">Your data export could not be prepared. Try the export again.</StatusCard>;
  }
  if (state.kind === "ready" && state.saved) {
    return <StatusCard tone="ok" title="Export saved">{`${state.prepared.fileName} · ${state.prepared.rowCount.toLocaleString("en-PH")} records`}</StatusCard>;
  }
  if (state.kind === "ready") {
    return <StatusCard tone="ok" title="Export ready">Your financial data export is ready. Save it before leaving this screen, or it must be prepared again.</StatusCard>;
  }
  return (
    <ListCard>
      <ListRow icon={ShieldCheck} tone="green" title="Your data" subtitle="Transactions, budgets and profile" />
      <ListRow icon={DownloadSimple} tone="grey" title="Format" subtitle="CSV — all your data in one spreadsheet file" divider />
    </ListCard>
  );
}

// Settings → Export data. Builds the CSV on the device from batched API reads, then saves it.
export default function DataExportScreen() {
  const { accessToken } = useSession();
  const { state, start, save } = useDataExport(accessToken);
  const online = useConnectivityStore(store => store.online);
  const { showToast } = useToast();

  const busy = state.kind === "preparing" || (state.kind === "ready" && state.saving);
  // Saving a prepared file works offline; preparing one needs the server.
  const needsNetwork = state.kind !== "ready";

  async function handlePrimary() {
    if (needsNetwork && !online) {
      showToast("This action can only be done while online");
      return;
    }
    if (state.kind === "ready") {
      if (await save(state.prepared)) showToast("Export saved", "success");
      return;
    }
    await start();
  }

  return (
    <InnerPage title="Export data" fallbackHref={ROUTES.settings}>
      <PageStack>
        {needsNetwork && !online ? <WarnBanner>You are offline. An export needs a connection.</WarnBanner> : null}
        <ExportStatus state={state} />
        <ActionButton label={primaryLabel(state)} icon={DownloadSimple} onPress={handlePrimary} busy={busy} dimmed={needsNetwork && !online} />
        {state.kind === "ready" ? <ActionButton label="Back to Settings" variant="ghost" onPress={() => goBackOr(ROUTES.settings)} disabled={busy} /> : null}
        <GroupLabel>What's included</GroupLabel>
        <ListCard>
          {INCLUDED.map((item, index) => <ListRow key={item} title={item} divider={index > 0} />)}
        </ListCard>
      </PageStack>
    </InnerPage>
  );
}
