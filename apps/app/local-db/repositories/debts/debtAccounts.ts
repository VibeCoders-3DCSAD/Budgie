import * as SQLite from "expo-sqlite";
import { enqueueOperation, LocalDbError } from "../../helpers";
import type { SyncOperation } from "../../types";
import { randomUUID } from "../../uuid";
import { getDb, now } from "../helpers/db";
import { manilaToday } from "../../../lib/dates";

export const DEBT_TYPES = ["personal_loan", "salary_loan", "multipurpose_loan", "business_loan", "auto_loan", "custom_debt"] as const;
export const DEBT_STATUSES = ["active", "archived", "deleted", "paid_off"] as const;
const INTEREST_METHODS: InterestMethod[] = ["flat_add_on", "diminishing_balance", "provider_calculated", "no_interest"];
const INTEREST_PERIODS: InterestRatePeriod[] = ["annual", "monthly", "per_term", "none"];
const PAYMENT_FREQUENCIES: PaymentFrequency[] = ["daily", "weekly", "biweekly", "semi_monthly", "monthly", "quarterly", "yearly", "custom"];

export type DebtTypePreset = typeof DEBT_TYPES[number];
export type DebtAccountStatus = typeof DEBT_STATUSES[number];
export type DebtListVisibility = "active" | "finished" | "archived" | "deleted" | "all";
export type DebtProgressStatus = "ahead" | "on_schedule" | "behind" | "finished" | "no_payments";
export type DebtRepaymentStatus = "advanced" | "on_track" | "underpaid" | "not_in_schedule";
export type InterestMethod = "flat_add_on" | "diminishing_balance" | "provider_calculated" | "no_interest";
export type InterestRatePeriod = "annual" | "monthly" | "per_term" | "none";
export type PaymentFrequency = "daily" | "weekly" | "biweekly" | "semi_monthly" | "monthly" | "quarterly" | "yearly" | "custom";
export type SalaryLoanProvider = "sss" | "gsis" | "pag_ibig" | "other";
// dayOfMonth is the chosen due day for monthly, quarterly and yearly debts; months shorter than it use their last day.
export type DebtPaymentSchedule = { semiMonthlyDays?: [number, number]; customIntervalDays?: number; dayOfMonth?: number };

export type DebtPresetData = {
  startDate: string | null;
  feesCentavos: number;
  penaltyInfo: string | null;
  termMonths: number | null;
  personalLoan?: { purpose: string | null };
  salaryLoan?: { provider: SalaryLoanProvider | null; linkedIncomeSourceId: string | null; repaymentMethod: "payroll_deduction" | "automatic_debit" | "manual_payment" | "other" | null; deductionAmountCentavos: number | null; deductionSchedule: PaymentFrequency | null };
  multipurposeLoan?: { purposes: string[] };
  businessLoan?: { linkedBusinessOrIncomeSourceId: string | null; purpose: string | null };
  autoLoan?: { vehicleDescription: string | null; vehiclePurchasePriceCentavos: number | null; downpaymentCentavos: number | null; financedPrincipalCentavos: number | null };
  customDebt?: { providerCalculatedInterest: boolean };
};

export type DebtAccount = {
  id: string; name: string; lenderName: string | null; type: DebtTypePreset; status: DebtAccountStatus;
  progress: DebtProgressStatus; originalBalanceCentavos: number; currentBalanceCentavos: number;
  annualInterestRateBps: number; minimumPaymentCentavos: number; allowsExtraPayments?: boolean; paymentFrequency: PaymentFrequency;
  nextDueDate: string | null; maturityDate: string | null; targetPayoffDate: string | null; paymentSchedule: DebtPaymentSchedule;
  interestPeriod: InterestRatePeriod | null; interestMethod: InterestMethod | null; notes: string | null;
  typeSpecific: DebtPresetData; hasPaymentHistory: boolean; archivedAt: string | null;
  paidOffAt: string | null; version: number;
};

export type DebtRepaymentForecast = {
  status: DebtRepaymentStatus;
  estimatedPayoffDate: string | null;
};

