import React from "react";
import { configure, fireEvent, render, waitFor } from "@testing-library/react-native";
import OnboardingFlow from "../OnboardingFlow";

configure({ asyncUtilTimeout: 5000 });

jest.mock("../../../lib/api", () => ({ API_BASE_URL: "http://test", REQUEST_TIMEOUT_MS: 1000 }));
jest.mock("phosphor-react-native", () => ({ CaretLeft: "Icon", CaretRight: "Icon", Check: "Icon", CheckCircle: "Icon", PencilSimple: "Icon" }));
jest.mock("../../../services/connectivity", () => ({ useConnectivityStore: (selector: (state: { online: boolean }) => unknown) => selector({ online: true }) }));
const mockShowToast = jest.fn();
jest.mock("../../../components/Toast", () => ({ useToast: () => ({ showToast: mockShowToast }) }));
const mockSubmit = jest.fn();
const mockUpdate = jest.fn();
const mockAnswers = {
  monthly_income: "50000", emergency_savings_runway: "2_months", monthly_essential_living_costs: "30000", paying_off_debt: "false", credit_card_revolving_months: "always_before_due", high_expense_seasons: ["christmas_ber_months"], low_expense_seasons: ["summer"], saving_seasons: ["summer"],
};
jest.mock("../api", () => ({
  getCurrentSession: async () => ({ response: { ok: true }, body: { payload: { session: { id: "session-1", status: "in_progress", current_step_key: "review", raw_answers: mockAnswers } } } }),
  updateSession: async (...args: unknown[]) => { mockUpdate(...args); return { response: { ok: true }, body: {} }; },
  submitSession: (...args: unknown[]) => mockSubmit(...args),
}));

beforeEach(() => mockUpdate.mockClear());

it("saves unknown essential costs without stripping the answer", async () => {
  const view = render(<OnboardingFlow accessToken="token" userId="user-1" onComplete={jest.fn()} />);
  fireEvent.press(await view.findByLabelText("Edit Monthly Essential Costs"));
  fireEvent.press(view.getByText("I don't know"));
  expect(view.getByLabelText("I don't know").props.accessibilityState.selected).toBe(true);
  expect(view.getByText("Essential Living Costs")).toBeTruthy();
  expect(mockUpdate).not.toHaveBeenCalled();
  fireEvent.press(view.getByLabelText("I don't know"));
  expect(view.getByLabelText("I don't know").props.accessibilityState.selected).toBe(true);
  fireEvent.press(view.getByLabelText("Continue"));
  expect(view.getByText("Current Debt")).toBeTruthy();
  await waitFor(() => expect(mockUpdate).toHaveBeenLastCalledWith("token", "session-1", expect.objectContaining({ raw_answers: expect.objectContaining({ monthly_essential_living_costs: "not_sure" }) })));
});

it("clears the unknown selection when an essential-cost amount is entered", async () => {
  const view = render(<OnboardingFlow accessToken="token" userId="user-1" onComplete={jest.fn()} />);
  fireEvent.press(await view.findByLabelText("Edit Monthly Essential Costs"));
  fireEvent.press(view.getByLabelText("I don't know"));
  fireEvent.changeText(view.getByPlaceholderText("0"), "20000");
  expect(view.getByLabelText("I don't know").props.accessibilityState.selected).toBe(false);
  fireEvent.press(view.getByLabelText("Continue"));
  await waitFor(() => expect(mockUpdate).toHaveBeenLastCalledWith("token", "session-1", expect.objectContaining({ raw_answers: expect.objectContaining({ monthly_essential_living_costs: "20000" }) })));
});

it.each([
  ["I don't use a credit card", "no_credit_card"],
  ["I always pay on or before the due date", "always_before_due"],
  ["1-11 months", "1_to_11_months"],
  ["Over a year", "over_a_year"],
])("selects %s without advancing until Continue", async (label, value) => {
  const view = render(<OnboardingFlow accessToken="token" userId="user-1" onComplete={jest.fn()} />);
  fireEvent.press(await view.findByLabelText("Edit Credit Card Payments"));
  expect(view.getAllByRole("radio")).toHaveLength(4);
  fireEvent.press(view.getByLabelText(label));
  expect(view.getByLabelText(label).props.accessibilityState.selected).toBe(true);
  expect(view.getByText("Credit Card Payments")).toBeTruthy();
  fireEvent.press(view.getByLabelText("Continue"));
  expect(view.getByText("Higher-Expense Seasons")).toBeTruthy();
  await waitFor(() => expect(mockUpdate).toHaveBeenLastCalledWith("token", "session-1", expect.objectContaining({ raw_answers: expect.objectContaining({ credit_card_revolving_months: value }) })));
});

