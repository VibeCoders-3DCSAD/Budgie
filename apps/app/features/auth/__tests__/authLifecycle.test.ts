jest.mock("expo-secure-store", () => {
  const values = new Map();
  return { WHEN_UNLOCKED_THIS_DEVICE_ONLY: "device",
    getItemAsync: jest.fn(async (key) => values.get(key) ?? null),
    setItemAsync: jest.fn(async (key, value) => { values.set(key, value); }),
    deleteItemAsync: jest.fn(async (key) => { values.delete(key); }) };
});
jest.mock("../services/sessionService", () => ({
  acceptOnlineLogin: jest.fn(), refreshOnlineSession: jest.fn(),
  OnlineVerificationError: class extends Error { requiresLogin = true; },
}));
jest.mock("../services/pinVault", () => ({ enrollPin: jest.fn(), lockVault: jest.fn(), unlockWithPin: jest.fn() }));

import { useAuthStore, installNativeAccessGuard } from "../stores/useAuthStore";
import { authorizeLocalRequest } from "../../../lib/localAccess";
import { readAccount, writeAccount, writeSecret } from "../services/authStorage";
import { acceptOnlineLogin, refreshOnlineSession } from "../services/sessionService";
import { enrollPin, lockVault, unlockWithPin } from "../services/pinVault";
import { AccessError } from "../../../lib/helpers/accessErrors";
import { accountFixture, anotherUserId, userId } from "./fixtures";
import { resetAccessClock } from "../helpers/accessClock";
import { clearSdkSession, sdkSessionStorage } from "../../../lib/sdkSessionStorage";

