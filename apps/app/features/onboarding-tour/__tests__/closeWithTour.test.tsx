import { act, render } from "@testing-library/react-native";
import { useCloseWithTour } from "../hooks/useCloseWithTour";
import { TOUR_STEPS } from "../steps";
import { resetTourStore, useTourStore } from "../stores/useTourStore";

const menuIndex = TOUR_STEPS.findIndex((step) => step.target === "activity-kebab-menu");

function Menu({ open, close }: { open: boolean; close: () => void }) {
  useCloseWithTour("activity-kebab-menu", open, close);
  return null;
}

beforeEach(() => resetTourStore());

it("leaves the menu open as the tour arrives on its step, and closes it once the tour moves on", async () => {
  const close = jest.fn();
  await act(async () => { useTourStore.setState({ stepIndex: menuIndex - 1 }); });
  render(<Menu open close={close} />);
  await act(async () => { useTourStore.setState({ stepIndex: menuIndex }); });
  expect(close).not.toHaveBeenCalled();
  await act(async () => { useTourStore.setState({ stepIndex: menuIndex + 1 }); });
  expect(close).toHaveBeenCalledTimes(1);
});

it("closes the menu when the tour stops on its step", async () => {
  const close = jest.fn();
  await act(async () => { useTourStore.setState({ stepIndex: menuIndex }); });
  render(<Menu open close={close} />);
  await act(async () => { useTourStore.setState({ stepIndex: null }); });
  expect(close).toHaveBeenCalledTimes(1);
});