it("shares custom events across questions and includes them in review and submission", async () => {
  mockSubmit.mockResolvedValue({ response: { ok: true }, body: { payload: { classification_available: false, assessment: null } } });
  const view = render(<OnboardingFlow accessToken="token" userId="user-1" onComplete={jest.fn()} />);
  fireEvent.press(await view.findByLabelText("Edit Higher-Expense Seasons"));
  fireEvent.press(view.getByText("Add custom event"));
  fireEvent.changeText(view.getByLabelText("Event name"), "Tuition payment");
  fireEvent.press(view.getByLabelText("January"));
  fireEvent.press(view.getByLabelText("August"));
  fireEvent.press(view.getByText("Add event"));
  expect(view.getByLabelText("Tuition payment").props.accessibilityState.checked).toBe(true);
  fireEvent.press(view.getByLabelText("Continue"));
  expect(view.getByText("Lower-Expense Seasons")).toBeTruthy();
  expect(view.queryByLabelText("Tuition payment")).toBeNull();
  fireEvent.press(view.getByLabelText("Continue"));
  fireEvent.press(view.getByLabelText("Tuition payment"));
  fireEvent.press(view.getByLabelText("Continue"));
  expect(view.getAllByText(/Tuition payment \(January, August\)/)).toHaveLength(2);
  fireEvent.press(view.getByText("Submit Assessment"));
  await view.findByText("Assessment Complete");
  const saved = mockUpdate.mock.calls.at(-1)![2].raw_answers;
  expect(saved.custom_seasonal_events).toEqual([{ id: expect.stringMatching(/^custom_/), name: "Tuition payment", months: [1, 8] }]);
  expect(saved.high_expense_seasons).toContain(saved.custom_seasonal_events[0].id);
  expect(saved.saving_seasons).toContain(saved.custom_seasonal_events[0].id);
});

it("shows the classification returned when finalizing the questionnaire", async () => {
  mockSubmit.mockResolvedValue({ response: { ok: true }, body: { payload: {
    classification_available: true,
    assessment: { output_snapshot: {
      emergency_savings: { status: "SUCCESS", label: "EMERGENCY_FUND_ADEQUATE", value: 6 },
      debt_burden: { status: "SUCCESS", label: "NOT_OVERBURDENED", value: 0.1 },
      financial_margin: { status: "SUCCESS", label: "POSITIVE_FINANCIAL_MARGIN", value: 15000 },
      credit_card_behavior: [{ status: "SUCCESS", label: "TRANSACTOR", value: 0, source: "self_reported" }],
    } },
  } } });
  const view = render(<OnboardingFlow accessToken="token" userId="user-1" onComplete={jest.fn()} />);
  fireEvent.press(await view.findByText("Submit Assessment"));
  expect(await view.findByText("Assessment Complete")).toBeTruthy();
  expect(await view.findByText("Well covered")).toBeTruthy();
  expect(view.getByText("Money left over")).toBeTruthy();
  expect(view.getByText("Paid in full")).toBeTruthy();
  expect(view.queryByText("Research eligibility")).toBeNull();
});

it("explains an unavailable classification and still lets the user continue", async () => {
  mockSubmit.mockResolvedValue({ response: { ok: true }, body: { payload: { classification_available: false, assessment: null } } });
  const onComplete = jest.fn();
  const view = render(<OnboardingFlow accessToken="token" userId="user-1" onComplete={onComplete} />);
  fireEvent.press(await view.findByText("Submit Assessment"));
  expect(await view.findByText("Your classification is unavailable right now. You can try again from the dashboard check-in.")).toBeTruthy();
  fireEvent.press(view.getByLabelText("Continue to Dashboard"));
  expect(onComplete).toHaveBeenCalledTimes(1);
});
