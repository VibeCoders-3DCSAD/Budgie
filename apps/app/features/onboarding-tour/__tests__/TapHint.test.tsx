jest.mock("../../../components/Toast", () => ({ useToast: () => ({ showToast: jest.fn() }) }));
jest.mock("../services/tourRunner", () => ({ continueLater: jest.fn(async () => {}), nextStep: jest.fn(async () => {}), previousStep: jest.fn(async () => {}), skipStep: jest.fn(async () => {}) }));

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

it("shows the tap instruction around the live control without saving progress on every step", async () => {
  const unregister = registerTarget(step.target!, { measure: async () => ({ x: 20, y: 600, width: 60, height: 40 }), page: null });
  render(<TapHint />);
  expect(screen.queryByText(step.title)).toBeNull();
  await act(async () => { useTourStore.setState({ tapIndex: index, userId: user }); });
  expect(screen.getByText(step.title)).toBeTruthy();
  expect(screen.getByText(step.body)).toBeTruthy();
  fireEvent.press(screen.getByLabelText("Skip step"));
  expect(runner.skipStep).toHaveBeenCalledWith(user);
  await act(async () => { useTourStore.setState({ tapIndex: null }); });
  expect(screen.queryByText(step.title)).toBeNull();
  unregister();
});

it("gives a fill step a Next button and hides it while its target is off screen", async () => {
  const fillIndex = TOUR_STEPS.findIndex((item) => item.action === "fill" && !item.until);
  const fill = TOUR_STEPS[fillIndex]!;
  const unregister = registerTarget(fill.target!, { measure: async () => ({ x: 20, y: 200, width: 300, height: 80 }), page: null });
  render(<TapHint />);
  await act(async () => { useTourStore.setState({ tapIndex: fillIndex, userId: user }); });
  expect(screen.queryByLabelText("Skip step")).toBeNull();
  fireEvent.press(screen.getByLabelText("Next"));
  expect(runner.nextStep).toHaveBeenCalledWith(user);
  unregister();
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 300)); });
  expect(screen.queryByText(fill.title)).toBeNull();
});
