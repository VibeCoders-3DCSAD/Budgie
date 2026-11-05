// Builds a deterministic year-plus of seeded financial history in memory. seed.ts writes it to Supabase.
import { createHash, randomUUID } from "node:crypto";
import { DAY_MS, addDays, addMonths, centavos, createRandom, daysOfMonth, manilaNoon, monthDate, monthStartOf, nextMonthlyDate, toTime } from "./generation.js";
export { addDays, manilaToday } from "./generation.js";

export const seedMarker = "dummy-financial-data";
export const legacySeedMarker = "dummy-financial-data-v1";
// Seeded plans have no metadata column, so this model version is what marks them for cleanup.
export const seedForecastModelVersion = "seed-v1";
// Must match private.scheduled_payment_post_id and SCHEDULED_PAYMENT_POST_NAMESPACE on the device, so the
// auto-post job treats seeded biller payments as already posted instead of posting them again.
const SCHEDULED_PAYMENT_POST_NAMESPACE = "7f4fa802-4c64-4370-aed4-ca25c703928f";
// Thirteen full months plus the current one.
const HISTORY_MONTHS = 14;
const CARD_CYCLES = 13;

export const requiredSubcategorySlugs = [
  "income_salary", "income_freelance",
  "housing_rent", "housing_electricity", "housing_water", "housing_internet", "communication_mobile_postpaid",
  "recreation_streaming", "recreation_sports", "recreation_cinema", "health_insurance", "health_medicines",
  "transport_vehicle_registration", "transport_public", "transport_ride_hailing", "transport_fuel", "misc_other",
  "misc_personal_care", "education_tuition", "food_groceries", "food_fresh_produce",
  "restaurants_cafes", "restaurants_fast_food", "restaurants_street_food", "restaurants_delivery",
  "restaurants_casual_dining", "household_cleaning_supplies", "household_kitchenware", "clothing_accessories",
  "clothing_childrens", "clothing_womens", "communication_device", "restaurants_catering",
] as const;

type Row = Record<string, unknown>;

export type Transaction = Row & {
  id: string;
  transaction_type: "income" | "expense" | "transfer";
  transaction_date: string;
  amount_centavos: number;
  source_account_id: string | null;
  destination_account_id: string | null;
  category_id: null;
  subcategory_id: string | null;
  client_mutation_id: string;
};

export type SeedData = {
  accounts: Row[];
  savingsGoals: Row[];
  savingsGoalActivities: Row[];
  incomeSources: Row[];
  debtAccounts: Row[];
  creditCardDetails: Row[];
  creditCardCycles: Row[];
  transactions: Transaction[];
  creditCardTransactions: Row[];
  creditCardStatements: Row[];
  creditCardPayments: Row[];
  debtPayments: Row[];
  scheduledPayments: Row[];
  scheduledPaymentRecords: Row[];
  financialPlans: Row[];
  planForecastPoints: Row[];
  planAllocations: Row[];
  planDebtReservations: Row[];
  planSavingsReservations: Row[];
  // Card purchases to insert at a lower amount and then correct, so the server's purchase-amount trigger
  // lowers available credit by the card's outstanding balance (it can't be written directly).
  availableCreditAdjustments: { transactionId: string; insertAmountCentavos: number; amountCentavos: number }[];
  summary: { start: string; end: string; endingBalances: Record<string, number> };
};

