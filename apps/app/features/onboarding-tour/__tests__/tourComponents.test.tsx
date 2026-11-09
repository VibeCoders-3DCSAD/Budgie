jest.mock("@expo/vector-icons", () => ({ MaterialCommunityIcons: () => null }));
const mockShowToast = jest.fn();
jest.mock("../../../components/Toast", () => ({ useToast: () => ({ showToast: mockShowToast }) }));
jest.mock("../services/tourRunner", () => ({ startTour: jest.fn(async () => true), skipTour: jest.fn(async () => {}), continueLater: jest.fn(async () => {}), finishTour: jest.fn(async () => {}), recordStep: jest.fn(async () => {}), retryStep: jest.fn(), skipStep: jest.fn(async () => {}), nextStep: jest.fn(async () => {}), previousStep: jest.fn(async () => {}) }));

import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { TourOffer } from "../components/TourOffer";
import { TourTooltip } from "../components/TourTooltip";
import { useTutorialEntry } from "../hooks/useTutorialEntry";
import { TOUR_MESSAGES } from "../messages";
import { resetTourStore, useTourStore } from "../stores/useTourStore";
import type { TourStepDef } from "../types";
import { Text } from "react-native";
import * as mockRunner from "../services/tourRunner";

const user = "11111111-2222-4333-8444-555555555555";
const step: TourStepDef = { id: "accounts", stage: "Money", title: "Your accounts", body: "Every wallet and bank." };
const renderProps = { current: 2, goTo: jest.fn(), isFirst: false, isLast: false, next: jest.fn(), pause: jest.fn(), previous: jest.fn(), resume: jest.fn(), stop: jest.fn() };

beforeEach(() => { resetTourStore(); jest.clearAllMocks(); });

it("shows where the user is and moves on, back, or later", async () => {
  render(<TourTooltip {...renderProps} step={step} userId={user} />);
  expect(screen.getByText("Stage 2 of 10 · Money")).toBeTruthy();
  expect(screen.getByText("Your accounts")).toBeTruthy();
  expect(mockRunner.recordStep).toHaveBeenCalledWith(user, "accounts");
  fireEvent.press(screen.getByLabelText("Next"));
  fireEvent.press(screen.getByLabelText("Back"));
  expect(mockRunner.nextStep).toHaveBeenCalledWith(user);
  expect(mockRunner.previousStep).toHaveBeenCalled();
  fireEvent.press(screen.getByLabelText("Continue later"));
  await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith(TOUR_MESSAGES.paused));
});

it("offers retry, skip, or continue later when the highlighted control cannot be shown", () => {
  useTourStore.setState({ unavailableIndex: 2, saveFailed: true });
  render(<TourTooltip {...renderProps} step={step} userId={user} />);
  expect(screen.getByText(TOUR_MESSAGES.targetUnavailable)).toBeTruthy();
  expect(screen.getByText(TOUR_MESSAGES.saveFailed)).toBeTruthy();
  expect(screen.queryByLabelText("Next")).toBeNull();
  fireEvent.press(screen.getByLabelText("Retry"));
  fireEvent.press(screen.getByLabelText("Skip step"));
  expect(mockRunner.retryStep).toHaveBeenCalled();
  expect(mockRunner.skipStep).toHaveBeenCalledWith(user);
  expect(mockRunner.recordStep).not.toHaveBeenCalled();
});

it("finishes on the last step", async () => {
  render(<TourTooltip {...renderProps} isLast step={step} userId={user} />);
  fireEvent.press(screen.getByLabelText("Finish"));
  await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith(TOUR_MESSAGES.complete, "success"));
});

it("offers the tour once to a user who has not answered it", async () => {
  render(<TourOffer userId={user} />);
  expect(screen.queryByText("Take the tour?")).toBeNull();
  act(() => useTourStore.setState({ progress: { status: "not_started", stepId: null, updatedAt: "" } }));
  expect(screen.getByText(TOUR_MESSAGES.initial)).toBeTruthy();
  fireEvent.press(screen.getByLabelText("Skip for now"));
  await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith(TOUR_MESSAGES.skipped));
  fireEvent.press(screen.getByLabelText("Start tour"));
  expect(mockRunner.startTour).toHaveBeenCalledWith(user, "start");
});

function Entry() {
  const entry = useTutorialEntry(user);
  return <Text onPress={entry.resume}>{entry.canResume ? "resume" : "replay only"}</Text>;
}

it("offers Resume tutorial only when there is unfinished progress", async () => {
  render(<Entry />);
  expect(screen.getByText("replay only")).toBeTruthy();
  act(() => useTourStore.setState({ progress: { status: "paused", stepId: "accounts", updatedAt: "" } }));
  fireEvent.press(screen.getByText("resume"));
  await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith(TOUR_MESSAGES.resume));
  expect(mockRunner.startTour).toHaveBeenCalledWith(user, "resume");
});