export type CreateDebtAccountInput = {
  type: DebtTypePreset; name: string; lenderName: string | null; linkedAccountId?: string | null;
  originalBalanceCentavos: number; currentBalanceCentavos: number; annualInterestRateBps: number;
  minimumPaymentCentavos: number; allowsExtraPayments?: boolean; paymentFrequency: PaymentFrequency; paymentSchedule: DebtPaymentSchedule; startDate: string; nextDueDate: string;
  maturityDate?: string | null; targetPayoffDate?: string | null; interestPeriod: InterestRatePeriod | null;
  interestMethod: InterestMethod | null; notes?: string | null; typeSpecific: DebtPresetData;
};
export type UpdateDebtAccountInput = Partial<CreateDebtAccountInput>;

type DebtAccountRow = {
  id: string; user_id: string; linked_account_id: string | null; name: string; lender_name: string | null;
  preset_key: string; status: string; original_balance_centavos: number; current_balance_centavos: number;
  annual_interest_rate_bps: number; minimum_payment_centavos: number; allows_extra_payments: number; payment_frequency: string;
  next_due_date: string | null; maturity_date: string | null; target_payoff_date: string | null;
  interest_period: string | null; interest_method: string | null; preset_data: string; payment_schedule: string; notes: string | null;
  paid_off_at: string | null; archived_at: string | null; version: number; deleted: number;
  has_payment_history?: number;
};

function parsePresetData(raw: string | null): DebtPresetData {
  const fallback: DebtPresetData = { startDate: null, feesCentavos: 0, penaltyInfo: null, termMonths: null };
  if (!raw) return fallback;
  try { return { ...fallback, ...(JSON.parse(raw) as Partial<DebtPresetData>) }; } catch { return fallback; }
}
function parsePaymentSchedule(raw: string | null): DebtPaymentSchedule {
  if (!raw) return {};
  try { return JSON.parse(raw) as DebtPaymentSchedule; } catch { return {}; }
}
function normalizeType(value: string): DebtTypePreset { return DEBT_TYPES.includes(value as DebtTypePreset) ? value as DebtTypePreset : "custom_debt"; }
function normalizeStatus(value: string, deleted: number): DebtAccountStatus { return deleted === 1 ? "deleted" : DEBT_STATUSES.includes(value as DebtAccountStatus) ? value as DebtAccountStatus : "active"; }

export function deriveDebtProgress(debt: Pick<DebtAccount, "currentBalanceCentavos" | "minimumPaymentCentavos" | "nextDueDate" | "status">): DebtProgressStatus {
  if (debt.status === "paid_off" || debt.currentBalanceCentavos === 0) return "finished";
  if (!debt.nextDueDate || debt.minimumPaymentCentavos <= 0) return "no_payments";
  return debt.nextDueDate < manilaToday() ? "behind" : "on_schedule";
}

function mapDebt(row: DebtAccountRow): DebtAccount {
  const debt: DebtAccount = {
    id: row.id, name: row.name, lenderName: row.lender_name, type: normalizeType(row.preset_key),
    status: normalizeStatus(row.status, row.deleted), progress: "no_payments", originalBalanceCentavos: row.original_balance_centavos,
    currentBalanceCentavos: row.current_balance_centavos, annualInterestRateBps: row.annual_interest_rate_bps,
    minimumPaymentCentavos: row.minimum_payment_centavos, allowsExtraPayments: row.allows_extra_payments === 1, paymentFrequency: row.payment_frequency as PaymentFrequency,
    nextDueDate: row.next_due_date, maturityDate: row.maturity_date, targetPayoffDate: row.target_payoff_date, paymentSchedule: parsePaymentSchedule(row.payment_schedule),
    interestPeriod: row.interest_period as InterestRatePeriod | null, interestMethod: row.interest_method as InterestMethod | null,
    notes: row.notes, typeSpecific: parsePresetData(row.preset_data), hasPaymentHistory: row.has_payment_history === 1,
    archivedAt: row.archived_at, paidOffAt: row.paid_off_at, version: row.version,
  };
  return { ...debt, progress: deriveDebtProgress(debt) };
}

const SELECT_DEBTS = `SELECT da.*, EXISTS(
  SELECT 1 FROM debt_payments dp WHERE dp.debt_account_id = da.id AND dp.user_id = da.user_id AND dp.deleted = 0
) AS has_payment_history FROM debt_accounts da`;

