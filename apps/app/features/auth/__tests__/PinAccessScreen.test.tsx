jest.mock("../stores/useAuthStore", () => ({
  useAuthStore: require("zustand").create(() => ({ phase: "locked", busy: false, error: null,
    lockoutMs: 0, recoveryVerified: false, submitPin: jest.fn(), setupPin: jest.fn(),
    verifyOnline: jest.fn(), startRecovery: jest.fn() })),
}));

jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) }));

import React from "react";
import { Alert } from "react-native";
import { act, fireEvent, render, type RenderAPI } from "@testing-library/react-native";
import PinAccessScreen from "../components/PinAccessScreen";
import { useAuthStore } from "../stores/useAuthStore";

function enter(screen: RenderAPI, digits: string) {
  for (const digit of digits) fireEvent.press(screen.getByLabelText(digit));
}

describe("PIN access screen", () => {
  beforeEach(() => {
    useAuthStore.setState({ phase: "locked", busy: false, error: null, lockoutMs: 0, recoveryVerified: false });
    jest.clearAllMocks();
  });
  afterEach(() => jest.restoreAllMocks());

  it("shows the countdown and disables the keypad during the hour", () => {
    useAuthStore.setState({ lockoutMs: 3_600_000 });
    const screen = render(<PinAccessScreen />);
    expect(screen.getByText("Try again in 01:00:00")).toBeTruthy();
    enter(screen, "123456");
    expect(screen.getByLabelText("Six-digit PIN").props.accessibilityValue.text).toBe("0 of 6 digits entered");
    expect(useAuthStore.getState().submitPin).not.toHaveBeenCalled();
  });

  it("submits a leading-zero PIN on the sixth digit and clears the entry", () => {
    const screen = render(<PinAccessScreen />);
    enter(screen, "00123");
    expect(screen.getByLabelText("Six-digit PIN").props.accessibilityValue.text).toBe("5 of 6 digits entered");
    enter(screen, "4");
    expect(useAuthStore.getState().submitPin).toHaveBeenCalledWith("001234");
    expect(screen.getByLabelText("Six-digit PIN").props.accessibilityValue.text).toBe("0 of 6 digits entered");
  });

  it("rotates progress messages while unlocking", () => {
    jest.useFakeTimers();
    useAuthStore.setState({ busy: true });
    const screen = render(<PinAccessScreen />);
    expect(screen.getByText("Checking your PIN…")).toBeTruthy();
    act(() => { jest.advanceTimersByTime(2000); });
    expect(screen.getByText("Opening your vault…")).toBeTruthy();
    jest.useRealTimers();
  });

  it("deletes the last digit", () => {
    const screen = render(<PinAccessScreen />);
    enter(screen, "12");
    fireEvent.press(screen.getByLabelText("Delete digit"));
    expect(screen.getByLabelText("Six-digit PIN").props.accessibilityValue.text).toBe("1 of 6 digits entered");
  });

  it("requires confirmation before enabling encryption", () => {
    useAuthStore.setState({ phase: "enrollment-required" });
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    const screen = render(<PinAccessScreen />);
    expect(screen.getByLabelText("Create six-digit PIN")).toBeTruthy();
    enter(screen, "001234");
    expect(screen.getByLabelText("Confirm six-digit PIN")).toBeTruthy();
    enter(screen, "001234");
    expect(useAuthStore.getState().setupPin).not.toHaveBeenCalled();
    expect(alert).toHaveBeenCalledWith("Protect offline access?", expect.stringContaining("unsynced changes will be preserved"), expect.any(Array));
    act(() => { alert.mock.calls[0]?.[2]?.[1]?.onPress?.(); });
    expect(useAuthStore.getState().setupPin).toHaveBeenCalledWith("001234");
  });

  it("restarts setup when the confirmation does not match", () => {
    useAuthStore.setState({ phase: "enrollment-required" });
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    const screen = render(<PinAccessScreen />);
    enter(screen, "001234");
    enter(screen, "001235");
    expect(alert).not.toHaveBeenCalled();
    expect(screen.getByText("PINs didn't match. Try again.")).toBeTruthy();
    expect(screen.getByLabelText("Create six-digit PIN")).toBeTruthy();
  });

  it("shows online verification without rendering the keypad after expiry", () => {
    useAuthStore.setState({ phase: "verification-required" });
    const screen = render(<PinAccessScreen />);
    expect(screen.queryByLabelText("Six-digit PIN")).toBeNull();
    expect(screen.queryByLabelText("1")).toBeNull();
    fireEvent.press(screen.getByLabelText("Verify online"));
    expect(useAuthStore.getState().verifyOnline).toHaveBeenCalled();
  });
});
