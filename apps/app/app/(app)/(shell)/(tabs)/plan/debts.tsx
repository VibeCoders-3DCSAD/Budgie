import { router } from "expo-router";
import { useSession } from "../../../../../features/auth/components/AccessProvider";
import DebtManagerOverview from "../../../../../features/debt-manager/components/DebtManagerOverview";
import { ROUTES } from "../../../../../routes";
import { TourTarget } from "../../../../../features/onboarding-tour/components/TourTarget";

export default function DebtsRoute() {
  const { userId } = useSession();
  // The overview is one tour target: the tour explains it as a whole, then opens each list and record.
  return <TourTarget id="debts-overview" fill><DebtManagerOverview userId={userId}
    onOpenCreditCards={() => router.push(ROUTES.planCreditCards)}
    onOpenNonCreditDebts={() => router.push(ROUTES.planOtherDebts)}
    onOpenCard={(id) => router.push({ pathname: ROUTES.planCreditCard, params: { id } })}
    onOpenDebt={(id) => router.push({ pathname: ROUTES.planOtherDebt, params: { id } })} /></TourTarget>;
}
