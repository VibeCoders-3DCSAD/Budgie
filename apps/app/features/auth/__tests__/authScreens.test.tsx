jest.mock("../stores/useAuthStore", () => ({
  useAuthStore: require("zustand").create(() => ({ error: null, acceptLogin: jest.fn(async () => true), lock: jest.fn() })),
}));
jest.mock("../services/authApi", () => ({
  ...jest.requireActual("../services/authApi"),
  login: jest.fn(), register: jest.fn(), bootstrapSession: jest.fn(), verifyEmail: jest.fn(),
  resendVerification: jest.fn(), requestPasswordReset: jest.fn(), updatePassword: jest.fn(),
}));
jest.mock("../services/googleSignIn", () => ({ startGoogleSignIn: jest.fn() }));
jest.mock("../../../lib/api", () => ({ API_BASE_URL: "http://api.test" }));
jest.mock("../../../lib/network", () => ({ isOnline: jest.fn(async () => true) }));
jest.mock("../../governance/api", () => ({ getCurrentTermsConsent: jest.fn(async () => ({ response: { ok: true }, hasCurrentTermsConsent: true })) }));
jest.mock("../../governance/PrivacyConsentScreen", () => () => null);
jest.mock("expo-router", () => ({ router: { push: jest.fn(), dismissTo: jest.fn() } }));
jest.mock("@expo/vector-icons", () => ({ MaterialCommunityIcons: require("./routeStubs").Icon }));
jest.mock("react-native-safe-area-context", () => ({
  SafeAreaView: require("./routeStubs").SafeAreaProvider,
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));

import React from "react";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { router } from "expo-router";
import ForgotPasswordScreen from "../ForgotPasswordScreen";
import LoginScreen from "../LoginScreen";
import RegistrationScreen from "../RegistrationScreen";
import { AccessProvider } from "../components/AccessProvider";
import * as authApi from "../services/authApi";
import { useAuthStore } from "../stores/useAuthStore";
import { ROUTES } from "../../../routes";
import type { useDeepLink } from "../../../hooks/useDeepLink";

const api = jest.mocked(authApi);
const noLinks: ReturnType<typeof useDeepLink> = { isPasswordRecovery: false, isResolvingRecoveryToken: false, recoveryToken: null, recoveryRefreshToken: null,
  verificationToken: null, clearAuthLinks: jest.fn() };

function renderWithLinks(element: React.ReactElement, links: Partial<typeof noLinks> = {}) {
  return render(<AccessProvider value={{ deviceId: "", links: { ...noLinks, ...links } }}>{element}</AccessProvider>);
}

describe("sign-in route", () => {
  beforeEach(() => jest.clearAllMocks());

  it("signs in and hands the session to the auth store", async () => {
    api.login.mockResolvedValue({ session: { access_token: "access", refresh_token: "refresh" }, user: { id: "user-1" } });
    const screen = renderWithLinks(<LoginScreen />);
    fireEvent.changeText(screen.getByPlaceholderText("you@example.com"), " ana@example.com ");
    fireEvent.changeText(screen.getByPlaceholderText("Enter your password"), "secret");
    await act(async () => { fireEvent.press(screen.getByText("Sign in")); });
    expect(api.login).toHaveBeenCalledWith("ana@example.com", "secret");
    expect(useAuthStore.getState().acceptLogin).toHaveBeenCalledWith(expect.objectContaining({
      accessToken: "access", refreshToken: "refresh", provider: "password", userId: "user-1" }));
  });

  it("switches to the verification step when the email is unverified", async () => {
    api.login.mockRejectedValue(new authApi.AuthRequestError("Verify your email first, then sign in.", 401, "email_unverified"));
    const screen = renderWithLinks(<LoginScreen />);
    fireEvent.changeText(screen.getByPlaceholderText("you@example.com"), "ana@example.com");
    fireEvent.changeText(screen.getByPlaceholderText("Enter your password"), "secret");
    await act(async () => { fireEvent.press(screen.getByText("Sign in")); });
    expect(screen.getByText("Verify your email")).toBeTruthy();
    expect(screen.getByText(/Check ana@example.com/)).toBeTruthy();
  });

  it("confirms an email verification link once and clears it", async () => {
    api.verifyEmail.mockResolvedValue({});
    const screen = renderWithLinks(<LoginScreen />, { verificationToken: "verify-token" });
    await waitFor(() => expect(screen.getByText("Email verified. You can now log in.")).toBeTruthy());
    expect(api.verifyEmail).toHaveBeenCalledTimes(1);
    expect(noLinks.clearAuthLinks).toHaveBeenCalled();
  });

  it("shows only whitelisted notices handed over by another route", () => {
    expect(renderWithLinks(<LoginScreen noticeKey="password-updated" />)
      .getByText("Password updated. Sign in with your new password.")).toBeTruthy();
    expect(renderWithLinks(<LoginScreen noticeKey="<script>" />).queryByText("<script>")).toBeNull();
  });

  it("links to the other signed-out routes", () => {
    const screen = renderWithLinks(<LoginScreen />);
    fireEvent.press(screen.getByText("Forgot password?"));
    fireEvent.press(screen.getByText("Create account"));
    expect(router.push).toHaveBeenNthCalledWith(1, ROUTES.forgotPassword);
    expect(router.push).toHaveBeenNthCalledWith(2, ROUTES.registration);
  });
});

describe("registration route", () => {
  beforeEach(() => jest.clearAllMocks());

  it("asks for email verification when registration returns no session", async () => {
    api.register.mockResolvedValue({ user: { id: "user-1" } });
    const screen = renderWithLinks(<RegistrationScreen />);
    fireEvent.changeText(screen.getByPlaceholderText("Juan dela Cruz"), " Ana ");
    fireEvent.changeText(screen.getByPlaceholderText("you@example.com"), "ana@example.com");
    fireEvent.changeText(screen.getByPlaceholderText("Enter your password"), "Str0ng!pass");
    fireEvent.changeText(screen.getByPlaceholderText("Re-enter your password"), "Str0ng!pass");
    await act(async () => { fireEvent.press(screen.getAllByText("Create account")[1]); });
    expect(api.register).toHaveBeenCalledWith("ana@example.com", "Str0ng!pass", "Ana");
    expect(screen.getByText("Verify your email")).toBeTruthy();

    fireEvent.press(screen.getByText("Back to sign in"));
    expect(router.dismissTo).toHaveBeenCalledWith(ROUTES.login);
  });
});

describe("forgot-password route", () => {
  beforeEach(() => jest.clearAllMocks());
  const resetLink = { isPasswordRecovery: true, recoveryToken: "recovery", recoveryRefreshToken: "refresh" };

  function choosePassword(screen: ReturnType<typeof render>) {
    fireEvent.changeText(screen.getByPlaceholderText("Enter new password"), "Str0ng!pass");
    fireEvent.changeText(screen.getByPlaceholderText("Repeat new password"), "Str0ng!pass");
  }

  it("requests a reset link without a recovery session", async () => {
    api.requestPasswordReset.mockResolvedValue({});
    const screen = renderWithLinks(<ForgotPasswordScreen />);
    fireEvent.changeText(screen.getByPlaceholderText("Enter your registered email"), "ana@example.com");
    await act(async () => { fireEvent.press(screen.getByText("Send reset link")); });
    expect(api.requestPasswordReset).toHaveBeenCalledWith("ana@example.com");
    expect(screen.getByText("If that email exists, a reset link is on the way now.")).toBeTruthy();
  });

  it("sets the new password from a reset link and returns to sign-in", async () => {
    api.updatePassword.mockResolvedValue({});
    const screen = renderWithLinks(<ForgotPasswordScreen />, resetLink);
    expect(screen.getByText("Reset session ready.")).toBeTruthy();
    choosePassword(screen);
    await act(async () => { fireEvent.press(screen.getByText("Update password")); });
    expect(api.updatePassword).toHaveBeenCalledWith("Str0ng!pass", "recovery", "refresh");
    expect(noLinks.clearAuthLinks).toHaveBeenCalled();
    expect(router.dismissTo).toHaveBeenCalledWith({ pathname: ROUTES.login, params: { notice: "password-updated" } });
  });

  it("shows the expired-session step without the misleading 401 copy", async () => {
    api.updatePassword.mockRejectedValue(new authApi.AuthRequestError("Invalid email or password.", 401));
    const screen = renderWithLinks(<ForgotPasswordScreen />, resetLink);
    choosePassword(screen);
    await act(async () => { fireEvent.press(screen.getByText("Update password")); });
    expect(screen.getByText("Session expired")).toBeTruthy();
    expect(screen.queryByText("Invalid email or password.")).toBeNull();
  });
});
