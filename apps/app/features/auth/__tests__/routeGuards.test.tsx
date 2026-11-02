jest.mock("../stores/useAuthStore", () => ({
  useAuthStore: require("zustand").create(() => ({ phase: "signed-out", account: null, error: null,
    acceptLogin: jest.fn(), lock: jest.fn(), finishLogout: jest.fn(), updateOnboarding: jest.fn() })),
  installNativeAccessGuard: jest.fn(),
}));
jest.mock("expo-router", () => {
  const { Stack, Redirect } = require("./routeStubs");
  return { Stack, Redirect, useLocalSearchParams: jest.fn(() => ({})), router: { replace: jest.fn() } };
});
jest.mock("../../../global.css", () => ({}));
jest.mock("react-native-safe-area-context", () => ({ SafeAreaProvider: require("./routeStubs").SafeAreaProvider }));
jest.mock("expo-status-bar", () => ({ StatusBar: () => null }));
jest.mock("../hooks/useAccessLifecycle", () => ({ useAccessLifecycle: jest.fn(() => "device-1") }));
jest.mock("../../../hooks/useDeepLink", () => ({ useDeepLink: () => ({ isPasswordRecovery: false,
  isResolvingRecoveryToken: false, recoveryToken: null, recoveryRefreshToken: null, verificationToken: null, clearAuthLinks: jest.fn() }) }));
jest.mock("../../../local-db/databaseAccess", () => ({ enableDatabaseProtection: jest.fn() }));
jest.mock("../components/PinAccessScreen", () => require("./routeStubs").PinAccessScreen);
jest.mock("../../onboarding/OnboardingFlow", () => require("./routeStubs").OnboardingFlow);

import React from "react";
import { act, fireEvent, render } from "@testing-library/react-native";
import { useLocalSearchParams } from "expo-router";
import RootLayout from "../../../app/_layout";
import Index from "../../../app/index";
import AppLayout from "../../../app/(app)/_layout";
import UserOnboarding from "../../../app/(app)/user-onboarding";
import { AccessProvider } from "../components/AccessProvider";
import { useAccessLifecycle } from "../hooks/useAccessLifecycle";
import { useAuthStore } from "../stores/useAuthStore";
import { ROUTES } from "../../../routes";

const links = { isPasswordRecovery: false, isResolvingRecoveryToken: false, recoveryToken: null, recoveryRefreshToken: null,
  verificationToken: null, clearAuthLinks: jest.fn() };

function unlock(onboardingStatus: string) {
  useAuthStore.setState({ phase: "unlocked", account: { session: { accessToken: "token", userId: "user-1", onboardingStatus } } } as never);
}

function renderUnlocked(element: React.ReactElement, linkState: Partial<typeof links> = {}) {
  return render(<AccessProvider value={{ deviceId: "device-1", links: { ...links, ...linkState } }}>{element}</AccessProvider>);
}

describe("root access gate", () => {
  beforeEach(() => {
    useAuthStore.setState({ phase: "signed-out", account: null });
    jest.mocked(useAccessLifecycle).mockReturnValue("device-1");
  });

  it("offers only the signed-out routes while signed out or recovering", () => {
    for (const phase of ["signed-out", "recovery"]) {
      useAuthStore.setState({ phase } as never);
      const screen = render(<RootLayout />);
      for (const route of ["login", "registration", "forgot-password"]) expect(screen.getByText(`screen:${route}`)).toBeTruthy();
      expect(screen.queryByText("screen:(app)")).toBeNull();
      screen.unmount();
    }
  });

  it("offers only the app routes once unlocked", () => {
    unlock("submitted");
    const screen = render(<RootLayout />);
    expect(screen.getByText("screen:(app)")).toBeTruthy();
    for (const route of ["login", "registration", "forgot-password"]) expect(screen.queryByText(`screen:${route}`)).toBeNull();
  });

  it("holds the navigator back while the device id resolves", () => {
    unlock("submitted");
    jest.mocked(useAccessLifecycle).mockReturnValue("");
    const screen = render(<RootLayout />);
    expect(screen.queryByText("screen:(app)")).toBeNull();
    expect(screen.queryByText("pin")).toBeNull();
  });

  it("replaces every route with the PIN gate while locked", () => {
    for (const phase of ["locked", "enrollment-required", "verification-required"]) {
      useAuthStore.setState({ phase } as never);
      const screen = render(<RootLayout />);
      expect(screen.getByText("pin")).toBeTruthy();
      expect(screen.queryByText(/^screen:/)).toBeNull();
      screen.unmount();
    }
  });
});

describe("app routes", () => {
  beforeEach(() => jest.mocked(useLocalSearchParams).mockReturnValue({}));

  it("sends the index to where the access state belongs", () => {
    const cases: [() => void, string, Partial<typeof links>?][] = [
      [() => unlock("submitted"), `redirect:${ROUTES.dashboard}`],
      [() => unlock("in_progress"), `redirect:${ROUTES.userOnboarding}`],
      [() => useAuthStore.setState({ phase: "signed-out", account: null }), `redirect:${ROUTES.login}`],
      // Forgot PIN also uses the recovery phase but must land on sign-in.
      [() => useAuthStore.setState({ phase: "recovery", account: null }), `redirect:${ROUTES.login}`],
      [() => useAuthStore.setState({ phase: "recovery", account: null }), `redirect:${ROUTES.forgotPassword}`, { isPasswordRecovery: true }],
    ];
    for (const [arrange, expected, linkState] of cases) {
      arrange();
      const screen = renderUnlocked(<Index />, linkState);
      expect(screen.getByText(expected)).toBeTruthy();
      screen.unmount();
    }
  });

  it("guards the app shell until onboarding is submitted", () => {
    unlock("in_progress");
    const screen = renderUnlocked(<AppLayout />);
    expect(screen.queryByText("screen:(shell)")).toBeNull();
    expect(screen.getByText("screen:user-onboarding")).toBeTruthy();
    act(() => unlock("submitted"));
    expect(screen.getByText("screen:(shell)")).toBeTruthy();
  });

  it("redirects to the dashboard only after the submitted status is stored", async () => {
    unlock("in_progress");
    let finish = () => {};
    jest.mocked(useAuthStore.getState().updateOnboarding).mockImplementation(() => new Promise((resolve) => {
      finish = () => { unlock("submitted"); resolve(); };
    }));
    const screen = renderUnlocked(<UserOnboarding />);
    fireEvent.press(screen.getByText("onboarding"));
    expect(screen.queryByText(`redirect:${ROUTES.dashboard}`)).toBeNull();
    await act(async () => finish());
    expect(screen.getByText(`redirect:${ROUTES.dashboard}`)).toBeTruthy();
  });
});
