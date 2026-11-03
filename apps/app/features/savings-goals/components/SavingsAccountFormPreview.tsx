import React, { useState } from "react";
import { Text, View } from "react-native";
import { Banner, FormCard, Note, Segment, styles, v4, v4Font } from "../../../components/BudgieForm";
import { manilaToday } from "../../../lib/dates";
import { SavingsAction, SavingsInput, SavingsReviewRow } from "./SavingsFormControls";
import { SavingsContributionFields, SavingsInterestFields, SavingsTargetFields } from "./SavingsTypeFields";
import { contributionDescription, formatDraftMoney, formatDraftRate, newSavingsFormDraft, SAVINGS_FORM_TYPES, validateSavingsFormDraft, type SavingsFormDraft, type SavingsFormErrors, type SavingsFormType, type SavingsSharedDraft } from "../helpers/savingsAccountFormDraft";

// UX preview: drafts stay in memory and never reach persistence or sync.
export default function SavingsAccountFormPreview({ onCancel }: { onCancel: () => void }) {
  const [type, setType] = useState<SavingsFormType>("hysa");
  const [shared, setShared] = useState<SavingsSharedDraft>({ name: "", institution: "", balance: "", notes: "" });
  const [drafts, setDrafts] = useState<Record<SavingsFormType, SavingsFormDraft>>({ hysa: newSavingsFormDraft("hysa"), traditional: newSavingsFormDraft("traditional"), time_deposit: newSavingsFormDraft("time_deposit") });
  const [errors, setErrors] = useState<SavingsFormErrors>({});
  const [reviewing, setReviewing] = useState(false);
  const draft = drafts[type];
  const typeInfo = SAVINGS_FORM_TYPES.find((option) => option.key === type)!;

  function update(patch: Partial<SavingsFormDraft>) {
    setDrafts((previous) => ({ ...previous, [type]: { ...previous[type], ...patch } }));
    setErrors((previous) => Object.fromEntries(Object.entries(previous).filter(([key]) => !(key in patch) && key !== "schedule")));
  }
  function updateShared(patch: Partial<SavingsSharedDraft>) {
    setShared((previous) => ({ ...previous, ...patch }));
    setErrors((previous) => Object.fromEntries(Object.entries(previous).filter(([key]) => !(key in patch))));
  }
  function review() {
    const nextErrors = validateSavingsFormDraft(type, shared, draft, manilaToday());
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length === 0) setReviewing(true);
  }

  return <View style={{ gap: 14 }}>
    <View style={{ gap: 4 }}><Text style={{ fontFamily: v4Font, color: v4.ink, fontSize: 22, fontWeight: "800" }}>{reviewing ? "Review savings" : "Add savings"}</Text><Note>{reviewing ? "Check your details before returning to the form." : "Choose a savings type and enter the details shown by your bank."}</Note></View>
    <Banner tone="info">Form preview. You can review your details, but they will not be saved yet.</Banner>
    {reviewing ? <>
      <FormCard title={shared.name.trim()}>
        <SavingsReviewRow label="Savings type" value={typeInfo.label} />
        {shared.institution.trim() ? <SavingsReviewRow label="Institution" value={shared.institution.trim()} /> : null}
        <SavingsReviewRow label={type === "time_deposit" ? "Principal amount" : "Current balance"} value={formatDraftMoney(shared.balance)} />
        <SavingsReviewRow label={type === "hysa" ? "Base annual interest rate" : "Annual interest rate"} value={formatDraftRate(draft.annualRate)} />
        {type === "time_deposit" ? <>
          <SavingsReviewRow label="Deposit period" value={`${draft.startDate} to ${draft.maturityDate}`} />
          {draft.withdrawalTerms.trim() ? <SavingsReviewRow label="Early-withdrawal terms" value={draft.withdrawalTerms} /> : null}
        </> : <>
          <SavingsReviewRow label="Interest credited" value={draft.creditFrequency} />
          {type === "hysa" && draft.boosted ? <>
            <SavingsReviewRow label="Total boosted annual rate" value={`${formatDraftRate(draft.boostedRate)} on the first ${formatDraftMoney(draft.eligibleBalance)}`} />
            <SavingsReviewRow label="Higher-rate period" value={`${draft.boostStart} to ${draft.boostEnd}`} />
            <Note>The base rate applies above the eligible balance and outside this period.</Note>
          </> : null}
          <SavingsReviewRow label="Contributions" value={contributionDescription(draft)} />
          {draft.hasGoal ? <SavingsReviewRow label="Savings goal" value={`${formatDraftMoney(draft.target)} by ${draft.targetDate}`} /> : null}
        </>}
        {shared.notes.trim() ? <SavingsReviewRow label="Notes" value={shared.notes} /> : null}
      </FormCard>
      <SavingsAction label="Back to edit" onPress={() => setReviewing(false)} />
    </> : <>
      <FormCard title="Savings type">
        <Segment options={SAVINGS_FORM_TYPES} value={type} onChange={(next) => { setType(next); setErrors({}); }} />
        <Note>{typeInfo.description}</Note>
      </FormCard>
      <FormCard title="Account details">
        <SavingsInput label="Savings name" value={shared.name} onChange={(name) => updateShared({ name })} placeholder={type === "hysa" ? "e.g. Maya Savings" : type === "traditional" ? "e.g. BPI Savings" : "e.g. 6-month deposit"} error={errors.name} />
        <SavingsInput label="Institution (optional)" value={shared.institution} onChange={(institution) => updateShared({ institution })} placeholder="Bank or provider" />
        <SavingsInput label={type === "time_deposit" ? "Principal amount" : "Current balance"} value={shared.balance} onChange={(balance) => updateShared({ balance })} numeric suffix="₱" placeholder="0.00" error={errors.balance} />
      </FormCard>
      <SavingsInterestFields type={type} draft={draft} errors={errors} update={update} />
      {type !== "time_deposit" ? <>
        <SavingsContributionFields draft={draft} errors={errors} update={update} />
        <SavingsTargetFields draft={draft} errors={errors} update={update} />
      </> : null}
      <FormCard><SavingsInput label="Notes (optional)" value={shared.notes} onChange={(notes) => updateShared({ notes })} multiline placeholder="Anything else you want to remember" /></FormCard>
      {Object.keys(errors).length > 0 ? <Text accessibilityRole="alert" style={styles.fieldError}>Check the highlighted fields before reviewing.</Text> : null}
      <SavingsAction label="Review details" onPress={review} />
    </>}
    <SavingsAction label="Cancel" secondary onPress={onCancel} />
  </View>;
}