describe("offline auth lifecycle", () => {
  let now: number;
  beforeEach(async () => {
    now = 1_800_000_000_000;
    jest.spyOn(Date, "now").mockImplementation(() => now);
    jest.clearAllMocks();
    resetAccessClock();
    useAuthStore.setState({ phase: "hydrating", account: null, error: null, busy: false, recoveryVerified: false });
    await writeAccount(accountFixture(now));
    await writeSecret(userId, "pin.v1", JSON.stringify({ version: 1, iterations: 600000,
      salt: "a".repeat(32), wrappedKey: "A".repeat(80) }));
    jest.mocked(refreshOnlineSession).mockRejectedValue(new TypeError("Offline"));
  });
  afterEach(() => jest.restoreAllMocks());

  it("hydrates offline without a network call and remains locked", async () => {
    await useAuthStore.getState().hydrate();
    expect(useAuthStore.getState().phase).toBe("locked");
    expect(refreshOnlineSession).not.toHaveBeenCalled();
    expect(unlockWithPin).not.toHaveBeenCalled();
  });

  it("permits an offline PIN unlock and retains access when renewal is unavailable", async () => {
    await useAuthStore.getState().hydrate();
    jest.mocked(unlockWithPin).mockResolvedValue({ status: "unlocked" });
    await useAuthStore.getState().submitPin("001234");
    expect(useAuthStore.getState().phase).toBe("unlocked");
    await useAuthStore.getState().verifyOnline();
    expect(useAuthStore.getState().phase).toBe("unlocked");
  });

  it("cannot expose protected content if backgrounded while PIN verification is pending", async () => {
    await useAuthStore.getState().hydrate();
    let finish: () => void = () => {};
    jest.mocked(unlockWithPin).mockImplementation(() => new Promise((resolve) => {
      finish = () => resolve({ status: "unlocked" });
    }));
    const pending = useAuthStore.getState().submitPin("001234");
    await useAuthStore.getState().lock();
    finish();
    await pending;
    expect(useAuthStore.getState().phase).toBe("locked");
    expect(lockVault).toHaveBeenCalled();
  });

  it("requires online verification at expiry without deleting local account metadata", async () => {
    const account = accountFixture(now);
    now = account.expiresAt;
    resetAccessClock();
    await useAuthStore.getState().hydrate();
    expect(useAuthStore.getState().phase).toBe("verification-required");
    expect(await readAccount()).not.toBeNull();
  });

  it("does not open the vault when online verification succeeds", async () => {
    await useAuthStore.getState().hydrate();
    jest.mocked(refreshOnlineSession).mockResolvedValue(accountFixture(now).session);
    await useAuthStore.getState().verifyOnline();
    expect(useAuthStore.getState().phase).toBe("locked");
    expect(unlockWithPin).not.toHaveBeenCalled();
  });

  it("keeps the login screen available while an expired account is being recovered", async () => {
    await useAuthStore.getState().hydrate();
    useAuthStore.setState({ phase: "recovery" });
    now = accountFixture(now).expiresAt;
    resetAccessClock();
    await useAuthStore.getState().checkAccess();
    expect(useAuthStore.getState().phase).toBe("recovery");
  });

  it("clears the setup spinner and permits retry when key derivation fails", async () => {
    await useAuthStore.getState().hydrate();
    await writeSecret(userId, "pin.v1", "");
    useAuthStore.setState({ phase: "enrollment-required" });
    jest.mocked(enrollPin).mockRejectedValueOnce(new AccessError("Install the updated app build to finish PIN setup."));
    await useAuthStore.getState().setupPin("001234");
    expect(useAuthStore.getState().busy).toBe(false);
    expect(useAuthStore.getState().phase).toBe("enrollment-required");
    expect(useAuthStore.getState().error).toContain("updated app build");
  });

  it("does not repeatedly lock an expired account while waiting for online verification", async () => {
    const account = accountFixture(now);
    now = account.expiresAt;
    resetAccessClock();
    await useAuthStore.getState().hydrate();
    await useAuthStore.getState().checkAccess();
    expect(useAuthStore.getState().phase).toBe("verification-required");
    expect(lockVault).not.toHaveBeenCalled();
  });

  it("only enables PIN reset after a new online account login", async () => {
    await useAuthStore.getState().hydrate();
    await useAuthStore.getState().startRecovery();
    expect(useAuthStore.getState().recoveryVerified).toBe(false);
    jest.mocked(acceptOnlineLogin).mockResolvedValue(accountFixture(now));
    await useAuthStore.getState().acceptLogin(accountFixture(now).session);
    expect(useAuthStore.getState().phase).toBe("enrollment-required");
    expect(useAuthStore.getState().recoveryVerified).toBe(true);
  });

  it("blocks sync for locked, expired, and different accounts", async () => {
    await useAuthStore.getState().hydrate();
    installNativeAccessGuard();
    await expect(authorizeLocalRequest(userId, "token")).rejects.toThrow();
    useAuthStore.setState({ phase: "unlocked" });
    await expect(authorizeLocalRequest(anotherUserId, "token")).rejects.toThrow();
    now = accountFixture(now).expiresAt;
    await expect(authorizeLocalRequest(userId, "token")).rejects.toThrow();
  });

  it("keeps the access token in memory only while unlocked", async () => {
    await useAuthStore.getState().hydrate();
    expect(useAuthStore.getState().account?.session.accessToken).toBe("");
    jest.mocked(unlockWithPin).mockResolvedValue({ status: "unlocked" });
    await useAuthStore.getState().submitPin("001234");
    expect(useAuthStore.getState().account?.session.accessToken).toBe("access");
    await useAuthStore.getState().lock();
    expect(useAuthStore.getState().phase).toBe("locked");
    expect(useAuthStore.getState().account?.session.accessToken).toBe("");
    // The protected record keeps both tokens for online re-verification without a new sign-in.
    expect((await readAccount())?.session).toMatchObject({ accessToken: "access", refreshToken: "refresh" });
  });

  it("drops the SDK session on lock without touching a pending sign-in verifier", async () => {
    await useAuthStore.getState().hydrate();
    sdkSessionStorage.setItem("sb-test-auth-token", "{\"access_token\":\"access\"}");
    sdkSessionStorage.setItem("sb-test-auth-token-code-verifier", "verifier");
    await useAuthStore.getState().lock();
    expect(sdkSessionStorage.getItem("sb-test-auth-token")).toBeNull();
    expect(sdkSessionStorage.getItem("sb-test-auth-token-code-verifier")).toBe("verifier");
    clearSdkSession();
    sdkSessionStorage.removeItem("sb-test-auth-token-code-verifier");
  });

  it("re-verifies expired offline access online without a new sign-in", async () => {
    now = accountFixture(now).expiresAt;
    resetAccessClock();
    await useAuthStore.getState().hydrate();
    expect(useAuthStore.getState().phase).toBe("verification-required");
    jest.mocked(refreshOnlineSession).mockResolvedValue(accountFixture(now).session);
    await useAuthStore.getState().verifyOnline();
    expect(refreshOnlineSession).toHaveBeenCalledWith(true);
    expect(acceptOnlineLogin).not.toHaveBeenCalled();
    expect(useAuthStore.getState().phase).toBe("locked");
  });
});
