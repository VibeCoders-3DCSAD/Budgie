import { create } from "zustand";
import { AccessError } from "../../../lib/helpers/accessErrors";
import { accessNow, resetAccessClock } from "../helpers/accessClock";
import { clearTransactionCache } from "../../ledger/transactionCache";
import { abortProtectedRequests, configureLocalAccess, configureTokenResolver } from "../../../lib/localAccess";
import { isValidPin, needsOnlineVerification, remainingLockout } from "../helpers/pinPolicy";
import { clearRememberedAccount, readAccount, readEnvelope, readLegacySession, writeAccount } from "../services/authStorage";
import { acceptOnlineLogin, accessTokenExpiring, OnlineVerificationError, refreshOnlineSession } from "../services/sessionService";
import { enrollPin, lockVault, unlockWithPin } from "../services/pinVault";
import { withAuthLock } from "../services/authMutex";
import { tracePinStep } from "../../../lib/helpers/pinSetupTrace";
import { clearSdkSession } from "../../../lib/sdkSessionStorage";
import type { AccessPhase, AuthenticatedState, LocalAccount, OfflineAccount } from "../types";

interface AuthState {
  phase: AccessPhase;
  account: LocalAccount | null;
  busy: boolean;
  error: string | null;
  lockoutMs: number;
  recoveryVerified: boolean;
  hydrate: () => Promise<void>;
  acceptLogin: (session: AuthenticatedState) => Promise<boolean>;
  submitPin: (pin: string) => Promise<void>;
  setupPin: (pin: string) => Promise<void>;
  lock: () => Promise<void>;
  checkAccess: () => Promise<void>;
  verifyOnline: () => Promise<void>;
  startRecovery: () => Promise<void>;
  finishLogout: () => Promise<void>;
  updateOnboarding: () => Promise<void>;
}

let generation = 0;
let recoveryRequested = false;
let checking = false;
const safeMessage = (error: unknown) => error instanceof AccessError
  ? error.message : "We couldn't unlock Budgie. Your local records are safe. Please try again.";

// The refresh token never leaves the protected record, and memory holds an access token only while unlocked.
function localAccount(account: OfflineAccount | null, unlocked = false): LocalAccount | null {
  if (!account) return null;
  const { refreshToken: _refreshToken, ...session } = account.session;
  const visible = { ...account, session };
  if (unlocked) return visible;
  return withoutAccessToken(visible);
}

function withoutAccessToken(account: LocalAccount): LocalAccount {
  return { ...account, session: { ...account.session, accessToken: "" } };
}

