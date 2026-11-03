import { useCallback, useState } from "react";
import { manualCommitmentDraft, parseBudgetAmount, selectedCommitmentBudgets, type CommitmentBudget, type CommitmentKind, type CommitmentPreview, type CommitmentSkips } from "../helpers/commitmentBudget";
import { previewPaidCentavos, type PlanCommitmentPayments } from "../helpers/commitmentPayments";

const NO_MANUAL_COMMITMENTS: CommitmentSkips = { debtRepayments: false, savingsContributions: false, scheduledPayments: false };

// The commitments the month requires, the user's draft budget for each, and which amount fields are invalid.
export function useCommitmentDraft() {
  const [preview, setPreview] = useState<CommitmentPreview | null>(null);
  const [draft, setDraft] = useState<CommitmentPreview | null>(null);
  // Commitment types the user budgets by hand on the review step instead of setting aside their amount due.
  const [manual, setManual] = useState<CommitmentSkips>(NO_MANUAL_COMMITMENTS);
  const [invalidFields, setInvalidFields] = useState<Record<string, boolean>>({});
  const anyManual = manual.debtRepayments || manual.savingsContributions || manual.scheduledPayments;
  const hasInvalidCommitments = Object.values(invalidFields).some(Boolean);

  const setValidity = useCallback((key: string, valid: boolean) => setInvalidFields((current) => ({ ...current, [key]: !valid })), []);
  const clearValidity = useCallback(() => setInvalidFields({}), []);

  // A freshly loaded preview starts the draft at every amount due, with nothing budgeted manually.
  const reset = useCallback((next: CommitmentPreview) => {
    setPreview(next);
    setDraft(next);
    setInvalidFields({});
    setManual(NO_MANUAL_COMMITMENTS);
  }, []);

  const changeManual = (next: CommitmentSkips, payments: PlanCommitmentPayments | null) => {
    setDraft((current) => current && preview ? manualCommitmentDraft(current, preview, manual, next, previewPaidCentavos(preview, payments)) : current);
    setManual(next);
  };

  const changeAmount = (kind: CommitmentKind, index: number, amount: string) => {
    const amountCentavos = parseBudgetAmount(amount);
    if (amountCentavos === null) return;
    setDraft((current) => current ? { ...current, [kind]: (current[kind] ?? []).map((row, rowIndex) => rowIndex === index ? { ...row, amountCentavos } : row) } : current);
  };

  // What the server reserves for each commitment: the preview's amounts due, or the user's reviewed draft.
  const previewBudgets = (skips: CommitmentSkips): CommitmentBudget[] | null => preview ? selectedCommitmentBudgets(preview, skips) : null;
  const draftBudgets = (skips: CommitmentSkips): CommitmentBudget[] | null => draft ? selectedCommitmentBudgets(draft, skips) : null;

  return { preview, draft, manual, anyManual, hasInvalidCommitments, setValidity, clearValidity, reset, changeManual, changeAmount, previewBudgets, draftBudgets };
}

export type CommitmentDraft = ReturnType<typeof useCommitmentDraft>;
