import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import type React from "react";
import AccountOffboardingScreen from "../AccountOffboardingScreen";

const mockGetActive = jest.fn();
const mockGetHistory = jest.fn();
const mockCancel = jest.fn();
const mockRequest = jest.fn();
const mockConfirm = jest.fn();
const mockShowToast = jest.fn();
const mockShowDeletionSuccess = jest.fn();

jest.mock("../api", () => ({
  getActiveAccountDeletion: (...args: unknown[]) => mockGetActive(...args),
  getAccountDeletionHistory: (...args: unknown[]) => mockGetHistory(...args),
  cancelAccountDeletion: (...args: unknown[]) => mockCancel(...args),
  requestAccountDeletion: (...args: unknown[]) => mockRequest(...args),
  confirmAccountDeletion: (...args: unknown[]) => mockConfirm(...args),
}));
jest.mock("../../auth/components/AccessProvider", () => ({ useSession: () => ({ accessToken: "token", userId: "user-1", deviceId: "device-1" }) }));
jest.mock("../../shell/components/InnerPage", () => ({ InnerPage: ({ children }: { children: React.ReactNode }) => children }));
jest.mock("../../shell/helpers/shellNavigation", () => ({ goBackOr: jest.fn() }));
jest.mock("../../sync/SyncProvider", () => ({ useLogout: () => ({ showDeletionSuccess: mockShowDeletionSuccess }) }));
jest.mock("../../../components/Toast", () => ({ useToast: () => ({ showToast: mockShowToast }) }));
jest.mock("../../../services/connectivity", () => ({
  useConnectivityStore: (select: (state: { online: boolean }) => unknown) => select({ online: true }),
}));

const pending = {
  id: "req-1", status: "processing", requested_at: "2026-11-01T00:00:00Z",
  confirmed_at: "2026-11-01T00:00:00Z", scheduled_delete_at: "2026-12-01T12:00:00Z",
};

function renderScreen() {
  return render(<AccountOffboardingScreen />);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetHistory.mockResolvedValue({ response: { ok: true }, body: { payload: { requests: [] } } });
});

it("shows a pending deletion and cancels it", async () => {
  mockGetActive.mockResolvedValue({ response: { ok: true }, body: { payload: { request: pending } } });
  mockCancel.mockResolvedValue({ response: { ok: true }, body: {} });
  const view = renderScreen();

  expect(await view.findByText("Deletion pending")).toBeTruthy();
  expect(view.getByText("Dec 1, 2026")).toBeTruthy();

  await act(async () => { fireEvent.press(view.getByLabelText("Keep my account")); });

  expect(mockCancel).toHaveBeenCalledWith("token", "req-1");
  expect(mockShowToast).toHaveBeenCalledWith("Deletion request cancelled. Your account stays.", "success");
  expect(view.getByLabelText("Delete my account")).toBeTruthy();
});

it("queues a deletion only after the consequences are acknowledged", async () => {
  mockGetActive.mockResolvedValue({ response: { ok: true }, body: { payload: { request: null } } });
  mockRequest.mockResolvedValue({ response: { ok: true, status: 201 }, body: { payload: { request: { ...pending, status: "requested" } } } });
  mockConfirm.mockResolvedValue({ response: { ok: true }, body: { payload: { request: pending } } });
  const view = renderScreen();

  const deleteButton = await view.findByLabelText("Delete my account");
  await act(async () => { fireEvent.press(deleteButton); });
  expect(mockRequest).not.toHaveBeenCalled();

  fireEvent.press(view.getByRole("checkbox"));
  await act(async () => { fireEvent.press(view.getByLabelText("Delete my account")); });

  expect(mockConfirm).toHaveBeenCalledWith("token", "req-1");
  await waitFor(() => expect(mockShowDeletionSuccess).toHaveBeenCalledWith(pending.scheduled_delete_at));
});

it("confirms an earlier unconfirmed request instead of creating another", async () => {
  mockGetActive.mockResolvedValue({ response: { ok: true }, body: { payload: { request: { ...pending, status: "requested" } } } });
  mockConfirm.mockResolvedValue({ response: { ok: true }, body: { payload: { request: pending } } });
  const view = renderScreen();

  fireEvent.press(await view.findByRole("checkbox"));
  await act(async () => { fireEvent.press(view.getByLabelText("Delete my account")); });

  expect(mockRequest).not.toHaveBeenCalled();
  expect(mockConfirm).toHaveBeenCalledWith("token", "req-1");
});

it("lists past requests with when each was cancelled, and refreshes after a cancellation", async () => {
  const cancelledEarlier = {
    id: "req-0", status: "cancelled", requested_at: "2026-09-01T00:00:00Z",
    confirmed_at: "2026-09-01T00:00:00Z", scheduled_delete_at: "2026-10-01T00:00:00Z", cancelled_at: "2026-09-05T12:00:00Z",
  };
  mockGetActive.mockResolvedValue({ response: { ok: true }, body: { payload: { request: pending } } });
  mockGetHistory
    .mockResolvedValueOnce({ response: { ok: true }, body: { payload: { requests: [pending, cancelledEarlier] } } })
    .mockResolvedValueOnce({ response: { ok: true }, body: { payload: { requests: [{ ...pending, status: "cancelled", cancelled_at: "2026-11-04T12:00:00Z" }, cancelledEarlier] } } });
  mockCancel.mockResolvedValue({ response: { ok: true }, body: {} });
  const view = renderScreen();

  expect(await view.findByText("Request history")).toBeTruthy();
  expect(view.getByText("Requested Nov 1, 2026")).toBeTruthy();
  expect(view.getByText("Pending")).toBeTruthy();
  expect(view.getByText("Cancelled Sep 5, 2026")).toBeTruthy();

  await act(async () => { fireEvent.press(view.getByLabelText("Keep my account")); });

  expect(mockGetHistory).toHaveBeenCalledTimes(2);
  expect(await view.findByText("Cancelled Nov 4, 2026")).toBeTruthy();
  expect(view.queryByText("Pending")).toBeNull();
});

it("hides the history when there has never been a request", async () => {
  mockGetActive.mockResolvedValue({ response: { ok: true }, body: { payload: { request: null } } });
  const view = renderScreen();

  await view.findByLabelText("Delete my account");
  expect(view.queryByText("Request history")).toBeNull();
});