export async function listDebtAccounts(userId: string, visibility: DebtListVisibility = "active"): Promise<DebtAccount[]> {
  const db = await getDb();
  let sql = `${SELECT_DEBTS} WHERE da.user_id = ?`;
  const params: SQLite.SQLiteBindValue[] = [userId];
  if (visibility === "active" || visibility === "archived") { sql += " AND da.deleted = 0 AND da.status = ?"; params.push(visibility); }
  if (visibility === "finished") { sql += " AND da.deleted = 0 AND da.status = 'paid_off'"; }
  if (visibility === "deleted") sql += " AND da.deleted = 1";
  if (visibility === "all") sql += " AND (da.deleted = 0 OR da.status = 'deleted')";
  sql += " ORDER BY da.updated_at DESC, da.name COLLATE NOCASE ASC";
  return (await db.getAllAsync<DebtAccountRow>(sql, ...params)).map(mapDebt);
}

export async function getDebtAccount(userId: string, id: string): Promise<DebtAccount | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<DebtAccountRow>(`${SELECT_DEBTS} WHERE da.user_id = ? AND da.id = ? AND da.deleted = 0`, userId, id);
  return row ? mapDebt(row) : null;
}

function assertInteger(value: number, field: string, positive = false) {
  if (!Number.isSafeInteger(value) || value < 0 || (positive && value === 0)) throw new LocalDbError("VALIDATION_ERROR", `${field} must be a ${positive ? "positive" : "non-negative"} whole number`);
}
function assertDate(value: string | null | undefined, field: string, required: boolean) {
  if (!value && required) throw new LocalDbError("VALIDATION_ERROR", `${field} is required`);
  const date = value ? new Date(`${value}T00:00:00Z`) : null;
  if (value && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !date || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value)) throw new LocalDbError("VALIDATION_ERROR", `${field} must be a valid YYYY-MM-DD date`);
}
function validate(input: CreateDebtAccountInput): CreateDebtAccountInput {
  const name = input.name.trim();
  if (!name) throw new LocalDbError("VALIDATION_ERROR", "debt name is required");
  if (!DEBT_TYPES.includes(input.type)) throw new LocalDbError("VALIDATION_ERROR", "debt type is required");
  if (input.type !== "custom_debt" && !input.lenderName?.trim()) throw new LocalDbError("VALIDATION_ERROR", "lender or provider is required");
  for (const [value, field, positive] of [[input.originalBalanceCentavos, "originalBalanceCentavos", true], [input.currentBalanceCentavos, "currentBalanceCentavos", false], [input.annualInterestRateBps, "annualInterestRateBps", false], [input.minimumPaymentCentavos, "minimumPaymentCentavos", true]] as const) assertInteger(value, field, positive);
  if (input.allowsExtraPayments !== undefined && typeof input.allowsExtraPayments !== "boolean") throw new LocalDbError("VALIDATION_ERROR", "allowsExtraPayments must be a boolean");
  if (input.currentBalanceCentavos > input.originalBalanceCentavos) throw new LocalDbError("VALIDATION_ERROR", "current balance cannot exceed original balance");
  assertDate(input.startDate, "start date", true); assertDate(input.nextDueDate, "first or next payment date", true);
  assertDate(input.maturityDate, "maturity date", false); assertDate(input.targetPayoffDate, "target payoff date", false);
  if (!input.targetPayoffDate) throw new LocalDbError("VALIDATION_ERROR", "target payoff date is required");
  if (input.targetPayoffDate < input.nextDueDate) throw new LocalDbError("VALIDATION_ERROR", "target payoff date must be on or after the next payment date");
  if (!input.interestMethod) throw new LocalDbError("VALIDATION_ERROR", "interest method is required");
  if (!INTEREST_METHODS.includes(input.interestMethod)) throw new LocalDbError("VALIDATION_ERROR", "interest method is invalid");
  if (!input.interestPeriod || !INTEREST_PERIODS.includes(input.interestPeriod)) throw new LocalDbError("VALIDATION_ERROR", "interest period is invalid");
  if (!PAYMENT_FREQUENCIES.includes(input.paymentFrequency)) throw new LocalDbError("VALIDATION_ERROR", "payment frequency is invalid");
  const { customIntervalDays, semiMonthlyDays, dayOfMonth } = input.paymentSchedule;
  const isDayOfMonth = (day: number | undefined) => Number.isSafeInteger(day) && day! >= 1 && day! <= 31;
  if (input.paymentFrequency === "custom" && (!Number.isSafeInteger(customIntervalDays) || !(customIntervalDays && customIntervalDays > 0))) throw new LocalDbError("VALIDATION_ERROR", "custom payment interval must be a positive whole number of days");
  if (dayOfMonth !== undefined && !isDayOfMonth(dayOfMonth)) throw new LocalDbError("VALIDATION_ERROR", "payment day of month must be from 1 to 31");
  // Days past the 28th become the 28th in February, so the earlier day must stay before it to keep two payments that month.
  if (input.paymentFrequency === "semi_monthly" && semiMonthlyDays && (!semiMonthlyDays.every(isDayOfMonth) || Math.min(...semiMonthlyDays) >= Math.min(Math.max(...semiMonthlyDays), 28))) throw new LocalDbError("VALIDATION_ERROR", "semi-monthly payment days must be two days from 1 to 31 that stay different in February");
  if (input.interestMethod === "no_interest" && input.annualInterestRateBps !== 0) throw new LocalDbError("VALIDATION_ERROR", "no-interest debts must use a zero interest rate");
  assertInteger(input.typeSpecific.feesCentavos ?? 0, "feesCentavos");
  if (input.typeSpecific.termMonths != null) assertInteger(input.typeSpecific.termMonths, "termMonths", true);
  const salary = input.typeSpecific.salaryLoan;
  if (input.type === "salary_loan" && (!salary?.linkedIncomeSourceId || !salary.repaymentMethod)) throw new LocalDbError("VALIDATION_ERROR", "salary loan requires a linked income source and repayment method");
  if (input.type === "salary_loan" && !["sss", "gsis", "pag_ibig", "other"].includes(salary?.provider ?? "")) throw new LocalDbError("VALIDATION_ERROR", "salary loan requires a valid provider");
  if (input.type === "salary_loan" && salary?.repaymentMethod === "payroll_deduction" && (!salary.deductionAmountCentavos || !salary.deductionSchedule)) throw new LocalDbError("VALIDATION_ERROR", "salary loan payroll deduction requires deduction amount and deduction schedule");
  const auto = input.typeSpecific.autoLoan;
  if (input.type === "auto_loan" && !auto?.vehicleDescription?.trim()) throw new LocalDbError("VALIDATION_ERROR", "auto loan requires a vehicle description");
  if (auto?.vehiclePurchasePriceCentavos != null) assertInteger(auto.vehiclePurchasePriceCentavos, "vehiclePurchasePriceCentavos");
  if (auto?.downpaymentCentavos != null) assertInteger(auto.downpaymentCentavos, "downpaymentCentavos");
  if (auto?.vehiclePurchasePriceCentavos != null && auto.downpaymentCentavos != null && auto.downpaymentCentavos > auto.vehiclePurchasePriceCentavos) throw new LocalDbError("VALIDATION_ERROR", "auto loan downpayment cannot exceed vehicle purchase price");
  return { ...input, name, lenderName: input.lenderName?.trim() || null };
}
function payload(input: CreateDebtAccountInput, status: DebtAccountStatus = "active"): Record<string, unknown> {
  return { linked_account_id: input.linkedAccountId ?? null, name: input.name.trim(), lender_name: input.lenderName?.trim() ?? null, preset_key: input.type, status, original_balance_centavos: input.originalBalanceCentavos, current_balance_centavos: input.currentBalanceCentavos, annual_interest_rate_bps: input.annualInterestRateBps, minimum_payment_centavos: input.minimumPaymentCentavos, allows_extra_payments: input.allowsExtraPayments ?? false, payment_frequency: input.paymentFrequency, payment_schedule: input.paymentSchedule, next_due_date: input.nextDueDate, maturity_date: input.maturityDate ?? null, target_payoff_date: input.targetPayoffDate ?? null, interest_period: input.interestPeriod, interest_method: input.interestMethod, preset_data: { ...input.typeSpecific, startDate: input.startDate }, notes: input.notes ?? null };
}
async function readOwnedDebt(db: SQLite.SQLiteDatabase, userId: string, id: string) {
  const row = await db.getFirstAsync<DebtAccountRow>("SELECT * FROM debt_accounts WHERE user_id = ? AND id = ? AND deleted = 0", userId, id);
  if (!row) throw new LocalDbError("NOT_FOUND", "Debt not found");
  return row;
}
async function assertAccessibleLinkedAccount(db: SQLite.SQLiteDatabase, userId: string, accountId: string | null | undefined) {
  if (!accountId) return;
  const account = await db.getFirstAsync<{ id: string }>("SELECT id FROM financial_accounts WHERE id = ? AND user_id = ? AND deleted = 0", accountId, userId);
  if (!account) throw new LocalDbError("VALIDATION_ERROR", "linkedAccountId does not reference an accessible account");
}
async function assertAccessibleIncomeSource(db: SQLite.SQLiteDatabase, userId: string, sourceId: string | null | undefined, field: string) {
  if (!sourceId) return;
  const source = await db.getFirstAsync<{ id: string }>("SELECT id FROM income_sources WHERE id = ? AND user_id = ? AND deleted = 0", sourceId, userId);
  if (!source) throw new LocalDbError("VALIDATION_ERROR", `${field} does not reference an accessible income source`);
}
async function assertAccessibleDebtReferences(db: SQLite.SQLiteDatabase, userId: string, input: CreateDebtAccountInput) {
  await assertAccessibleLinkedAccount(db, userId, input.linkedAccountId);
  await assertAccessibleIncomeSource(db, userId, input.typeSpecific.salaryLoan?.linkedIncomeSourceId, "linked income source");
  await assertAccessibleIncomeSource(db, userId, input.typeSpecific.businessLoan?.linkedBusinessOrIncomeSourceId, "linked business or income source");
}
async function readResult(db: SQLite.SQLiteDatabase, userId: string, id: string) {
  const row = await db.getFirstAsync<DebtAccountRow>(`${SELECT_DEBTS} WHERE da.id = ? AND da.user_id = ?`, id, userId);
  if (!row) throw new LocalDbError("INTERNAL_ERROR", "Failed to read debt account");
  return mapDebt(row);
}

