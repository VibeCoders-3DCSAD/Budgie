import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { useSession } from "../../../../features/auth/components/AccessProvider";
import { TransactionFormUnavailable } from "../../../../features/ledger/components/TransactionFormUnavailable";
import NewTransactionScreen from "../../../../features/ledger/NewTransactionScreen";
import { loadTransactionForm, type TransactionFormProps } from "../../../../features/ledger/services/loadTransactionForm";
import { useTransactionFormStore } from "../../../../features/ledger/stores/useTransactionFormStore";
import { parseTransactionFormParams } from "../../../../features/ledger/transactionFormRoute";
import { emitTourEvent } from "../../../../features/onboarding-tour/stores/useTourTargets";
import { FullScreenPage } from "../../../../features/shell/components/FullScreenPage";
import { goBackOr } from "../../../../features/shell/helpers/shellNavigation";
import { ROUTES } from "../../../../routes";

type FormState = { status: "loading" } | { status: "ready"; props: TransactionFormProps } | { status: "unavailable" };

const close = () => goBackOr(ROUTES.activity);

// Add or edit a transaction. Link here only with transactionFormHref(); see features/ledger/transactionFormRoute.
export default function TransactionFormRoute() {
  const { accessToken, userId, deviceId } = useSession();
  // Keyed by value: the params object is not guaranteed to keep its identity between renders.
  const paramsKey = JSON.stringify(useLocalSearchParams());
  const target = useMemo(() => parseTransactionFormParams(JSON.parse(paramsKey)), [paramsKey]);
  const [form, setForm] = useState<FormState>({ status: "loading" });

  useEffect(() => {
    if (!target) { setForm({ status: "unavailable" }); return; }
    let active = true;
    setForm({ status: "loading" });
    loadTransactionForm(userId, target)
      .then((props) => { if (active) setForm(props ? { status: "ready", props } : { status: "unavailable" }); })
      .catch(() => { if (active) setForm({ status: "unavailable" }); });
    return () => { active = false; };
  }, [target, userId]);

  if (form.status !== "ready") {
    return <FullScreenPage><TransactionFormUnavailable loading={form.status === "loading"} onClose={close} /></FullScreenPage>;
  }

  const editing = Boolean(form.props.transaction);
  return <FullScreenPage>
    <NewTransactionScreen userId={userId} deviceId={deviceId} accessToken={accessToken} {...form.props}
      onClose={() => {
        if (editing) useTransactionFormStore.getState().recordEditClosed();
        close();
      }}
      onCreated={(unusualSpending) => {
        useTransactionFormStore.getState().recordCreated(unusualSpending);
        router.dismissTo(ROUTES.activity);
        emitTourEvent("transaction-created");
      }} />
  </FullScreenPage>;
}
