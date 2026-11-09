jest.mock("../../../components/Toast", () => ({ useToast: () => ({ showToast: jest.fn() }) }));
jest.mock("../services/tourRunner", () => ({ continueLater: jest.fn(async () => {}), previousStep: jest.fn(async () => {}), recordStep: jest.fn(async () => {}), skipStep: jest.fn(async () => {}) }));

import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { TapHint } from "../components/TapHint";
import * as runner from "../services/tourRunner";
import { TOUR_STEPS } from "../steps";
import { resetTourStore, useTourStore } from "../stores/useTourStore";
import { registerTarget } from "../stores/useTourTargets";

const user = "11111111-2222-4333-8444-555555555555";
const index = TOUR_STEPS.findIndex((step) => step.action === "tap");
const step = TOUR_STEPS[index]!;

beforeEach(() => { resetTourStore(); jest.clearAllMocks(); });

it("shows the tap instruction around the live control and records the step", async () => {
  const unregister = registerTarget(step.target!, { measure: async () => ({ x: 20, y: 600, width: 60, height: 40 }), page: null });
  render(<TapHint />);
  expect(screen.queryByText(step.title)).toBeNull();
  await act(async () => { useTourStore.setState({ tapIndex: index, userId: user }); });
  expect(screen.getByText(step.title)).toBeTruthy();
  expect(screen.getByText(step.body)).toBeTruthy();
  expect(runner.recordStep).toHaveBeenCalledWith(user, step.id);
  fireEvent.press(screen.getByLabelText("Skip step"));
  expect(runner.skipStep).toHaveBeenCalledWith(user);
  await act(async () => { useTourStore.setState({ tapIndex: null }); });
  expect(screen.queryByText(step.title)).toBeNull();
  unregister();
});
