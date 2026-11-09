jest.mock("expo-secure-store", () => {
  const values = new Map();
  return { WHEN_UNLOCKED_THIS_DEVICE_ONLY: "device",
    getItemAsync: jest.fn(async (key: string) => values.get(key) ?? null),
    setItemAsync: jest.fn(async (key: string, value: string) => { values.set(key, value); }) };
});
import { writeSecret } from "../../../lib/helpers/secureStorage";
import { readTourProgress, writeTourProgress } from "../services/tourProgress";

const user = "11111111-2222-4333-8444-555555555555";

it("starts as not started, and keeps each user's progress apart", async () => {
  expect(await readTourProgress(user)).toMatchObject({ status: "not_started", stepId: null });
  await writeTourProgress(user, { status: "skipped", stepId: null, updatedAt: "2026-11-09T00:00:00.000Z" });
  expect(await readTourProgress(user)).toMatchObject({ status: "skipped" });
  expect(await readTourProgress("99999999-2222-4333-8444-555555555555")).toMatchObject({ status: "not_started" });
});

it("brings a tour interrupted mid-run back as paused at its step", async () => {
  await writeTourProgress(user, { status: "active", stepId: "welcome", updatedAt: "2026-11-09T00:00:00.000Z" });
  expect(await readTourProgress(user)).toMatchObject({ status: "paused", stepId: "welcome" });
});

it("treats unreadable progress as not started", async () => {
  await writeSecret(user, "tour-progress", "{not json");
  expect(await readTourProgress(user)).toMatchObject({ status: "not_started" });
  await writeSecret(user, "tour-progress", JSON.stringify({ status: "teleported" }));
  expect(await readTourProgress(user)).toMatchObject({ status: "not_started" });
});
