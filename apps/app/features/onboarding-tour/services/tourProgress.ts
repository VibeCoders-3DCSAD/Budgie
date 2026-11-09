import { readSecret, writeSecret } from "../../../lib/helpers/secureStorage";
import type { TourProgress, TourStatus } from "../types";

const KEY = "tour-progress";
const STATUSES: TourStatus[] = ["not_started", "skipped", "active", "paused", "completed"];

// Saved per user on this device, so it works offline. A tour that was running when the app closed or locked
// comes back as paused, ready to resume.
export async function readTourProgress(userId: string): Promise<TourProgress> {
  const raw = await readSecret(userId, KEY);
  const saved = parse(raw);
  if (!saved) return { status: "not_started", stepId: null, updatedAt: new Date(0).toISOString() };
  return saved.status === "active" ? { ...saved, status: "paused" } : saved;
}

export async function writeTourProgress(userId: string, progress: TourProgress): Promise<void> {
  await writeSecret(userId, KEY, JSON.stringify(progress));
}

function parse(raw: string | null): TourProgress | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<TourProgress>;
    if (!value.status || !STATUSES.includes(value.status)) return null;
    return { status: value.status, stepId: typeof value.stepId === "string" ? value.stepId : null, updatedAt: String(value.updatedAt ?? "") };
  } catch {
    return null;
  }
}