export async function createDebtAccount(userId: string, deviceId: string, input: CreateDebtAccountInput): Promise<{ debt: DebtAccount; operation: SyncOperation }> {
  const valid = validate(input); const db = await getDb(); const id = randomUUID(); const ts = now(); const data = payload(valid); let result!: { debt: DebtAccount; operation: SyncOperation };
  await db.withTransactionAsync(async () => {
    await assertAccessibleDebtReferences(db, userId, valid);
    await db.runAsync(`INSERT INTO debt_accounts (id, user_id, linked_account_id, name, lender_name, preset_key, status, original_balance_centavos, current_balance_centavos, annual_interest_rate_bps, minimum_payment_centavos, allows_extra_payments, payment_frequency, payment_schedule, next_due_date, maturity_date, target_payoff_date, interest_period, interest_method, preset_data, notes, version, deleted, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, ?, ?)`, id, userId, data.linked_account_id as string | null, data.name as string, data.lender_name as string | null, data.preset_key as string, data.status as string, data.original_balance_centavos as number, data.current_balance_centavos as number, data.annual_interest_rate_bps as number, data.minimum_payment_centavos as number, data.allows_extra_payments ? 1 : 0, data.payment_frequency as string, JSON.stringify(data.payment_schedule), data.next_due_date as string, data.maturity_date as string | null, data.target_payoff_date as string | null, data.interest_period as string | null, data.interest_method as string | null, JSON.stringify(data.preset_data), data.notes as string | null, ts, ts);
    const operation = await enqueueOperation(db, { userId, deviceId, entity: "debt_accounts", recordId: id, operationType: "create", baseVersion: null, changedFields: Object.keys(data), payload: data, failureMessage: `This debt "${valid.name}" could not be created.` });
    result = { debt: await readResult(db, userId, id), operation };
  });
  return result;
}

