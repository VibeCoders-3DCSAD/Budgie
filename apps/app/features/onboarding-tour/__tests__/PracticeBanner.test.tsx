jest.mock("@expo/vector-icons", () => ({ MaterialCommunityIcons: () => null }));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) }));

import { act, render, screen } from "@testing-library/react-native";
import { PRACTICE_BANNER_TEXT, PracticeBanner } from "../components/PracticeBanner";
import { startPracticeMode, stopPracticeMode } from "../../../services/practiceMode";

afterEach(() => { stopPracticeMode(); });

it("shows only while the tour's practice data is on screen", () => {
  render(<PracticeBanner />);
  expect(screen.queryByText(PRACTICE_BANNER_TEXT)).toBeNull();
  act(() => startPracticeMode({} as never, jest.fn()));
  expect(screen.getByText(PRACTICE_BANNER_TEXT)).toBeTruthy();
  expect(screen.getByLabelText(PRACTICE_BANNER_TEXT)).toBeTruthy();
  act(() => { stopPracticeMode(); });
  expect(screen.queryByText(PRACTICE_BANNER_TEXT)).toBeNull();
});
