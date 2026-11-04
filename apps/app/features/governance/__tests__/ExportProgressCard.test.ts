import { progressMessage } from "../components/ExportProgressCard";
import type { ExportProgress } from "../dataExport/runDataExport";

const reading: ExportProgress = { stage: "reading", dataset: "billers_and_remittances", datasetIndex: 10, datasetCount: 14, batch: 3, rowCount: 1500, resumesAt: null };

describe("progressMessage", () => {
  it("starts at 0% before the server lists the datasets", () => {
    expect(progressMessage({ kind: "preparing", progress: null })).toMatchObject({
      message: "Your data export is starting. Keep this screen open.",
      percent: 0,
    });
  });

  it("names the dataset being read, its position, and the batch", () => {
    expect(progressMessage({ kind: "preparing", progress: reading })).toEqual({
      title: "Exporting billers and remittances",
      message: "Reading your billers and remittances (11 of 14). Keep this screen open.",
      detail: "Batch 3 · 1,500 records so far",
      percent: 71,
    });
  });

  it("keeps the bar where it was while waiting to retry", () => {
    expect(progressMessage({ kind: "preparing", progress: { ...reading, stage: "retrying" } })).toMatchObject({
      message: "The export is taking a short break before trying again. Your progress is kept.",
      percent: 71,
    });
  });

  it("counts down to when a rate-limited export resumes", () => {
    const limited: ExportProgress = { ...reading, stage: "rate-limited", resumesAt: 10_000 };
    expect(progressMessage({ kind: "preparing", progress: limited }, 1_500)).toMatchObject({
      title: "Slowing down",
      message: "Too many requests were sent at once. The export resumes in 9 seconds. Your progress is kept.",
      percent: 71,
    });
    expect(progressMessage({ kind: "preparing", progress: limited }, 9_200).message).toContain("resumes in 1 second.");
  });

  it("is full while building and saving", () => {
    expect(progressMessage({ kind: "preparing", progress: { ...reading, stage: "building", datasetIndex: 14 } })).toMatchObject({
      message: "Your export file is being built. This only takes a moment.",
      percent: 100,
    });
    expect(progressMessage({ kind: "saving" })).toMatchObject({
      message: "Your export file is being saved. Choose where to keep it if asked.",
      percent: 100,
    });
  });
});
