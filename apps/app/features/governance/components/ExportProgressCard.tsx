import { ActivityIndicator, Text, View } from "react-native";
import type { ExportProgress } from "../dataExport/runDataExport";
import { privacyTones } from "./governanceUi";

const FONT = "Manrope";

// What the card shows: a short title, the §14 status message, an optional batch line, and the bar's fill.
export type ProgressMessage = { title: string; message: string; detail: string | null; percent: number };

// The step the card describes: the export's own progress, or the file being saved once it is built.
export type ExportStep = { kind: "preparing"; progress: ExportProgress | null } | { kind: "saving" };

// "billers_and_remittances" → "billers and remittances".
function datasetLabel(dataset: string): string {
  return dataset.replace(/_/g, " ");
}

function records(count: number): string {
  return `${count.toLocaleString("en-PH")} ${count === 1 ? "record" : "records"}`;
}

// Datasets are read one after another, so the bar moves by finished datasets.
function readPercent({ datasetIndex, datasetCount }: ExportProgress): number {
  if (datasetCount === 0) return 0;
  return Math.round((datasetIndex / datasetCount) * 100);
}

function batchDetail(progress: ExportProgress): string | null {
  if (progress.batch === 0) return null;
  return `Batch ${progress.batch} · ${records(progress.rowCount)} so far`;
}

// Copy follows docs/requirements-engineering/features/14-user-settings.md (export status messages).
export function progressMessage(step: ExportStep): ProgressMessage {
  if (step.kind === "saving") {
    return { title: "Saving file", message: "Your export file is being saved. Choose where to keep it if asked.", detail: null, percent: 100 };
  }
  const { progress } = step;
  if (progress === null || progress.stage === "starting") {
    return { title: "Starting export", message: "Your data export is starting. Keep this screen open.", detail: null, percent: 0 };
  }
  if (progress.stage === "building") {
    return { title: "Building file", message: "Your export file is being built. This only takes a moment.", detail: `${records(progress.rowCount)} gathered`, percent: 100 };
  }
  if (progress.stage === "retrying") {
    return { title: "Waiting to retry", message: "The export is taking a short break before trying again. Your progress is kept.", detail: batchDetail(progress), percent: readPercent(progress) };
  }
  const name = datasetLabel(progress.dataset ?? "data");
  return {
    title: `Exporting ${name}`,
    message: `Reading your ${name} (${progress.datasetIndex + 1} of ${progress.datasetCount}). Keep this screen open.`,
    detail: batchDetail(progress),
    percent: readPercent(progress),
  };
}

// Shown while the export is prepared and saved: a progress bar and a message saying what is happening.
export function ExportProgressCard({ step }: { step: ExportStep }) {
  const { title, message, detail, percent } = progressMessage(step);
  return (
    <View
      accessibilityLiveRegion="polite"
      style={{ borderWidth: 1, borderColor: privacyTones.outline, borderRadius: 16, paddingVertical: 14, paddingHorizontal: 15, gap: 10, backgroundColor: privacyTones.surface }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <ActivityIndicator size="small" color={privacyTones.brand} />
        <Text style={{ flex: 1, fontFamily: FONT, fontSize: 13.5, fontWeight: "700", color: privacyTones.ink }}>{title}</Text>
        <Text style={{ fontFamily: FONT, fontSize: 12.5, fontWeight: "700", color: privacyTones.ink2 }}>{`${percent}%`}</Text>
      </View>
      <View
        accessibilityRole="progressbar"
        accessibilityLabel="Export progress"
        accessibilityValue={{ min: 0, max: 100, now: percent }}
        style={{ height: 8, borderRadius: 4, overflow: "hidden", backgroundColor: privacyTones.greyWash }}
      >
        <View style={{ width: `${percent}%`, height: "100%", borderRadius: 4, backgroundColor: privacyTones.brand }} />
      </View>
      <Text style={{ fontFamily: FONT, fontSize: 12.5, lineHeight: 18.75, color: privacyTones.ink2 }}>{message}</Text>
      {detail === null ? null : <Text style={{ fontFamily: FONT, fontSize: 11.5, lineHeight: 16, color: privacyTones.ink2 }}>{detail}</Text>}
    </View>
  );
}
