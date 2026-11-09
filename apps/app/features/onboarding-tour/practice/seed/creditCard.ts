import { addDays, addMonths } from "../../../../lib/dates";
import { ACCOUNT_IDS } from "./accounts";
import { centavos, monthDay, practiceId, synced, transaction, type Row, type SeedContext, type SeedPart, type Transaction } from "./context";

const CARD = ACCOUNT_IDS.card;
const LIMIT_PESOS = 80_000;
const CUTOFF_DAY = 15;
const STATEMENT_DELAY_DAYS = 2;
const DUE_DELAY_DAYS = 20;

const PURCHASES = [
  { key: "netflix", slug: "recreation_streaming", pesos: 549, offset: 1, merchant: "Netflix" },
  { key: "shopee", slug: "clothing_accessories", pesos: 1_850, offset: 6, merchant: "Shopee" },
  { key: "dinner", slug: "restaurants_casual_dining", pesos: 2_300, offset: 12, merchant: "Mendokoro Ramenba" },
  { key: "grab", slug: "transport_ride_hailing", pesos: 420, offset: 20, merchant: "Grab" },
];

// One card paid in full every month: closed cycles with statements and payments, then the open cycle.
export function creditCardPart(ctx: SeedContext, months: [string, ...string[]]): SeedPart {
  const cycles: Row[] = [];
  const cardTransactions: Row[] = [];
  const statements: Row[] = [];
  const payments: Row[] = [];
  const transactions: Transaction[] = [];
  let outstanding = 0;
  for (let index = 0; index <= months.length; index += 1) {
    const cutoff = monthDay(addMonths(months[0], index), CUTOFF_DAY);
    const start = addDays(monthDay(addMonths(months[0], index - 1), CUTOFF_DAY), 1);
    if (start > ctx.today) break;
    const cycleId = practiceId(`card-cycle:${cutoff}`);
    const statementDate = addDays(cutoff, STATEMENT_DELAY_DAYS);
    const closed = statementDate <= ctx.today;
    cycles.push({ ...synced(ctx), id: cycleId, account_id: CARD, cycle_start_date: start, cutoff_date: cutoff, statement_date: closed ? statementDate : null });
    let cycleTotal = 0;
    for (const purchase of PURCHASES) {
      const date = addDays(start, purchase.offset);
      if (date > ctx.today || date > cutoff) continue;
      const row = transaction(ctx, { key: `card:${purchase.key}:${cutoff}`, date, type: "expense", pesos: purchase.pesos, slug: purchase.slug, source: CARD, merchant: purchase.merchant, extra: { credit_card_posting_date: date } });
      transactions.push(row);
      cardTransactions.push({ ...synced(ctx), transaction_id: row.id, account_id: CARD, cycle_id: cycleId, purchase_type: "regular", installment_id: null, client_mutation_id: row.id, applied_credit_centavos: 0 });
      cycleTotal += row.amount_centavos;
    }
    outstanding += cycleTotal;
    if (!closed || cycleTotal === 0) continue;
    const statementId = practiceId(`card-statement:${cutoff}`);
    const dueDate = addDays(statementDate, DUE_DELAY_DAYS);
    statements.push({ ...synced(ctx), id: statementId, cycle_id: cycleId, statement_date: statementDate, statement_balance_centavos: cycleTotal, minimum_due_centavos: Math.min(cycleTotal, centavos(500)), finance_charge_centavos: 0, due_date: dueDate, authoritative: true });
    const paymentDate = addDays(dueDate, -2);
    if (paymentDate > ctx.today) continue;
    const paymentId = practiceId(`card-payment:${cutoff}`);
    const row = transaction(ctx, { key: `card-payment:${cutoff}`, date: paymentDate, type: "expense", amount: cycleTotal, source: ACCOUNT_IDS.payroll, merchant: "Rewards Visa payment", extra: { client_mutation_id: `credit-card-payment:${paymentId}` } });
    transactions.push(row);
    payments.push({ ...synced(ctx), id: paymentId, cycle_id: cycleId, statement_id: statementId, transaction_id: row.id, amount_centavos: cycleTotal, payment_date: paymentDate, source_account_id: ACCOUNT_IDS.payroll, issuer_recognized: true, client_mutation_id: `credit-card-payment:${paymentId}` });
    outstanding -= cycleTotal;
  }
  const details = { ...synced(ctx), account_id: CARD, issuer: "BPI", credit_limit_centavos: centavos(LIMIT_PESOS), available_credit_centavos: centavos(LIMIT_PESOS) - outstanding, cutoff_day: CUTOFF_DAY, statement_day: CUTOFF_DAY + STATEMENT_DELAY_DAYS, alert_threshold_percent: 80, allows_extra_payments: true };
  return {
    tables: {
      credit_card_details: [details],
      credit_card_repayment_preferences: [{ ...synced(ctx), account_id: CARD, strategy: "pay_in_full" }],
      credit_card_cycles: cycles,
      credit_card_transactions: cardTransactions,
      credit_card_statements: statements,
      credit_card_payments: payments,
    },
    transactions,
    balances: { [CARD]: -outstanding },
  };
}
