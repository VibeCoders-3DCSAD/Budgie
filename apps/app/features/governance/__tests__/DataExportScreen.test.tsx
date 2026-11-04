import { act, fireEvent, render } from "@testing-library/react-native";
import type React from "react";
import DataExportScreen from "../DataExportScreen";
import { ExportHttpError } from "../dataExport/retry";

const mockRunDataExport = jest.fn();
const mockSaveExportFile = jest.fn();
const mockShowToast = jest.fn();

jest.mock("../dataExport/runDataExport", () => ({ runDataExport: (...args: unknown[]) => mockRunDataExport(...args) }));
jest.mock("../dataExport/saveExportFile", () => ({ saveExportFile: (...args: unknown[]) => mockSaveExportFile(...args) }));
jest.mock("../../auth/components/AccessProvider", () => ({ useSession: () => ({ accessToken: "token", userId: "user-1", deviceId: "device-1" }) }));
jest.mock("../../shell/components/InnerPage", () => ({ InnerPage: ({ children }: { children: React.ReactNode }) => children }));
jest.mock("../../shell/helpers/shellNavigation", () => ({ goBackOr: jest.fn() }));
jest.mock("../../../components/Toast", () => ({ useToast: () => ({ showToast: mockShowToast }) }));
let mockOnline = true;
jest.mock("../../../services/connectivity", () => ({
  useConnectivityStore: (select: (state: { online: boolean }) => unknown) => select({ online: mockOnline }),
}));

const prepared = { fileName: "budgie-export-2026-11-04.csv", csv: "a,b", rowCount: 1234 };

beforeEach(() => { jest.clearAllMocks(); mockOnline = true; });

it("prepares the export and opens the save step", async () => {
  mockRunDataExport.mockResolvedValue(prepared);
  mockSaveExportFile.mockResolvedValue({ saved: true });
  const view = render(<DataExportScreen />);

  await act(async () => { fireEvent.press(view.getByLabelText("Export my data")); });

  expect(mockRunDataExport).toHaveBeenCalledWith("token", expect.any(Object));
  expect(mockSaveExportFile).toHaveBeenCalledWith(prepared.fileName, prepared.csv);
  expect(view.getByText("Export saved")).toBeTruthy();
  expect(view.getByText("budgie-export-2026-11-04.csv · 1,234 records")).toBeTruthy();
});

it("keeps the prepared file when the picker is closed, so it can be saved later", async () => {
  mockRunDataExport.mockResolvedValue(prepared);
  mockSaveExportFile.mockResolvedValueOnce({ saved: false }).mockResolvedValueOnce({ saved: true });
  const view = render(<DataExportScreen />);

  await act(async () => { fireEvent.press(view.getByLabelText("Export my data")); });
  expect(view.getByText("Export ready")).toBeTruthy();
  expect(view.getByText("Your financial data export is ready. Save it before leaving this screen, or it must be prepared again.")).toBeTruthy();

  await act(async () => { fireEvent.press(view.getByLabelText("Save file")); });

  expect(mockRunDataExport).toHaveBeenCalledTimes(1);
  expect(mockSaveExportFile).toHaveBeenCalledTimes(2);
  expect(mockShowToast).toHaveBeenCalledWith("Export saved", "success");
});

it("shows the failure and lets the user try again", async () => {
  mockRunDataExport.mockRejectedValueOnce(new Error("status 500")).mockResolvedValueOnce(prepared);
  mockSaveExportFile.mockResolvedValue({ saved: true });
  const view = render(<DataExportScreen />);

  await act(async () => { fireEvent.press(view.getByLabelText("Export my data")); });
  expect(view.getByText("Your data export could not be prepared. Try the export again.")).toBeTruthy();

  await act(async () => { fireEvent.press(view.getByLabelText("Try the export again")); });
  expect(view.getByText("Export saved")).toBeTruthy();
});

it("shows progress and the current step while the export is being prepared", async () => {
  let finish: (value: typeof prepared) => void = () => {};
  let report: (progress: unknown) => void = () => {};
  mockRunDataExport.mockImplementation((_token: string, options: { onProgress: typeof report }) => {
    report = options.onProgress;
    return new Promise((resolve) => { finish = resolve; });
  });
  mockSaveExportFile.mockResolvedValue({ saved: true });
  const view = render(<DataExportScreen />);

  await act(async () => { fireEvent.press(view.getByLabelText("Export my data")); });
  expect(view.getByText("Your data export is starting. Keep this screen open.")).toBeTruthy();

  await act(async () => { report({ stage: "reading", dataset: "transactions", datasetIndex: 5, datasetCount: 14, batch: 2, rowCount: 700 }); });

  expect(view.getByText("Reading your transactions (6 of 14). Keep this screen open.")).toBeTruthy();
  expect(view.getByText("Batch 2 · 700 records so far")).toBeTruthy();
  expect(view.getByLabelText("Export progress").props.accessibilityValue).toMatchObject({ now: 36 });
  expect(view.getByLabelText("Export my data").props.accessibilityState).toMatchObject({ busy: true });
  await act(async () => { finish(prepared); });
});

it("says when to come back once the export limit is reached", async () => {
  mockRunDataExport.mockRejectedValueOnce(new ExportHttpError(429, 1_741_000));
  const view = render(<DataExportScreen />);

  await act(async () => { fireEvent.press(view.getByLabelText("Export my data")); });

  expect(view.getByText("Export limit reached")).toBeTruthy();
  expect(view.getByText("You have started too many exports. Try again in 30 minutes.")).toBeTruthy();
});

it("shows the offline banner and explains a tap instead of exporting", async () => {
  mockOnline = false;
  const view = render(<DataExportScreen />);

  expect(view.getByText("You are offline. An export needs a connection.")).toBeTruthy();
  await act(async () => { fireEvent.press(view.getByLabelText("Export my data")); });

  expect(mockShowToast).toHaveBeenCalledWith("This action can only be done while online");
  expect(mockRunDataExport).not.toHaveBeenCalled();
});