export const useAuthStore = create<AuthState>((set, get) => ({
  phase: "hydrating", account: null, busy: false, error: null, lockoutMs: 0, recoveryVerified: false,
  hydrate: async () => {
    const epoch = generation;
    const apply = (value: Partial<AuthState>) => { if (epoch === generation) set(value); };
    try {
      resetAccessClock();
      const account = await readAccount();
      if (account) {
        const envelope = await readEnvelope(account.session.userId);
        apply({ account: localAccount(account), phase: needsOnlineVerification(account, accessNow(account)) ? "verification-required"
          : envelope ? "locked" : "enrollment-required", lockoutMs: remainingLockout(account.attempts, accessNow(account)) });
        return;
      }
      const legacy = await readLegacySession();
      if (legacy && typeof legacy === "object" && "accessToken" in legacy && "refreshToken" in legacy
        && "provider" in legacy && typeof legacy.accessToken === "string" && typeof legacy.refreshToken === "string"
        && (legacy.provider === "password" || legacy.provider === "google")) {
        try {
          const restored = await acceptOnlineLogin({ accessToken: legacy.accessToken,
            refreshToken: legacy.refreshToken, provider: legacy.provider });
          apply({ account: localAccount(restored), phase: "enrollment-required" });
          return;
        } catch { /* Keep the legacy record if online restoration is unavailable. */ }
      }
      apply({ phase: "signed-out" });
    } catch {
      apply({ phase: "verification-required", error: "Saved access needs online recovery. Your financial records have been preserved." });
    }
  },
  acceptLogin: async (session) => {
    set({ error: null });
    try {
      const account = await acceptOnlineLogin(session);
      let recovering = recoveryRequested;
      const enrolled = recovering ? null : await readEnvelope(account.session.userId).catch(() => { recovering = true; return null; });
      set({ account: localAccount(account), phase: recovering || !enrolled ? "enrollment-required" : "locked",
        recoveryVerified: recovering, error: null, lockoutMs: remainingLockout(account.attempts, accessNow(account)) });
      return true;
    } catch (error) { set({ error: safeMessage(error) }); return false; }
  },
  submitPin: async (pin) => {
    if (get().busy || get().phase !== "locked") return;
    const account = get().account;
    if (!account || !isValidPin(pin)) return;
    const epoch = generation;
    set({ busy: true, error: null });
    try {
      const result = await unlockWithPin(account.session.userId, pin);
      if (epoch !== generation) { await lockVault(); return; }
      const updated = await readAccount();
      if (result.status === "unlocked") {
        set({ account: localAccount(updated, true), phase: "unlocked", lockoutMs: 0 });
        void get().verifyOnline();
      } else {
        set({ account: localAccount(updated), lockoutMs: result.status === "locked-out" ? result.remainingMs : 0,
          error: result.status === "incorrect" ? `Incorrect PIN. ${result.attemptsRemaining} attempts remaining.`
            : "Five incorrect attempts. Try again in one hour." });
      }
    } catch (error) {
      set({ error: safeMessage(error) });
      const updated = await readAccount().catch(() => null);
      if (!updated || needsOnlineVerification(updated, accessNow(updated))) set({ phase: "verification-required" });
    } finally { set({ busy: false }); }
  },
  setupPin: async (pin) => {
    if (get().busy || get().phase !== "enrollment-required" || !get().account) return;
    const epoch = generation;
    set({ busy: true, error: null });
    try {
      await tracePinStep("setup.enrollment", () => enrollPin(get().account!.session.userId, pin, get().recoveryVerified));
      recoveryRequested = false;
      if (epoch !== generation) { await lockVault(); set({ phase: "locked" }); return; }
      set({ account: localAccount(await tracePinStep("setup.read-unlocked-account", readAccount), true), phase: "unlocked", recoveryVerified: false });
    } catch (error) {
      const enrolled = await tracePinStep("setup.inspect-after-failure", () => readEnvelope(get().account!.session.userId)).catch(() => null);
      set({ error: safeMessage(error), ...(enrolled ? { phase: "locked" as const } : {}) });
    }
    finally { set({ busy: false }); }
  },
  lock: async () => {
    generation++;
    abortProtectedRequests();
    clearTransactionCache();
    // Locking ends the in-memory session; the protected record keeps the refresh token so
    // the next online verification succeeds without signing in again.
    clearSdkSession();
    // One update, so no render sees an unlocked phase with the token already cleared.
    const account = get().account;
    const locked = { account: account && withoutAccessToken(account) };
    if (get().phase === "unlocked") set({ ...locked, phase: "locked", error: null });
    else set(locked);
    // Any in-flight cryptographic unlock must finish before closing its new database handle.
    await withAuthLock(lockVault).catch(() => {
      set({ error: "Budgie is locked. Reopen the app if local storage remains busy." });
    });
  },
  checkAccess: async () => {
    if (checking || !get().account || ["recovery", "signed-out", "hydrating"].includes(get().phase)) return;
    checking = true;
    try {
      const account = get().account!;
      const now = accessNow(account);
      set({ lockoutMs: remainingLockout(account.attempts, now) });
      if (needsOnlineVerification(account, now)) {
        if (get().phase !== "verification-required") {
          await get().lock();
          set({ phase: "verification-required" });
        }
        return;
      }
      // Last-seen time is stored under the same lock as attempts and rotated tokens.
      await withAuthLock(async () => {
        const current = await readAccount();
        if (!current || current.session.userId !== account.session.userId) return;
        if (now >= current.attempts.lastObservedAt + 60_000) {
          const updated = { ...current, attempts: { ...current.attempts, lastObservedAt: now } };
          await writeAccount(updated);
          set({ account: localAccount(updated, get().phase === "unlocked") });
        }
      });
    } catch {
      await get().lock();
      set({ phase: "verification-required", error: "Verify online to restore secure access." });
    } finally { checking = false; }
  },
  verifyOnline: async () => {
    const epoch = generation;
    try {
      await refreshOnlineSession(true);
      const account = await readAccount();
      if (epoch !== generation || !account) return;
      const unlocked = get().phase === "unlocked";
      set({ account: localAccount(account, unlocked), error: null, phase: unlocked ? "unlocked" : "locked" });
    } catch (error) {
      if (epoch !== generation) return;
      if (error instanceof OnlineVerificationError && error.requiresLogin) {
        await get().lock();
        set({ phase: "recovery", error: "Sign in again to verify this account." });
      } else if (get().phase !== "unlocked") {
        set({ error: "Connect to the internet to verify your account. Your local records are safe." });
      }
    }
  },
  startRecovery: async () => {
    await get().lock();
    recoveryRequested = true;
    set({ phase: "recovery", error: null, recoveryVerified: false });
  },
  finishLogout: async () => {
    await get().lock();
    await withAuthLock(clearRememberedAccount);
    recoveryRequested = false;
    set({ account: null, phase: "signed-out", error: null, recoveryVerified: false, lockoutMs: 0 });
  },
  updateOnboarding: async () => {
    await withAuthLock(async () => {
      const account = await readAccount();
      if (!account) return;
      const updated = { ...account, session: { ...account.session, onboardingStatus: "submitted" } };
      await writeAccount(updated);
      set({ account: localAccount(updated, get().phase === "unlocked") });
    });
  },
}));