function inputFromRow(row: DebtAccountRow): CreateDebtAccountInput {
  const typeSpecific = parsePresetData(row.preset_data);
  return { type: normalizeType(row.preset_key), name: row.name, lenderName: row.lender_name, linkedAccountId: row.linked_account_id, originalBalanceCentavos: row.original_balance_centavos, currentBalanceCentavos: row.current_balance_centavos, annualInterestRateBps: row.annual_interest_rate_bps, minimumPaymentCentavos: row.minimum_payment_centavos, allowsExtraPayments: row.allows_extra_payments === 1, paymentFrequency: row.payment_frequency as PaymentFrequency, paymentSchedule: parsePaymentSchedule(row.payment_schedule), startDate: typeSpecific.startDate ?? "", nextDueDate: row.next_due_date ?? "", maturityDate: row.maturity_date, targetPayoffDate: row.target_payoff_date, interestPeriod: row.interest_period as InterestRatePeriod | null, interestMethod: row.interest_method as InterestMethod | null, notes: row.notes, typeSpecific };
}
export async function updateDebtAccount(userId: string, deviceId: string, id: string, input: UpdateDebtAccountInput): Promise<{ debt: DebtAccount; operation: SyncOperation }> {
  const db = await getDb(); let result!: { debt: DebtAccount; operation: SyncOperation };
  await db.withTransactionAsync(async () => {
    const current = await readOwnedDebt(db, userId, id); const merged = validate({ ...inputFromRow(current), ...input, typeSpecific: input.typeSpecific ?? inputFromRow(current).typeSpecific }); await assertAccessibleDebtReferences(db, userId, merged); const status = normalizeStatus(current.status, current.deleted); const next = payload(merged, status);
    const currentPayload = payload(inputFromRow(current), status); const changed = Object.keys(next).filter((key) => JSON.stringify(next[key]) !== JSON.stringify(currentPayload[key]));
    if (changed.length === 0) { result = { debt: await readResult(db, userId, id), operation: null as unknown as SyncOperation }; return; }
    const clauses = changed.map((field) => `${field} = ?`); const values = changed.map((field) => field === "preset_data" || field === "payment_schedule" ? JSON.stringify(next[field]) : next[field]) as SQLite.SQLiteBindValue[]; const ts = now();
    await db.runAsync(`UPDATE debt_accounts SET ${clauses.join(", ")}, version = version + 1, updated_at = ? WHERE id = ? AND user_id = ?`, ...values, ts, id, userId);
    const operation = await enqueueOperation(db, { userId, deviceId, entity: "debt_accounts", recordId: id, operationType: "update", baseVersion: current.version, changedFields: changed, payload: Object.fromEntries(changed.map((field) => [field, next[field]])), failureMessage: `This debt "${current.name}" could not be updated.` });
    result = { debt: await readResult(db, userId, id), operation };
  });
  return result;
}

