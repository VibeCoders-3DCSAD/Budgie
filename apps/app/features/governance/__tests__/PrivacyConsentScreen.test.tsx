import { act, fireEvent, render } from "@testing-library/react-native";
import PrivacyConsentScreen, { CONSENTED_CHECK_MS } from "../PrivacyConsentScreen";

const mockSubmitConsent = jest.fn();
jest.mock("../api", () => ({ submitConsent: (...args: unknown[]) => mockSubmitConsent(...args) }));

const VIEWPORT = 500;
const CONTENT = 2000;

function renderModal(props: { onComplete?: () => void; onDismiss?: () => void } = {}) {
  return render(<PrivacyConsentScreen visible accessToken="token" onComplete={props.onComplete ?? jest.fn()} onDismiss={props.onDismiss} />);
}

function scrollTo(view: ReturnType<typeof render>, offsetY: number) {
  fireEvent.scroll(view.getByLabelText("Terms and conditions text"), {
    nativeEvent: { contentOffset: { y: offsetY }, contentSize: { height: CONTENT, width: 300 }, layoutMeasurement: { height: VIEWPORT, width: 300 } },
  });
}

async function pressAgree(view: ReturnType<typeof render>) {
  await act(async () => { fireEvent.press(view.getByLabelText("Agree and continue")); });
}

beforeEach(() => { jest.useFakeTimers(); mockSubmitConsent.mockReset(); });
afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); });

it("only accepts the terms after they are scrolled to the end", async () => {
  mockSubmitConsent.mockResolvedValue({ response: { ok: true } });
  const onComplete = jest.fn();
  const view = renderModal({ onComplete });

  expect(view.getByText("Scroll to the end to accept.")).toBeTruthy();
  await pressAgree(view);
  scrollTo(view, CONTENT / 2 - VIEWPORT);
  await pressAgree(view);
  expect(mockSubmitConsent).not.toHaveBeenCalled();

  scrollTo(view, CONTENT - VIEWPORT);
  await pressAgree(view);
  expect(mockSubmitConsent).toHaveBeenCalledWith("token", expect.objectContaining({ consent_kind: "terms", status: "granted" }));
  expect(onComplete).not.toHaveBeenCalled();
  act(() => { jest.advanceTimersByTime(CONSENTED_CHECK_MS); });
  expect(onComplete).toHaveBeenCalledTimes(1);
});

it("treats terms that fit without scrolling as read", async () => {
  mockSubmitConsent.mockResolvedValue({ response: { ok: true } });
  const view = renderModal();
  const scroller = view.getByLabelText("Terms and conditions text");
  fireEvent(scroller, "layout", { nativeEvent: { layout: { x: 0, y: 0, width: 300, height: VIEWPORT } } });
  fireEvent(scroller, "contentSizeChange", 300, VIEWPORT - 100);

  expect(view.getByText("By continuing you agree to these terms.")).toBeTruthy();
  await pressAgree(view);
  expect(mockSubmitConsent).toHaveBeenCalledTimes(1);
});

it("shows an error and allows a retry when recording consent fails", async () => {
  mockSubmitConsent.mockResolvedValueOnce({ response: { ok: false } }).mockResolvedValueOnce({ response: { ok: true } });
  const onComplete = jest.fn();
  const view = renderModal({ onComplete });
  scrollTo(view, CONTENT - VIEWPORT);

  await pressAgree(view);
  expect(view.getByText("Consent service is unavailable. Please try again.")).toBeTruthy();
  act(() => { jest.advanceTimersByTime(CONSENTED_CHECK_MS); });
  expect(onComplete).not.toHaveBeenCalled();

  await pressAgree(view);
  expect(mockSubmitConsent).toHaveBeenCalledTimes(2);
  act(() => { jest.advanceTimersByTime(CONSENTED_CHECK_MS); });
  expect(onComplete).toHaveBeenCalledTimes(1);
});

it("declines without recording consent", () => {
  const onDismiss = jest.fn();
  const view = renderModal({ onDismiss });
  fireEvent.press(view.getByLabelText("Decline terms"));
  expect(onDismiss).toHaveBeenCalledTimes(1);
  expect(mockSubmitConsent).not.toHaveBeenCalled();
});
