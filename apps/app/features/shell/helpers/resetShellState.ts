import { clearTransactionCache } from "../../ledger/transactionCache";
import { useTransactionFormStore } from "../../ledger/stores/useTransactionFormStore";
import { useShellChromeStore } from "../stores/useShellChromeStore";

// Shell-wide UI state and cached rows, cleared whenever the data under the shell changes: a logout, a lock,
// or the tour switching to or from its practice data.
export function resetShellState(): void {
  useTransactionFormStore.getState().dismissUnusualSpending();
  useShellChromeStore.getState().setActivityEditing(false);
  clearTransactionCache();
}
