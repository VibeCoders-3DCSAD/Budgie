import { router } from "expo-router";
import { useSession } from "../../../../../features/auth/components/AccessProvider";
import DebtManagerOverview from "../../../../../features/debt-manager/components/DebtManagerOverview";
import { ROUTES } from "../../../../../routes";

export default function DebtsRoute() {
  const { userId } = useSession();
  return <DebtManagerOverview userId={userId}
    onOpenCreditCards={() => router.push(ROUTES.planCreditCards)}
    onOpenNonCreditDebts={() => router.push(ROUTES.planOtherDebts)}
    onOpenCard={(id) => router.push({ pathname: ROUTES.planCreditCard, params: { id } })}
    onOpenDebt={(id) => router.push({ pathname: ROUTES.planOtherDebt, params: { id } })} />;
}
