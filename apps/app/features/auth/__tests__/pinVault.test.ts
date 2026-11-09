jest.mock("expo-secure-store", () => {
  const values = new Map();
  return { WHEN_UNLOCKED_THIS_DEVICE_ONLY: "device",
    getItemAsync: jest.fn(async (key) => values.get(key) ?? null),
    setItemAsync: jest.fn(async (key, value) => { values.set(key, value); }),
    deleteItemAsync: jest.fn(async (key) => { values.delete(key); }) };
});
jest.mock("../../../local-db/client", () => ({ closeDatabase: jest.fn(), initDatabase: jest.fn() }));
jest.mock("../services/pinCrypto", () => ({ createSecret: jest.fn(async () => "a".repeat(64)),
  wrapKey: jest.fn(async () => ({ version: 1, iterations: 600000, salt: "a".repeat(32), wrappedKey: "A".repeat(80) })),
  unwrapKey: jest.fn() }));

import * as SecureStore from "expo-secure-store";
import { initDatabase } from "../../../local-db/client";
import { PIN_LOCKOUT_MS } from "../helpers/pinPolicy";
import { readAccount, readEnvelope, writeAccount, writeSecret } from "../services/authStorage";
import { unwrapKey } from "../services/pinCrypto";
import { enrollPin, lockVault, unlockWithPin } from "../services/pinVault";
import { startPracticeMode, usePracticeModeStore } from "../../../services/practiceMode";
import { accountFixture, anotherUserId, dataKey, userId } from "./fixtures";

describe("persistent PIN vault", () => {
  let now: number;
  beforeEach(async () => {
    now = 1_800_000_000_000;
    jest.spyOn(Date, "now").mockImplementation(() => now);
    jest.clearAllMocks();
    await writeAccount(accountFixture(now));
    await writeSecret(userId, "pin.v1", JSON.stringify({ version: 1, iterations: 600000,
      salt: "a".repeat(32), wrappedKey: "A".repeat(80) }));
    await writeSecret(userId, "device-secret", dataKey);
    jest.mocked(unwrapKey).mockResolvedValue(null);
  });
  afterEach(async () => { await lockVault(); jest.restoreAllMocks(); });

  it("persists five failures, rejects even a correct PIN during lockout, then offers five attempts", async () => {
    for (let index = 0; index < 4; index++) {
      expect(await unlockWithPin(userId, "123456")).toEqual({ status: "incorrect", attemptsRemaining: 4 - index });
    }
    expect(await unlockWithPin(userId, "123456")).toEqual({ status: "locked-out", remainingMs: PIN_LOCKOUT_MS });
    await lockVault();
    expect((await readAccount())?.attempts.failedAttempts).toBe(5);
    jest.mocked(unwrapKey).mockResolvedValue(dataKey);
    expect(await unlockWithPin(userId, "001234")).toEqual({ status: "locked-out", remainingMs: PIN_LOCKOUT_MS });
    expect(unwrapKey).toHaveBeenCalledTimes(5);
    now += PIN_LOCKOUT_MS - 1;
    expect(await unlockWithPin(userId, "001234")).toEqual({ status: "locked-out", remainingMs: 1 });
    now++;
    expect(await unlockWithPin(userId, "001234")).toEqual({ status: "unlocked" });
    expect((await readAccount())?.attempts.failedAttempts).toBe(0);
  });

  it("serializes simultaneous guesses so they cannot exceed the attempt budget", async () => {
    const results = await Promise.all(Array.from({ length: 12 }, () => unlockWithPin(userId, "123456")));
    expect(unwrapKey).toHaveBeenCalledTimes(5);
    expect(results.filter((result) => result.status === "locked-out")).toHaveLength(8);
  });

  it("does not attempt verification when reserving the attempt fails", async () => {
    jest.mocked(SecureStore.setItemAsync).mockRejectedValueOnce(new Error("Storage unavailable"));
    await expect(unlockWithPin(userId, "123456")).rejects.toThrow();
    expect(unwrapKey).not.toHaveBeenCalled();
    expect(initDatabase).not.toHaveBeenCalled();
  });

  it("consumes the reserved attempt if verification crashes", async () => {
    jest.mocked(unwrapKey).mockRejectedValueOnce(new Error("Interrupted verification"));
    await expect(unlockWithPin(userId, "123456")).rejects.toThrow();
    expect((await readAccount())?.attempts.failedAttempts).toBe(1);
  });

  it("preserves expiry on successful PIN unlock", async () => {
    const before = await readAccount();
    jest.mocked(unwrapKey).mockResolvedValue(dataKey);
    now += 1000;
    await unlockWithPin(userId, "001234");
    expect((await readAccount())?.expiresAt).toBe(before?.expiresAt);
  });

  it("rejects a different account and expired allowance before key derivation", async () => {
    await expect(unlockWithPin(anotherUserId, "123456")).rejects.toThrow();
    now = accountFixture(now).expiresAt;
    await expect(unlockWithPin(userId, "123456")).rejects.toThrow();
    expect(unwrapKey).not.toHaveBeenCalled();
  });

  it("rejects corrupt enrollment and does not replace it without recovery", async () => {
    await writeSecret(userId, "pin.v1", "{}");
    await expect(readEnvelope(userId)).rejects.toThrow();
    await expect(enrollPin(userId, "123456")).rejects.toThrow();
  });

  it("ends a running tour and closes its practice database when the app locks", async () => {
    const practice = { closeAsync: jest.fn(async () => {}) };
    startPracticeMode(practice as never, jest.fn());
    await lockVault();
    expect(usePracticeModeStore.getState().active).toBe(false);
    expect(practice.closeAsync).toHaveBeenCalledTimes(1);
  });
});
