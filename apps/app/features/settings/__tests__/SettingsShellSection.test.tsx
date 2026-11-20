jest.mock("@expo/vector-icons", () => ({ MaterialCommunityIcons: () => null }));
jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));
jest.mock("../../shell/components/SyncButton", () => ({ SyncStatusIcon: () => null }));
jest.mock("../../sync/SyncProvider", () => ({ useSync: () => ({ syncing: false, queueCount: 0, syncMessage: null, handleSync: jest.fn() }) }));
jest.mock("../../onboarding-tour/components/TourTarget", () => ({ TourTarget: ({ children }: { children: React.ReactNode }) => children }));
const mockReplayStage = jest.fn();
jest.mock("../../onboarding-tour/hooks/useTutorialEntry", () => ({
  useTutorialEntry: () => ({ canResume: false, busy: false, resume: jest.fn(), replay: jest.fn(), replayStage: mockReplayStage }),
}));

import { fireEvent, render, screen } from "@testing-library/react-native";
import { TOUR_STAGES } from "../../onboarding-tour/types";
import { SettingsShellSection } from "../components/SettingsShellSection";

const devFlag = (globalThis as { __DEV__?: boolean }).__DEV__;
afterEach(() => { (globalThis as { __DEV__?: boolean }).__DEV__ = devFlag; });

it("offers replaying the tour from any stage, in a list that opens on demand, in release builds", () => {
  (globalThis as { __DEV__?: boolean }).__DEV__ = false;
  render(<SettingsShellSection userId="11111111-2222-4333-8444-555555555555" />);
  expect(screen.queryByText("Developer")).toBeNull();
  expect(screen.queryByLabelText("Replay from Savings")).toBeNull();
  fireEvent.press(screen.getByLabelText("Replay from a stage"));
  for (const stage of TOUR_STAGES) expect(screen.getByLabelText(`Replay from ${stage}`)).toBeTruthy();
  fireEvent.press(screen.getByLabelText("Replay from Savings"));
  expect(mockReplayStage).toHaveBeenCalledWith("Savings");
  fireEvent.press(screen.getByLabelText("Replay from a stage"));
  expect(screen.queryByLabelText("Replay from Savings")).toBeNull();
});
