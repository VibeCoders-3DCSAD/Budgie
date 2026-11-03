import { useState } from "react";
import { createCreditCardCycle, updateCreditCardCycle, type CreditCardCycle } from "../../../local-db/repositories/credit-cards/creditCardCycles";
import { calculateCurrentCreditCardCycle } from "../../../local-db/repositories/credit-cards/creditCardCycleDates";
import type { FinancialAccount } from "../../../local-db/repositories/foundations/financialFoundations";
import { LocalDbError } from "../../../local-db/helpers";

export type CycleDateField = "start" | "cutoff";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// The billing-cycle draft for adding or overriding a cycle: its dates, validation, save and notices.
// onSaved reloads the screen's data after a successful save.
export function useCycleEditor(userId: string, deviceId: string, onSaved: () => Promise<void>) {
  const [editing, setEditing] = useState<{ account: FinancialAccount; cycle: CreditCardCycle | null } | null>(null);
  const [start, setStart] = useState("");
  const [cutoff, setCutoff] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [picker, setPicker] = useState<CycleDateField | null>(null);

  // An existing cycle starts the draft at its dates; a new one at the card's current cycle.
  function open(account: FinancialAccount, cycle: CreditCardCycle | null) {
    const defaults = cycle ?? (account.creditCardDetails ? calculateCurrentCreditCardCycle({ account_id: account.id, cutoff_day: account.creditCardDetails.cutoffDay }) : null);
    setEditing({ account, cycle });
    setStart(defaults?.cycle_start_date ?? "");
    setCutoff(defaults?.cutoff_date ?? "");
    setError(null);
    setNotice(null);
  }

  function close() {
    setEditing(null);
  }

  function setDate(field: CycleDateField, value: string) {
    if (field === "start") setStart(value);
    else setCutoff(value);
    setError(null);
  }

  async function save() {
    if (!editing || !ISO_DATE.test(start) || !ISO_DATE.test(cutoff) || start > cutoff) {
      setError("Some credit-card details are not valid. Check the highlighted fields and try again.");
      return;
    }
    setSaving(true);
    setNotice("Your credit-card changes are being saved. Please wait before trying again.");
    try {
      if (editing.cycle) await updateCreditCardCycle(userId, deviceId, editing.cycle.id, { cycle_start_date: start, cutoff_date: cutoff });
      else await createCreditCardCycle(userId, deviceId, { account_id: editing.account.id, cycle_start_date: start, cutoff_date: cutoff });
      setEditing(null);
      await onSaved();
      setNotice("Your credit-card changes were saved. Review the billing-cycle details before continuing.");
    } catch (saveError) {
      setError(
        saveError instanceof LocalDbError
          ? saveError.message
          : "Your credit-card changes could not be completed. Review the details and try again.",
      );
    } finally { setSaving(false); }
  }

  return { editing, start, cutoff, error, saving, notice, picker, open, close, setDate, setPicker, save };
}

export type CycleEditor = ReturnType<typeof useCycleEditor>;