function uuidV5(name: string, namespace: string) {
  const hash = createHash("sha1").update(Buffer.from(namespace.replace(/-/g, ""), "hex")).update(name, "utf8").digest();
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const hex = hash.subarray(0, 16).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function scheduledPaymentPostIds(scheduledPaymentId: string, dueDate: string) {
  const key = `scheduled-payment:${scheduledPaymentId}:${dueDate}`;
  return { transactionId: uuidV5(`${key}:transaction`, SCHEDULED_PAYMENT_POST_NAMESPACE), recordId: uuidV5(`${key}:record`, SCHEDULED_PAYMENT_POST_NAMESPACE) };
}

function wholePesos(amountCentavos: number) {
  return Math.round(amountCentavos / 100) * 100;
}

type Reservation = { monthIndex: number; amountCentavos: number; dueDate: string };

// This month's plan demonstrates surplus allocation: a one-off bonus funds a
// savings surplus (Emergency Fund first, then Avalanche or Snowball) and a debt
// surplus (loans that allow extra payments; card statements are fully reserved).
export const SURPLUS_DEMO = { bonus: 30_000, savingsSurplus: 13_000, debtSurplus: 8_000, extraLoanPayment: 3_000 } as const;

// Past months split what is left 60/40 between savings and debt. This month
// uses the demo amounts when the plan can afford them, and otherwise splits
// what is left the same way.
function planSurplus(remainingCentavos: number, isCurrentMonth: boolean): { savingsSurplus: number; debtSurplus: number } {
  if (remainingCentavos <= 0) return { savingsSurplus: 0, debtSurplus: 0 };
  const demoTotal = centavos(SURPLUS_DEMO.savingsSurplus + SURPLUS_DEMO.debtSurplus);
  if (isCurrentMonth && remainingCentavos >= demoTotal) return { savingsSurplus: centavos(SURPLUS_DEMO.savingsSurplus), debtSurplus: centavos(SURPLUS_DEMO.debtSurplus) };
  const savingsSurplus = Math.floor(remainingCentavos * 0.6);
  return { savingsSurplus, debtSurplus: remainingCentavos - savingsSurplus };
}

export function buildSeedData({ userId, today, seed, subcategoryIds }: { userId: string; today: string; seed: number; subcategoryIds: Map<string, string> }): SeedData {
  const random = createRandom(seed);
  const noisy = (pesos: number, spread = 0.12) => centavos(pesos * (1 - spread + random() * spread * 2));
  const subcategory = (slug: string) => {
    const id = subcategoryIds.get(slug);
    if (!id) throw new Error(`Missing subcategory ${slug}`);
    return id;
  };
  const marker = { dummy_data_source: seedMarker, generated_seed: seed };
  const currentMonth = monthStartOf(today);
  const months = Array.from({ length: HISTORY_MONTHS }, (_, index) => addMonths(currentMonth, index - HISTORY_MONTHS + 1));
  const start = months[0];
  const inWindow = (date: string) => date >= start && date <= today;
  const monthIndexOf = (date: string) => months.indexOf(monthStartOf(date));

  const accountIds = { bank: randomUUID(), wallet: randomUUID(), rewardsCard: randomUUID(), cashbackCard: randomUUID(), savings: randomUUID() };
  // Savings goals for the surplus demo; the savings account holds exactly what the goals have saved.
  const goalSpecs = [
    { name: "Emergency Fund", isEmergencyFund: true, target: 60_000, saved: 57_000, monthly: 2_000, months: 6, priority: "high", notes: "Almost complete: surplus fills it first." },
    { name: "Japan Trip", isEmergencyFund: false, target: 80_000, saved: 20_000, monthly: 5_000, months: 12, priority: "medium", notes: "Largest remaining need: Avalanche sends extra savings here." },
    { name: "New Laptop", isEmergencyFund: false, target: 45_000, saved: 38_000, monthly: 2_000, months: 4, priority: "medium", notes: "Closest to target: Snowball sends extra savings here." },
  ];
  const openingBalances = { [accountIds.bank]: centavos(90_000), [accountIds.wallet]: centavos(6_000), [accountIds.savings]: centavos(goalSpecs.reduce((total, goal) => total + goal.saved, 0)) };

  const transactions: Transaction[] = [];
  const addTransaction = (input: {
    date: string; type: Transaction["transaction_type"]; amount: number; slug?: string; source?: string; destination?: string;
    merchant?: string; notes?: string; id?: string; mutationId?: string; entrySource?: "manual" | "recurring"; extra?: Row;
  }) => {
    const row: Transaction = {
      id: input.id ?? randomUUID(), user_id: userId, transaction_type: input.type, status: "posted", entry_source: input.entrySource ?? "manual",
      transaction_date: input.date, posted_at: manilaNoon(input.date), amount_centavos: input.amount,
      category_id: null, subcategory_id: input.slug ? subcategory(input.slug) : null, source_account_id: input.source ?? null, destination_account_id: input.destination ?? null,
      merchant_name: input.merchant ?? null, notes: input.notes ?? null, client_mutation_id: input.mutationId ?? randomUUID(),
      metadata: marker, deleted: false, version: 1, ...input.extra,
    };
    transactions.push(row);
    return row;
  };

  // Income: semi-monthly salary with a December 13th-month bonus, variable freelance work, and tutoring that ended.
  const incomeSourceIds = { salary: randomUUID(), freelance: randomUUID(), tutoring: randomUUID() };
  for (const [index, month] of months.entries()) {
    for (const day of [15, 30]) {
      const date = monthDate(month, day);
      if (inWindow(date)) addTransaction({ date, type: "income", amount: centavos(32_500), slug: "income_salary", destination: accountIds.bank, merchant: "Northstar Services", notes: "Salary" });
    }
    const bonusDate = monthDate(month, 15);
    if (month.slice(5, 7) === "12" && inWindow(bonusDate)) addTransaction({ date: bonusDate, type: "income", amount: centavos(32_500), slug: "income_salary", destination: accountIds.bank, merchant: "Northstar Services", notes: "13th month pay" });
    if (month === currentMonth) addTransaction({ date: monthDate(month, 1), type: "income", amount: centavos(SURPLUS_DEMO.bonus), slug: "income_salary", destination: accountIds.bank, merchant: "Northstar Services", notes: "Performance bonus" });
    const freelanceDate = monthDate(month, 22);
    if (inWindow(freelanceDate)) addTransaction({ date: freelanceDate, type: "income", amount: noisy(9_000, 0.35), slug: "income_freelance", destination: accountIds.wallet, merchant: "Freelance design client" });
    if (index < 5) {
      for (const date of daysOfMonth(month).filter((day) => new Date(toTime(day)).getUTCDay() === 6 && inWindow(day))) {
        addTransaction({ date, type: "income", amount: centavos(1_500), slug: "income_freelance", destination: accountIds.wallet, merchant: "Weekend tutoring" });
      }
    }
  }
  const tutoringEnd = monthDate(months[4], 31);
  const incomeSources: Row[] = [
    { id: incomeSourceIds.salary, user_id: userId, name: "Northstar Services Salary", frequency: "semi_monthly", expected_amount_centavos: centavos(32_500), payday_day_of_month: 15, payday_second_day_of_month: 30, next_expected_date: [nextMonthlyDate(today, 15), nextMonthlyDate(today, 30)].sort()[0], is_active: true, destination_account_id: accountIds.bank, subcategory_id: subcategory("income_salary"), notes: "13th month pay arrives every December.", metadata: marker, version: 1, deleted: false },
    { id: incomeSourceIds.freelance, user_id: userId, name: "Freelance Design", frequency: "monthly", expected_amount_centavos: centavos(9_000), payday_day_of_month: 22, next_expected_date: nextMonthlyDate(today, 22), is_active: true, destination_account_id: accountIds.wallet, subcategory_id: subcategory("income_freelance"), notes: "Amount varies by project.", metadata: marker, version: 1, deleted: false },
    { id: incomeSourceIds.tutoring, user_id: userId, name: "Weekend Tutoring", frequency: "weekly", expected_amount_centavos: centavos(1_500), payday_day_of_week: 6, next_expected_date: null, is_active: false, destination_account_id: accountIds.wallet, subcategory_id: subcategory("income_freelance"), notes: `Ended on ${tutoringEnd} when the school term closed.`, metadata: marker, version: 1, deleted: false },
  ];

  // Billers and remittances. Auto-post payments use the server's derived ids; manual ones leave recent dues unpaid.
  const yearlyDueMonth = Number(months[4].slice(5, 7));
  const billerSpecs: { name: string; slug: string; amount: number; spread: number; frequency: "monthly" | "yearly"; day: number; autoPost: boolean; familySupport?: boolean; dependentSupport?: boolean; lastMonthIndex?: number; notes?: string }[] = [
    { name: "Apartment Rent", slug: "housing_rent", amount: 13_500, spread: 0, frequency: "monthly", day: 2, autoPost: false },
    { name: "Meralco", slug: "housing_electricity", amount: 2_800, spread: 0.2, frequency: "monthly", day: 6, autoPost: false },
    { name: "Maynilad", slug: "housing_water", amount: 550, spread: 0.15, frequency: "monthly", day: 8, autoPost: false },
    { name: "PLDT Home Fiber", slug: "housing_internet", amount: 1_699, spread: 0, frequency: "monthly", day: 10, autoPost: true },
    { name: "Netflix", slug: "recreation_streaming", amount: 549, spread: 0, frequency: "monthly", day: 12, autoPost: true },
    { name: "Globe Postpaid", slug: "communication_mobile_postpaid", amount: 999, spread: 0, frequency: "monthly", day: 18, autoPost: true },
    { name: "Maxicare HMO", slug: "health_insurance", amount: 2_000, spread: 0, frequency: "monthly", day: 20, autoPost: true },
    { name: "LTO Motorcycle Registration", slug: "transport_vehicle_registration", amount: 1_850, spread: 0, frequency: "yearly", day: 14, autoPost: false },
    { name: "Anytime Fitness", slug: "recreation_sports", amount: 1_500, spread: 0, frequency: "monthly", day: 3, autoPost: true, lastMonthIndex: 5, notes: "Cancelled membership." },
    { name: "Padala kay Nanay", slug: "misc_other", amount: 5_000, spread: 0, frequency: "monthly", day: 25, autoPost: false, familySupport: true, notes: "Monthly remittance to Mom in Iloilo." },
    { name: "Tuition support for Ben", slug: "education_tuition", amount: 2_000, spread: 0, frequency: "monthly", day: 1, autoPost: true, familySupport: true, dependentSupport: true, notes: "Younger brother's college tuition." },
  ];
  const scheduledPayments: Row[] = [];
  const scheduledPaymentRecords: Row[] = [];
  for (const spec of billerSpecs) {
    const id = randomUUID();
    const endsOn = spec.lastMonthIndex === undefined ? null : monthDate(months[spec.lastMonthIndex], spec.day);
    const active = !endsOn || endsOn >= today;
    const autoPost = spec.autoPost && active;
    scheduledPayments.push({
      id, user_id: userId, name: spec.name, subcategory_id: subcategory(spec.slug), source_account_id: accountIds.bank, amount_centavos: centavos(spec.amount),
      frequency: spec.frequency, due_day_of_month: spec.day, due_month: spec.frequency === "yearly" ? yearlyDueMonth : null, starts_on: start, ends_on: endsOn,
      auto_post: autoPost, auto_post_from: autoPost ? start : null, is_family_support: spec.familySupport ?? false, is_dependent_support: spec.dependentSupport ?? false,
      protected_by_default: true, notes: spec.notes ?? null, status: active ? "active" : "archived", version: 1, deleted: false,
    });
    for (const month of months) {
      if (spec.frequency === "yearly" && Number(month.slice(5, 7)) !== yearlyDueMonth) continue;
      const dueDate = monthDate(month, spec.day);
      if (!inWindow(dueDate) || (endsOn && dueDate > endsOn)) continue;
      if (spec.autoPost) {
        const ids = scheduledPaymentPostIds(id, dueDate);
        addTransaction({ id: ids.transactionId, date: dueDate, type: "expense", amount: centavos(spec.amount), slug: spec.slug, source: accountIds.bank, merchant: spec.name, mutationId: `scheduled-payment:${id}:${dueDate}`, entrySource: "recurring" });
        scheduledPaymentRecords.push({ id: ids.recordId, user_id: userId, scheduled_payment_id: id, transaction_id: ids.transactionId, occurrence_date: dueDate, payment_date: dueDate, amount_centavos: centavos(spec.amount), source: "auto", version: 1, deleted: false });
        continue;
      }
      if (dueDate > addDays(today, -3)) continue;
      const recordId = randomUUID();
      const paymentDate = [start, addDays(dueDate, -Math.floor(random() * 4))].sort().at(-1)!;
      const transaction = addTransaction({ date: paymentDate, type: "expense", amount: spec.spread ? noisy(spec.amount, spec.spread) : centavos(spec.amount), slug: spec.slug, source: accountIds.bank, merchant: spec.name, mutationId: `scheduled-payment:${id}:record:${recordId}` });
      scheduledPaymentRecords.push({ id: recordId, user_id: userId, scheduled_payment_id: id, transaction_id: transaction.id, occurrence_date: dueDate, payment_date: paymentDate, amount_centavos: transaction.amount_centavos, source: "manual", version: 1, deleted: false });
    }
  }

  // Non-credit-card debts: two still active, two paid off inside the window.
  const debtSpecs: { name: string; lender: string; presetKey: string; original: number; startingBalance: number; rateBps: number; method: string; payment: number; day: number; firstMonthIndex: number; openedOn: string; termMonths: number; presetData: Row; notes: string | null; allowsExtraPayments?: boolean; extraThisMonth?: number }[] = [
    { name: "Personal Loan", lender: "Bank", presetKey: "personal_loan", original: 120_000, startingBalance: 92_000, rateBps: 1_250, method: "diminishing_balance", payment: 4_500, day: 5, firstMonthIndex: 0, openedOn: monthDate(addMonths(start, -8), 5), termMonths: 36, presetData: { personalLoan: { purpose: "Home improvements" } }, notes: "Consistent monthly payments.", allowsExtraPayments: true, extraThisMonth: SURPLUS_DEMO.extraLoanPayment },
    { name: "Motorcycle Loan", lender: "Finance", presetKey: "auto_loan", original: 190_000, startingBalance: 190_000, rateBps: 890, method: "diminishing_balance", payment: 6_800, day: 20, firstMonthIndex: 1, openedOn: monthDate(start, 20), termMonths: 36, allowsExtraPayments: true, presetData: { autoLoan: { vehicleDescription: "Commuter motorcycle", vehiclePurchasePriceCentavos: centavos(240_000), downpaymentCentavos: centavos(50_000), financedPrincipalCentavos: centavos(190_000) } }, notes: null },
    { name: "Refrigerator Installment", lender: "Abenson", presetKey: "custom_debt", original: 24_000, startingBalance: 24_000, rateBps: 0, method: "no_interest", payment: 3_000, day: 28, firstMonthIndex: 0, openedOn: monthDate(addMonths(start, -1), 28), termMonths: 8, presetData: { customDebt: { providerCalculatedInterest: false } }, notes: "0% store installment." },
    { name: "SSS Salary Loan", lender: "SSS", presetKey: "salary_loan", original: 20_000, startingBalance: 20_000, rateBps: 1_000, method: "flat_add_on", payment: 2_000, day: 15, firstMonthIndex: 0, openedOn: monthDate(addMonths(start, -1), 15), termMonths: 11, presetData: { salaryLoan: { provider: "sss", linkedIncomeSourceId: incomeSourceIds.salary, repaymentMethod: "manual_payment", deductionAmountCentavos: null, deductionSchedule: null } }, notes: null },
  ];
  const debtAccounts: Row[] = [];
  const debtPayments: Row[] = [];
  const debtReservations: (Reservation & { debtAccountId: string })[] = [];
  for (const spec of debtSpecs) {
    const id = randomUUID();
    const payment = centavos(spec.payment);
    // Flat add-on interest is fixed per payment: the term's total interest spread evenly.
    const flatInterest = spec.method === "flat_add_on" ? Math.round((spec.termMonths * payment - centavos(spec.original)) / spec.termMonths) : 0;
    let balance = centavos(spec.startingBalance);
    let lastPaymentDate: string | null = null;
    for (const [index, month] of months.entries()) {
      if (index < spec.firstMonthIndex || balance <= 0) continue;
      const dueDate = monthDate(month, spec.day);
      const interest = spec.method === "diminishing_balance" ? Math.round(balance * spec.rateBps / 10_000 / 12) : flatInterest;
      // A payment that would leave less than a peso settles the rounding remainder instead of leaving a tiny final payment.
      const principal = balance - (payment - interest) < centavos(1) ? balance : payment - interest;
      debtReservations.push({ debtAccountId: id, monthIndex: index, amountCentavos: principal + interest, dueDate });
      if (!inWindow(dueDate)) continue;
      const paymentId = randomUUID();
      const transaction = addTransaction({ date: dueDate, type: "expense", amount: principal + interest, source: accountIds.bank, merchant: spec.lender, notes: `${spec.name} payment`, mutationId: `debt-payment:${paymentId}` });
      debtPayments.push({ id: paymentId, debt_account_id: id, user_id: userId, transaction_id: transaction.id, source: "transaction", payment_date: dueDate, amount_centavos: principal + interest, principal_centavos: principal, interest_centavos: interest, notes: null, metadata: marker, version: 1, deleted: false });
      balance -= principal;
      lastPaymentDate = dueDate;
      // A payment above the plan's required payment counts toward this month's debt surplus.
      if (month !== currentMonth || !spec.extraThisMonth || balance <= 0) continue;
      const extra = Math.min(balance, centavos(spec.extraThisMonth));
      const extraId = randomUUID();
      const extraTransaction = addTransaction({ date: dueDate, type: "expense", amount: extra, source: accountIds.bank, merchant: spec.lender, notes: `${spec.name} extra payment`, mutationId: `debt-payment:${extraId}` });
      debtPayments.push({ id: extraId, debt_account_id: id, user_id: userId, transaction_id: extraTransaction.id, source: "transaction", payment_date: dueDate, amount_centavos: extra, principal_centavos: extra, interest_centavos: 0, notes: "Extra payment from the plan's debt surplus", metadata: marker, version: 1, deleted: false });
      balance -= extra;
    }
    const paidOff = balance === 0;
    const remainingPayments = Math.ceil(balance / Math.max(1, payment - Math.round(balance * spec.rateBps / 10_000 / 12)));
    debtAccounts.push({
      id, user_id: userId, linked_account_id: accountIds.bank, name: spec.name, lender_name: spec.lender, preset_key: spec.presetKey,
      status: paidOff ? "paid_off" : "active", paid_off_at: paidOff ? manilaNoon(lastPaymentDate!) : null,
      original_balance_centavos: centavos(spec.original), current_balance_centavos: balance, annual_interest_rate_bps: spec.rateBps,
      minimum_payment_centavos: payment, allows_extra_payments: spec.allowsExtraPayments ?? false, due_day_of_month: spec.day, opened_on: spec.openedOn, payment_frequency: "monthly", payment_schedule: {},
      next_due_date: paidOff ? null : nextMonthlyDate(today, spec.day),
      target_payoff_date: paidOff ? lastPaymentDate : monthDate(addMonths(currentMonth, remainingPayments), spec.day),
      interest_period: spec.rateBps === 0 ? "none" : "annual", interest_method: spec.method,
      preset_data: { startDate: spec.openedOn, feesCentavos: 0, penaltyInfo: null, termMonths: spec.termMonths, ...spec.presetData },
      notes: spec.notes, metadata: marker, version: 1, deleted: false,
    });
  }

  // Everyday wallet spending and top-ups from the payroll account.
  const walletSpending: { slug: string; merchants: string[]; pesos: number; spread: number; days: number[] | "weekdays" }[] = [
    { slug: "food_groceries", merchants: ["SM Supermarket", "Puregold", "Robinsons Supermarket"], pesos: 1_400, spread: 0.25, days: [3, 9, 14, 20, 27] },
    { slug: "food_fresh_produce", merchants: ["Palengke"], pesos: 450, spread: 0.3, days: [6, 17, 24] },
    { slug: "transport_public", merchants: ["MRT and jeepney fares"], pesos: 90, spread: 0.3, days: "weekdays" },
    { slug: "transport_ride_hailing", merchants: ["Grab"], pesos: 280, spread: 0.3, days: [8, 19] },
    { slug: "restaurants_cafes", merchants: ["Local cafe", "Starbucks"], pesos: 220, spread: 0.3, days: [4, 11, 18, 25] },
    { slug: "restaurants_fast_food", merchants: ["Jollibee", "McDonald's", "Mang Inasal"], pesos: 260, spread: 0.25, days: [7, 13, 21, 28] },
    { slug: "restaurants_street_food", merchants: ["Street food stall"], pesos: 90, spread: 0.4, days: [2, 10, 16, 23] },
    { slug: "misc_personal_care", merchants: ["Watsons"], pesos: 550, spread: 0.3, days: [12] },
    { slug: "household_cleaning_supplies", merchants: ["Puregold"], pesos: 400, spread: 0.25, days: [15] },
  ];
  for (const month of months) {
    for (const day of [1, 16]) {
      const date = monthDate(month, day);
      if (inWindow(date)) addTransaction({ date, type: "transfer", amount: centavos(2_000), source: accountIds.bank, destination: accountIds.wallet, notes: "Wallet top-up" });
    }
    for (const spec of walletSpending) {
      const dates = spec.days === "weekdays"
        ? daysOfMonth(month).filter((date) => ![0, 6].includes(new Date(toTime(date)).getUTCDay()))
        : spec.days.map((day) => monthDate(month, day));
      for (const date of dates.filter(inWindow)) {
        addTransaction({ date, type: "expense", amount: noisy(spec.pesos, spec.spread), slug: spec.slug, source: accountIds.wallet, merchant: spec.merchants[Math.floor(random() * spec.merchants.length)] });
      }
    }
  }

  // Credit cards: thirteen billing cycles each, ending with the open one. Statement balances carry unpaid amounts with a 3% finance charge.
  const cardSpecs = [
    { id: accountIds.rewardsCard, name: "Rewards Visa", issuer: "Bank", limit: 120_000, cutoffDay: 15, minimumPayEvery: 0, holidayPurchase: { slug: "clothing_childrens", merchants: ["SM Department Store"], pesos: 6_500, count: 1 }, purchases: [
      { slug: "transport_fuel", merchants: ["Petron", "Shell"], pesos: 450, count: 4 },
      { slug: "clothing_accessories", merchants: ["Shopee"], pesos: 1_500, count: 1 },
      { slug: "restaurants_casual_dining", merchants: ["Dinner out"], pesos: 1_200, count: 2 },
      { slug: "recreation_cinema", merchants: ["SM Cinema"], pesos: 600, count: 1 },
    ] },
    { id: accountIds.cashbackCard, name: "Cashback Mastercard", issuer: "Credit", limit: 50_000, cutoffDay: 25, minimumPayEvery: 4, holidayPurchase: null, purchases: [
      { slug: "restaurants_delivery", merchants: ["GrabFood", "foodpanda"], pesos: 450, count: 4 },
      { slug: "household_kitchenware", merchants: ["Lazada"], pesos: 900, count: 1 },
      { slug: "health_medicines", merchants: ["Mercury Drug"], pesos: 700, count: 1 },
      { slug: "food_groceries", merchants: ["S&R Membership Shopping"], pesos: 2_200, count: 1 },
    ] },
  ];
  const creditCardDetails: Row[] = [];
  const creditCardCycles: Row[] = [];
  const creditCardTransactions: Row[] = [];
  const creditCardStatements: Row[] = [];
  const creditCardPayments: Row[] = [];
  const availableCreditAdjustments: SeedData["availableCreditAdjustments"] = [];
  const statementReservations: (Reservation & { statementId: string })[] = [];
  const cardBalances: Record<string, number> = {};
  const cardOpenedOn: Record<string, string> = {};
  for (const card of cardSpecs) {
    const currentCutoff = monthDate(currentMonth, card.cutoffDay) >= today ? monthDate(currentMonth, card.cutoffDay) : monthDate(addMonths(currentMonth, 1), card.cutoffDay);
    const cycles = Array.from({ length: CARD_CYCLES }, (_, index) => {
      const cutoff = monthDate(addMonths(monthStartOf(currentCutoff), index - CARD_CYCLES + 1), card.cutoffDay);
      return { id: randomUUID(), start: addDays(monthDate(addMonths(monthStartOf(cutoff), -1), card.cutoffDay), 1), cutoff };
    });
    const cardPurchases: Transaction[] = [];
    let purchasedTotal = 0;
    let paidTotal = 0;
    let carried = 0;
    let financeCharges = 0;
    for (const [cycleIndex, cycle] of cycles.entries()) {
      const from = [cycle.start, start].sort().at(-1)!;
      const to = [cycle.cutoff, today].sort()[0];
      let cyclePurchases = 0;
      const purchases = from > to ? [] : [...card.purchases, ...(card.holidayPurchase && cycle.cutoff.slice(5, 7) === "12" ? [card.holidayPurchase] : [])];
      for (const purchase of purchases) {
        for (let count = 0; count < purchase.count; count += 1) {
          const date = addDays(from, Math.floor(random() * ((toTime(to) - toTime(from)) / DAY_MS + 1)));
          const transaction = addTransaction({ date, type: "expense", amount: noisy(purchase.pesos, 0.3), slug: purchase.slug, source: card.id, merchant: purchase.merchants[Math.floor(random() * purchase.merchants.length)], extra: { credit_card_posting_date: date } });
          creditCardTransactions.push({ transaction_id: transaction.id, user_id: userId, account_id: card.id, cycle_id: cycle.id, purchase_type: "regular", installment_id: null, client_mutation_id: transaction.client_mutation_id, applied_credit_centavos: 0, version: 1, deleted: false });
          cardPurchases.push(transaction);
          cyclePurchases += transaction.amount_centavos;
        }
      }
      purchasedTotal += cyclePurchases;
      const statementDate = addDays(cycle.cutoff, 2);
      const closed = statementDate <= today;
      creditCardCycles.push({ id: cycle.id, user_id: userId, account_id: card.id, cycle_start_date: cycle.start, cutoff_date: cycle.cutoff, statement_date: closed ? statementDate : null, version: 1, deleted: false });
      if (!closed) continue;
      const financeCharge = Math.round(carried * 0.03);
      financeCharges += financeCharge;
      const balance = cyclePurchases + carried + financeCharge;
      const minimumDue = Math.min(balance, Math.max(centavos(500), Math.round(balance * 0.03)));
      const statementId = randomUUID();
      const dueDate = addDays(statementDate, 20);
      creditCardStatements.push({ id: statementId, user_id: userId, cycle_id: cycle.id, statement_date: statementDate, statement_balance_centavos: balance, minimum_due_centavos: minimumDue, finance_charge_centavos: financeCharge, due_date: dueDate, authoritative: true, version: 1, deleted: false });
      const statementMonth = monthIndexOf(dueDate);
      if (statementMonth >= 0 && balance > 0) statementReservations.push({ statementId, monthIndex: statementMonth, amountCentavos: balance, dueDate });
      const paymentDate = addDays(dueDate, -2);
      if (balance === 0 || paymentDate > today) {
        carried = balance;
        continue;
      }
      const amount = card.minimumPayEvery && cycleIndex % card.minimumPayEvery === 2 ? minimumDue : balance;
      const paymentId = randomUUID();
      const mutationId = `credit-card-payment:${paymentId}`;
      const transaction = addTransaction({ date: paymentDate, type: "expense", amount, source: accountIds.bank, merchant: `${card.name} payment`, mutationId });
      creditCardPayments.push({ id: paymentId, user_id: userId, cycle_id: cycle.id, statement_id: statementId, transaction_id: transaction.id, amount_centavos: amount, payment_date: paymentDate, source_account_id: accountIds.bank, notes: null, issuer_recognized: false, client_mutation_id: mutationId, version: 1, deleted: false });
      paidTotal += amount;
      carried = balance - amount;
    }
    const outstanding = Math.max(0, purchasedTotal + financeCharges - paidTotal);
    cardBalances[card.id] = -outstanding;
    creditCardDetails.push({ account_id: card.id, user_id: userId, issuer: card.issuer, credit_limit_centavos: centavos(card.limit), cutoff_day: card.cutoffDay, statement_day: card.cutoffDay + 2, alert_threshold_percent: 80, version: 1, deleted: false });
    let unreserved = Math.min(outstanding, centavos(card.limit));
    for (const purchase of [...cardPurchases].reverse()) {
      if (unreserved === 0) break;
      const reduction = Math.min(unreserved, purchase.amount_centavos - 1);
      availableCreditAdjustments.push({ transactionId: purchase.id, insertAmountCentavos: purchase.amount_centavos - reduction, amountCentavos: purchase.amount_centavos });
      unreserved -= reduction;
    }
    cardOpenedOn[card.id] = cycles[0].start;
  }

  transactions.sort((left, right) => left.transaction_date.localeCompare(right.transaction_date));
  if (transactions.length < 1_000) throw new Error(`Generator produced ${transactions.length} transactions; at least 1000 are required`);

  // The ledger replays chronologically (income before spending on the same day) so no cash account ever dips below zero.
  const balances = { ...openingBalances };
  const typeOrder = { income: 0, transfer: 1, expense: 2 };
  for (const transaction of [...transactions].sort((left, right) => left.transaction_date.localeCompare(right.transaction_date) || typeOrder[left.transaction_type] - typeOrder[right.transaction_type])) {
    for (const [accountId, sign] of [[transaction.source_account_id, -1], [transaction.destination_account_id, 1]] as const) {
      if (!accountId || !(accountId in balances)) continue;
      balances[accountId] += sign * transaction.amount_centavos;
      if (balances[accountId] < 0) throw new Error(`Generated data overdraws an account on ${transaction.transaction_date}; change the seed or generator.`);
    }
  }

  const accountRow = (id: string, name: string, kind: string, institution: string, sortOrder: number, openedOn: string, includeInDashboard = true) => ({
    id, user_id: userId, name, kind, opening_balance_centavos: openingBalances[id] ?? 0, current_balance_centavos: balances[id] ?? cardBalances[id],
    include_in_dashboard_balance: includeInDashboard, institution_name: institution, opened_on: openedOn, sort_order: sortOrder, metadata: marker, deleted: false, version: 1,
  });
  const accounts = [
    accountRow(accountIds.bank, "Payroll Account", "bank", "Bank", 1, start),
    accountRow(accountIds.wallet, "Daily Wallet", "e_wallet", "Wallet", 2, start),
    accountRow(accountIds.rewardsCard, "Rewards Visa", "credit_card", "Bank", 3, cardOpenedOn[accountIds.rewardsCard], false),
    accountRow(accountIds.cashbackCard, "Cashback Mastercard", "credit_card", "Credit", 4, cardOpenedOn[accountIds.cashbackCard], false),
    accountRow(accountIds.savings, "Goal Savings", "savings", "Bank", 5, start),
  ];
  const contributionDay = 25;
  const savingsGoals = goalSpecs.map((goal) => ({
    id: randomUUID(), user_id: userId, linked_account_id: accountIds.savings, name: goal.name, is_emergency_fund: goal.isEmergencyFund,
    target_amount_centavos: centavos(goal.target), starting_amount_centavos: centavos(goal.saved), target_date: monthDate(addMonths(currentMonth, goal.months), contributionDay),
    priority: goal.priority, status: "active", planned_contribution_amount_centavos: centavos(goal.monthly), contribution_frequency: "monthly", contribution_interval_count: 1,
    contribution_day_of_month: contributionDay, next_contribution_date: nextMonthlyDate(today, contributionDay), notes: goal.notes, metadata: marker, version: 1, deleted: false,
  }));

  // One accepted plan per month. Each plan's forecast tracks what was actually spent that month, give or take a few percent.
  const allocationSpecs: { slug: string; rule: "FIXED" | "MINIMUM" | "FLEXIBLE"; pesos: number }[] = [
    { slug: "housing_rent", rule: "FIXED", pesos: 13_500 }, { slug: "housing_electricity", rule: "MINIMUM", pesos: 2_800 },
    { slug: "housing_water", rule: "FIXED", pesos: 600 }, { slug: "housing_internet", rule: "FIXED", pesos: 1_699 },
    { slug: "communication_mobile_postpaid", rule: "FIXED", pesos: 999 }, { slug: "recreation_streaming", rule: "FIXED", pesos: 549 },
    { slug: "misc_other", rule: "FIXED", pesos: 5_000 }, { slug: "education_tuition", rule: "FIXED", pesos: 2_000 },
    { slug: "food_groceries", rule: "FLEXIBLE", pesos: 9_000 }, { slug: "food_fresh_produce", rule: "FLEXIBLE", pesos: 1_400 },
    { slug: "transport_public", rule: "FLEXIBLE", pesos: 2_000 }, { slug: "transport_ride_hailing", rule: "FLEXIBLE", pesos: 600 },
    { slug: "transport_fuel", rule: "FLEXIBLE", pesos: 1_800 }, { slug: "restaurants_cafes", rule: "FLEXIBLE", pesos: 900 },
    { slug: "restaurants_fast_food", rule: "FLEXIBLE", pesos: 1_000 }, { slug: "restaurants_delivery", rule: "FLEXIBLE", pesos: 1_800 },
  ];
  const spentByMonthAndSubcategory = new Map<string, number>();
  for (const transaction of transactions) {
    if (transaction.transaction_type !== "expense" || !transaction.subcategory_id) continue;
    const key = `${monthStartOf(transaction.transaction_date)}:${transaction.subcategory_id}`;
    spentByMonthAndSubcategory.set(key, (spentByMonthAndSubcategory.get(key) ?? 0) + transaction.amount_centavos);
  }
  const financialPlans: Row[] = [];
  const planForecastPoints: Row[] = [];
  const planAllocations: Row[] = [];
  const planDebtReservations: Row[] = [];
  const planSavingsReservations: Row[] = [];
  for (const [index, month] of months.entries()) {
    const planId = randomUUID();
    const allocations = allocationSpecs.map((spec) => {
      const subcategoryId = subcategory(spec.slug);
      const actual = spentByMonthAndSubcategory.get(`${month}:${subcategoryId}`) ?? 0;
      const forecast = month === currentMonth || actual === 0 ? centavos(spec.pesos) : wholePesos(actual * (0.92 + random() * 0.16));
      const allocated = spec.rule === "FIXED" ? centavos(spec.pesos) : spec.rule === "MINIMUM" ? forecast : wholePesos(forecast * 0.95);
      const floor = spec.rule === "FIXED" ? allocated : spec.rule === "MINIMUM" ? wholePesos(centavos(spec.pesos) * 0.9) : wholePesos(allocated * 0.6);
      return { id: randomUUID(), plan_id: planId, category_id: null, subcategory_id: subcategoryId, allocation_rule: spec.rule, allocated_amount_centavos: allocated, floor_amount_centavos: Math.min(floor, allocated), ceiling_amount_centavos: spec.rule === "FIXED" ? allocated : null, forecast_amount_centavos: forecast, subcategory_weight_bps: null };
    });
    const debts = [
      ...debtReservations.filter((reservation) => reservation.monthIndex === index)
        .map((reservation) => ({ id: randomUUID(), plan_id: planId, debt_account_id: reservation.debtAccountId, credit_card_statement_id: null, amount_centavos: reservation.amountCentavos, due_date: reservation.dueDate })),
      ...statementReservations.filter((reservation) => reservation.monthIndex === index)
        .map((reservation) => ({ id: randomUUID(), plan_id: planId, debt_account_id: null, credit_card_statement_id: reservation.statementId, amount_centavos: reservation.amountCentavos, due_date: reservation.dueDate })),
    ];
    const savings = month === currentMonth
      ? savingsGoals.map((goal) => ({ id: randomUUID(), plan_id: planId, savings_goal_id: goal.id, amount_centavos: goal.planned_contribution_amount_centavos, due_date: monthDate(month, contributionDay) }))
      : [];
    const availableFunds = centavos(32_500 * 2 + 9_000 + (month.slice(5, 7) === "12" ? 32_500 : 0) + (month === currentMonth ? SURPLUS_DEMO.bonus : 0));
    const sum = (rows: { amount_centavos?: number; allocated_amount_centavos?: number }[]) => rows.reduce((total, row) => total + (row.allocated_amount_centavos ?? row.amount_centavos ?? 0), 0);
    const required = sum(allocations) + sum(debts) + sum(savings);
    const remaining = availableFunds - required;
    const { savingsSurplus, debtSurplus } = planSurplus(remaining, month === currentMonth);
    financialPlans.push({
      id: planId, user_id: userId, period_start: month, period_end: addDays(addMonths(month, 1), -1), status: "accepted",
      forecast_month: month.slice(0, 7), forecast_total_centavos: allocations.reduce((total, allocation) => total + allocation.forecast_amount_centavos, 0),
      forecast_model_version: seedForecastModelVersion, forecast_generated_at: `${addDays(month, -2)}T09:00:00+08:00`, forecast_quality: index < 2 ? "COLD_START" : "PERSONALIZED",
      available_funds_centavos: availableFunds, required_funds_centavos: required, shortfall_centavos: Math.max(0, -remaining),
      savings_surplus_centavos: savingsSurplus, debt_surplus_centavos: debtSurplus, version: 1, deleted: false,
    });
    planForecastPoints.push(...allocations.map((allocation) => ({ plan_id: planId, category_key: allocation.subcategory_id, amount_centavos: allocation.forecast_amount_centavos })));
    planAllocations.push(...allocations);
    planDebtReservations.push(...debts);
    planSavingsReservations.push(...savings);
  }

  return {
    accounts, savingsGoals, savingsGoalActivities: [], incomeSources, debtAccounts, creditCardDetails, creditCardCycles, transactions, creditCardTransactions,
    creditCardStatements, creditCardPayments, debtPayments, scheduledPayments, scheduledPaymentRecords,
    financialPlans, planForecastPoints, planAllocations, planDebtReservations, planSavingsReservations, availableCreditAdjustments,
    summary: { start, end: today, endingBalances: Object.fromEntries(accounts.map((account) => [account.name, account.current_balance_centavos as number])) },
  };
}