export async function archiveDebtAccount(userId: string, deviceId: string, id: string): Promise<{ debt: DebtAccount; operation: SyncOperation }> {
  const db = await getDb(); let result!: { debt: DebtAccount; operation: SyncOperation };
  await db.withTransactionAsync(async () => { const current = await readOwnedDebt(db, userId, id); const ts = now(); await db.runAsync("UPDATE debt_accounts SET status = 'archived', archived_at = COALESCE(archived_at, ?), version = version + 1, updated_at = ? WHERE id = ? AND user_id = ?", ts, ts, id, userId); const operation = await enqueueOperation(db, { userId, deviceId, entity: "debt_accounts", recordId: id, operationType: "update", baseVersion: current.version, changedFields: ["status"], payload: { status: "archived" }, failureMessage: `This debt "${current.name}" could not be archived.` }); result = { debt: await readResult(db, userId, id), operation }; });
  return result;
}
export async function restoreDebtAccount(userId: string, deviceId: string, id: string): Promise<{ debt: DebtAccount; operation: SyncOperation }> {
  const db = await getDb(); let result!: { debt: DebtAccount; operation: SyncOperation };
  await db.withTransactionAsync(async () => { const current = await readOwnedDebt(db, userId, id); if (current.status !== "archived") throw new LocalDbError("VALIDATION_ERROR", "Only archived debts can be restored"); const ts = now(); await db.runAsync("UPDATE debt_accounts SET status = 'active', archived_at = NULL, version = version + 1, updated_at = ? WHERE id = ? AND user_id = ?", ts, id, userId); const operation = await enqueueOperation(db, { userId, deviceId, entity: "debt_accounts", recordId: id, operationType: "update", baseVersion: current.version, changedFields: ["status"], payload: { status: "active" }, failureMessage: `This debt "${current.name}" could not be restored.` }); result = { debt: await readResult(db, userId, id), operation }; });
  return result;
}
export async function markDebtAccountDeleted(userId: string, deviceId: string, id: string): Promise<{ operation: SyncOperation }> {
  const db = await getDb(); let result!: { operation: SyncOperation };
  await db.withTransactionAsync(async () => { const current = await readOwnedDebt(db, userId, id); const ts = now(); await db.runAsync("UPDATE debt_accounts SET status = 'deleted', deleted = 1, version = version + 1, updated_at = ? WHERE id = ? AND user_id = ?", ts, id, userId); result = { operation: await enqueueOperation(db, { userId, deviceId, entity: "debt_accounts", recordId: id, operationType: "delete", baseVersion: current.version, changedFields: [], payload: {}, failureMessage: `This debt "${current.name}" could not be deleted.` }) }; });
  return result;
}
