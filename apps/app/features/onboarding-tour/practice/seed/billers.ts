import { ACCOUNT_IDS } from "./accounts";
import { centavos, monthDay, practiceId, synced, transaction, type SeedContext, type SeedPart } from "./context";

type Biller = { key: string; name: string; slug: string; pesos: number; day: number; familySupport?: boolean };

// Andrea's monthly bills, plus the remittance she sends her parents.
const BILLERS: Biller[] = [
  { key: "rent", name: "Condo rent", slug: "housing_rent", pesos: 12_000, day: 2 },
  { key: "meralco", name: "Meralco electricity", slug: "housing_electricity", pesos: 2_000, day: 8 },
  { key: "internet", name: "PLDT Home Fiber", slug: "housing_internet", pesos: 1_699, day: 10 },
  { key: "postpaid", name: "Globe postpaid plan", slug: "communication_mobile_postpaid", pesos: 999, day: 20 },
  { key: "parents", name: "Padala kay Mama at Papa", slug: "misc_other", pesos: 5_000, day: 17, familySupport: true },
];

export function billersPart(ctx: SeedContext, months: [string, ...string[]]): SeedPart {
  const scheduledPayments = BILLERS.map((biller) => ({
    ...synced(ctx), id: practiceId(`biller:${biller.key}`), name: biller.name, subcategory_id: ctx.subcategoryId(biller.slug),
    source_account_id: ACCOUNT_IDS.payroll, amount_centavos: centavos(biller.pesos), frequency: "monthly", due_day_of_month: biller.day,
    starts_on: months[0], auto_post: false, is_family_support: biller.familySupport ?? false, is_dependent_support: false,
    protected_by_default: true, status: "active",
  }));
  const transactions = [];
  const records = [];
  for (const month of months) {
    for (const biller of BILLERS) {
      const date = monthDay(month, biller.day);
      if (date > ctx.today) continue;
      const row = transaction(ctx, { key: `biller:${biller.key}:${month}`, date, type: "expense", pesos: biller.pesos, slug: biller.slug, source: ACCOUNT_IDS.payroll, merchant: biller.name });
      transactions.push(row);
      records.push({ ...synced(ctx), id: practiceId(`biller-record:${biller.key}:${month}`), scheduled_payment_id: practiceId(`biller:${biller.key}`), transaction_id: row.id, occurrence_date: date, payment_date: date, amount_centavos: row.amount_centavos, source: "manual", settles_occurrence: true });
    }
  }
  return { tables: { scheduled_payments: scheduledPayments, scheduled_payment_records: records }, transactions };
}
