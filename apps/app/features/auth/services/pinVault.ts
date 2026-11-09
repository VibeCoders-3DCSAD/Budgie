import { AccessError } from "../../../lib/helpers/accessErrors";
import { closeDatabase, initDatabase } from "../../../local-db/client";
import { setDatabaseCredentials } from "../../../local-db/databaseAccess";
import { isValidPin, MAX_PIN_ATTEMPTS, needsOnlineVerification, recordFailedPin,
  remainingLockout, resetAttempts } from "../helpers/pinPolicy";
import { readAccount, readEnvelope, readSecret, writeAccount, writeSecret } from "./authStorage";
import { createSecret, unwrapKey, wrapKey } from "./pinCrypto";
import { withAuthLock } from "./authMutex";
import type { PinResult } from "../types";
import { accessNow } from "../helpers/accessClock";
import { tracePinStep } from "../../../lib/helpers/pinSetupTrace";
import { endPracticeMode } from "../../../services/practiceMode";

export async function lockVault(): Promise<void> {
  // Locking ends a running tour too, so unlocking always returns to the user's own data.
  await endPracticeMode();
  setDatabaseCredentials(null);
  await closeDatabase();
}

async function openVault(userId: string, key: string) {
  setDatabaseCredentials({ userId, key });
  try { await tracePinStep("vault.initialize-database", initDatabase); }
  catch (error) { await tracePinStep("vault.close-after-failure", lockVault); throw error; }
}

export function enrollPin(userId: string, pin: string, recovery = false): Promise<void> {
  return withAuthLock(async () => {
    if (!isValidPin(pin)) throw new AccessError("Enter exactly six digits.");
    const account = await tracePinStep("enroll.read-account", readAccount);
    if (!account || account.session.userId !== userId || needsOnlineVerification(account, accessNow(account))) {
      throw new AccessError("Verify your account online before setting a PIN.");
    }
    if (!recovery && await tracePinStep("enroll.read-envelope", () => readEnvelope(userId))) throw new AccessError("This account already has a PIN.");
    let secret = await tracePinStep("enroll.read-device-secret", () => readSecret(userId, "device-secret"));
    let dataKey = await tracePinStep("enroll.read-recovery-key", () => readSecret(userId, "recovery-key"));
    if (!secret || (recovery && !/^[0-9a-f]{64}$/.test(secret))) {
      secret = await tracePinStep("enroll.generate-device-secret", createSecret);
      await tracePinStep("enroll.save-device-secret", () => writeSecret(userId, "device-secret", secret!));
    }
    if (!dataKey) {
      if (recovery) throw new AccessError("The local recovery key is unavailable. Local data has been preserved.");
      dataKey = await tracePinStep("enroll.generate-data-key", createSecret);
      await tracePinStep("enroll.save-recovery-key", () => writeSecret(userId, "recovery-key", dataKey!));
    }
    const envelope = await tracePinStep("enroll.wrap-key", () => wrapKey(pin, secret!, dataKey!));
    if (needsOnlineVerification(account, accessNow(account))) throw new AccessError("Verify your account online before setting a PIN.");
    // Persist protection before migration so interrupted enrollment can always be recovered.
    await tracePinStep("enroll.save-envelope", () => writeSecret(userId, "pin.v1", JSON.stringify(envelope)));
    await openVault(userId, dataKey);
    try { await tracePinStep("enroll.save-unlocked-account", () => writeAccount({ ...account, attempts: resetAttempts(accessNow(account)) })); }
    catch (error) { await lockVault(); throw error; }
  }, "pin-enrollment");
}

export function unlockWithPin(userId: string, pin: string): Promise<PinResult> {
  return withAuthLock(async () => {
    const account = await readAccount();
    const now = account ? accessNow(account) : Date.now();
    if (!account || account.session.userId !== userId || needsOnlineVerification(account, now)) {
      throw new AccessError("Connect to the internet to verify this account.");
    }
    const remainingMs = remainingLockout(account.attempts, now);
    if (remainingMs > 0) return { status: "locked-out", remainingMs };
    if (!isValidPin(pin)) throw new AccessError("Enter exactly six digits.");
    const envelope = await readEnvelope(userId);
    const secret = await readSecret(userId, "device-secret");
    if (!envelope || !secret || !/^[0-9a-f]{64}$/.test(secret)) throw new AccessError("Verify your account online to recover PIN access.");
    const attempts = recordFailedPin(account.attempts, now);
    // Reserve the attempt durably before verification; crashes consume an attempt.
    await writeAccount({ ...account, attempts });
    const key = await unwrapKey(pin, secret, envelope);
    if (!key) return attempts.lockedUntil
      ? { status: "locked-out", remainingMs: remainingLockout(attempts, now) }
      : { status: "incorrect", attemptsRemaining: MAX_PIN_ATTEMPTS - attempts.failedAttempts };
    if (needsOnlineVerification(account, accessNow(account))) throw new AccessError("Connect to the internet to verify this account.");
    await openVault(userId, key);
    try { await writeAccount({ ...account, attempts: resetAttempts(accessNow(account)) }); }
    catch (error) { await lockVault(); throw error; }
    return { status: "unlocked" };
  }, "pin-unlock");
}
