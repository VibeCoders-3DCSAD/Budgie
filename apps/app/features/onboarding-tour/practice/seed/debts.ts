import { addMonths } from "../../../../lib/dates";
import { ACCOUNT_IDS } from "./accounts";
import { centavos, monthDay, nextMonthlyDate, practiceId, synced, transaction, type Row, type SeedContext, type SeedPart, type Transaction } from "./context";

export const DEBT_IDS = {
  motorcycle: practiceId("debt:motorcycle-loan"),
  sss: practiceId("debt:sss-salary-loan"),
};

type LoanSpec = {
  id: string; key: string; name: string; lender: string; preset: string; originalPesos: number; rateBps: number;
  paymentPesos: number; day: number; termMonths: number; monthsBeforeHistory: number; notes: string; presetExtra: Row;
};

const LOANS: LoanSpec[] = [
  { id: DEBT_IDS.motorcycle, key: "motorcycle", name: "Honda Click motorcycle", lender: "Honda Financial", preset: "auto_loan", originalPesos: 96_000, rateBps: 1_800, paymentPesos: 4_800, day: 5, termMonths: 24, monthsBeforeHistory: 6, notes: "Auto-debit from payroll on the 5th.", presetExtra: { autoLoan: { vehicleDescription: "Honda Click 125i", vehiclePurchasePriceCentavos: centavos(116_000), downpaymentCentavos: centavos(20_000), financedPrincipalCentavos: centavos(96_000) } } },
  { id: DEBT_IDS.sss, key: "sss", name: "SSS salary loan", lender: "SSS", preset: "salary_loan", originalPesos: 40_000, rateBps: 1_000, paymentPesos: 1_850, day: 10, termMonths: 24, monthsBeforeHistory: 2, notes: "Deducted from salary every month.", presetExtra: { salaryLoan: { provider: "sss", linkedIncomeSourceId: null, repaymentMethod: "payroll_deduction", deductionAmountCentavos: centavos(1_850), deductionSchedule: "monthly" } } },
];

// Andrea's own payoff goal, a little after each loan's maturity: the app adds a year's interest at a time, which
// puts the projected payoff about a month past maturity.
const TARGET_SLACK_MONTHS = 3;

// Two amortized loans on a diminishing balance, each with its monthly payments recorded from payroll, and a
// target payoff date so the repayment forecast and estimated payoff have a schedule to follow.
export function debtsPart(ctx: SeedContext, months: [string, ...string[]]): SeedPart {
  const accounts: Row[] = [];
  const payments: Row[] = [];
  const transactions: Transaction[] = [];
  for (const loan of LOANS) {
    const startDate = monthDay(addMonths(months[0], -loan.monthsBeforeHistory), loan.day);
    let balance = centavos(loan.originalPesos);
    for (let index = 1; index <= loan.monthsBeforeHistory + months.length; index += 1) {
      const date = monthDay(addMonths(startDate, index), loan.day);
      if (date > ctx.today) break;
      const interest = Math.round(balance * loan.rateBps / 10_000 / 12);
      const principal = centavos(loan.paymentPesos) - interest;
      balance -= principal;
      if (date < months[0]) continue;
      const row = transaction(ctx, { key: `debt:${loan.key}:${date}`, date, type: "expense", pesos: loan.paymentPesos, source: ACCOUNT_IDS.payroll, merchant: `${loan.name} payment` });
      transactions.push(row);
      payments.push({ ...synced(ctx), id: practiceId(`debt-payment:${loan.key}:${date}`), debt_account_id: loan.id, transaction_id: row.id, source: "transaction", payment_date: date, amount_centavos: row.amount_centavos, principal_centavos: principal, interest_centavos: interest });
    }
    const maturityDate = monthDay(addMonths(startDate, loan.termMonths), loan.day);
    accounts.push({
      ...synced(ctx), id: loan.id, linked_account_id: ACCOUNT_IDS.payroll, name: loan.name, lender_name: loan.lender, preset_key: loan.preset, status: "active",
      original_balance_centavos: centavos(loan.originalPesos), current_balance_centavos: balance, annual_interest_rate_bps: loan.rateBps,
      minimum_payment_centavos: centavos(loan.paymentPesos), allows_extra_payments: true, payment_frequency: "monthly",
      payment_schedule: { dayOfMonth: loan.day }, next_due_date: nextMonthlyDate(ctx.today, loan.day),
      maturity_date: maturityDate, target_payoff_date: monthDay(addMonths(maturityDate, TARGET_SLACK_MONTHS), loan.day), interest_period: "annual", interest_method: "diminishing_balance", notes: loan.notes,
      preset_data: { startDate, feesCentavos: 0, penaltyInfo: null, termMonths: loan.termMonths, ...loan.presetExtra },
    });
  }
  return { tables: { debt_accounts: accounts, debt_payments: payments, debt_strategy_preferences: [{ ...synced(ctx), strategy: "avalanche" }] }, transactions };
}
