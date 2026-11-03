import { getDebtAccount } from "../../../../local-db/repositories/debts/debtAccounts";
import { listDebtPayments } from "../../../../local-db/repositories/debts/debtPayments";
import { buildDebtForecast, getProjectedContributionForDate, type DebtForecast, type DebtForecastStatus } from "../helpers/debtForecast";
import { manilaToday } from "../../../../lib/dates";

export async function getDebtForecast(userId: string, debtId: string, asOf?: string): Promise<DebtForecast | null> {
  const debt = await getDebtAccount(userId, debtId);
  if (!debt) return null;
  const payments = await listDebtPayments(userId, debtId);
  return buildDebtForecast(debt, asOf, payments.map((payment) => ({ paymentDate: payment.payment_date, amountCentavos: payment.amount_centavos })));
}

export async function getForecastedPaymentDate(userId: string, debtId: string, asOf?: string): Promise<string | null> {
  return (await getDebtForecast(userId, debtId, asOf))?.projectedPayoffDate ?? null;
}

export async function getForecastedPayment(userId: string, debtId: string, date: string, asOf = manilaToday()): Promise<number | null> {
  const debt = await getDebtAccount(userId, debtId);
  if (!debt) return null;
  const payments = await listDebtPayments(userId, debtId);
  const scheduledPayments = payments.map((payment) => ({ paymentDate: payment.payment_date, amountCentavos: payment.amount_centavos }));
  const forecast = buildDebtForecast(debt, asOf, scheduledPayments);
  if (!forecast.points.some((point) => point.date === date)) return null;
  return getProjectedContributionForDate(debt, date, asOf, scheduledPayments);
}

export async function getDebtStatus(userId: string, debtId: string, asOf?: string): Promise<DebtForecastStatus | null> {
  return (await getDebtForecast(userId, debtId, asOf))?.status ?? null;
}