async function refreshUnlockedSession(userId: string, forceRefresh = false): Promise<string> {
  try {
    const session = await refreshOnlineSession(false, forceRefresh);
    const current = useAuthStore.getState();
    if (current.phase !== "unlocked" || current.account?.session.userId !== userId) throw new Error("Budgie is locked.");
    const account = await readAccount();
    // A lock during the read must not put the access token back in memory.
    if (account && useAuthStore.getState().phase === "unlocked") useAuthStore.setState({ account: localAccount(account, true) });
    return session.accessToken;
  } catch (error) {
    if (error instanceof OnlineVerificationError && error.requiresLogin) {
      await useAuthStore.getState().lock();
      useAuthStore.setState({ phase: "recovery" });
    }
    throw error;
  }
}

export function installNativeAccessGuard(): void {
  configureTokenResolver(async (usedToken, rejected) => {
    const { phase, account } = useAuthStore.getState();
    if (phase !== "unlocked" || !account) return usedToken;
    const current = account.session.accessToken;
    // A concurrent request may already have rotated the token this one was rejected with.
    if (!accessTokenExpiring(current) && (!rejected || current !== usedToken)) return current;
    return refreshUnlockedSession(account.session.userId, rejected);
  });
  configureLocalAccess(async (userId) => {
    const state = useAuthStore.getState();
    if (state.phase !== "unlocked" || state.account?.session.userId !== userId
      || needsOnlineVerification(state.account, accessNow(state.account))) throw new Error("Unlock and verify Budgie before syncing.");
    return refreshUnlockedSession(userId);
  }, () => {
    const state = useAuthStore.getState();
    return state.phase === "unlocked" && !!state.account && !needsOnlineVerification(state.account, accessNow(state.account));
  }, () => {
    void useAuthStore.getState().lock().then(() => withAuthLock(async () => {
      const account = await readAccount();
      if (account) {
        const updated = { ...account, verificationRequired: true };
        await writeAccount(updated);
        useAuthStore.setState({ account: localAccount(updated) });
      }
    })).catch(() => {}).finally(() => useAuthStore.setState({ phase: "recovery" }));
  });
}
