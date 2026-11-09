import { router } from "expo-router";
import { useSession } from "../../../../../../features/auth/components/AccessProvider";
import NonCreditDebtListScreen from "../../../../../../features/debt-manager/NonCreditDebtListScreen";
import { InnerPage } from "../../../../../../features/shell/components/InnerPage";
import { useShellPage } from "../../../../../../features/shell/components/PageScroll";
import { ROUTES } from "../../../../../../routes";
import { TourTarget } from "../../../../../../features/onboarding-tour/components/TourTarget";

function OtherDebts() {
  const { userId, deviceId } = useSession();
  const { goBack } = useShellPage();
  return <TourTarget id="loans-list" fill><NonCreditDebtListScreen userId={userId} deviceId={deviceId} onBack={goBack}
    onOpenDebt={(id) => router.push({ pathname: ROUTES.planOtherDebt, params: { id } })} /></TourTarget>;
}

export default function OtherDebtsRoute() {
  return <InnerPage title="Non Credit Card Debts" fallbackHref={ROUTES.planDebts}><OtherDebts /></InnerPage>;
}
