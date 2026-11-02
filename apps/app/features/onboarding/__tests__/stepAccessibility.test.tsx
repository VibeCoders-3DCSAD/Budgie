import React from "react";
import { fireEvent, render } from "@testing-library/react-native";
import { CardSelectStep } from "../steps/CardSelectStep";
import { CardMultiSelectStep } from "../steps/CardMultiSelectStep";
import { InputStep } from "../steps/InputStep";
import { ReviewStep } from "../steps/ReviewStep";
import type { StepConfig } from "../types";

jest.mock("phosphor-react-native", () => ({ Check: "Icon", PencilSimple: "Icon" }));

const optionStep: StepConfig = {
  key: "runway",
  title: "Savings Runway",
  kind: "card_select",
  questionKey: "runway",
  options: [
    { key: "none", label: "No savings", description: "Less than a month" },
    { key: "two", label: "Two months" },
  ],
};

it("names options and exposes the selected one", () => {
  const onSelect = jest.fn();
  const view = render(<CardSelectStep step={optionStep} selected="two" onSelect={onSelect} />);

  expect(view.getByRole("radio", { name: "No savings" }).props.accessibilityState).toEqual({ selected: false });
  expect(view.getByRole("radio", { name: "Two months" }).props.accessibilityState).toEqual({ selected: true });
  expect(view.getByText("Less than a month")).toBeTruthy();

  fireEvent.press(view.getByRole("radio", { name: "No savings" }));
  expect(onSelect).toHaveBeenCalledWith("none");
});

it("names multi-select options and exposes their checked state", () => {
  const view = render(<CardMultiSelectStep step={optionStep} selected={["none"]} onToggle={jest.fn()} />);

  expect(view.getByRole("checkbox", { name: "No savings" }).props.accessibilityState).toEqual({ checked: true });
  expect(view.getByRole("checkbox", { name: "Two months" }).props.accessibilityState).toEqual({ checked: false });
});

it("names each review row's Edit button after the row", () => {
  const onEdit = jest.fn();
  const view = render(<ReviewStep answers={{ paying_off_debt: "false" }} onEdit={onEdit} incomeText="50000" />);

  fireEvent.press(view.getByRole("button", { name: "Edit Monthly Income After Deductions" }));
  expect(onEdit).toHaveBeenCalledTimes(1);
  expect(view.getByRole("button", { name: "Edit Currently Paying Off Debt" })).toBeTruthy();
});

it("names text inputs", () => {
  const inputStep: StepConfig = { key: "monthly_income", title: "Income", kind: "input", questionKey: "monthly_income", inputLabel: "Average Monthly Income" };
  expect(render(<InputStep step={inputStep} value="" onChangeText={jest.fn()} />).getByLabelText("Average Monthly Income")).toBeTruthy();
});
