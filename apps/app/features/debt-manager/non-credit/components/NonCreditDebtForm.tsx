import React, { useEffect, useState, type ReactNode } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { Briefcase, Car, PencilSimple, Stack, Storefront, User, type IconProps } from "phosphor-react-native";
import { Banner, FieldError, FormCard, MonthEndNote, Note, SectionLabel, Switch, TextField, styles as ui, v4, v4Font } from "../../../../components/BudgieForm";
import { DateField } from "../../../../components/DateField";
import { upcomingDueDate } from "../../forecast/helpers/debtForecast";
import { manilaToday } from "../../../../lib/dates";
import {
  createDebtAccount,
  updateDebtAccount,
  type CreateDebtAccountInput,
  type DebtAccount,
  type DebtTypePreset,
  type InterestMethod,
  type InterestRatePeriod,
  type PaymentFrequency,
  type SalaryLoanProvider,
} from "../../../../local-db/repositories/debts/debtAccounts";
import { listIncomeSources, type IncomeSource } from "../../../../local-db/repositories/foundations/financialFoundations";
import {
  DEBT_PLACEHOLDERS,
  DEBT_TYPE_OPTIONS,
  INTEREST_METHOD_OPTIONS,
  INTEREST_PERIOD_OPTIONS,
  PAYMENT_FREQUENCY_OPTIONS,
  SALARY_LOAN_PROVIDER_OPTIONS,
} from "../../debtTypes";

const PERSONAL_PURPOSES = ["Emergency", "Medical", "Education", "Home Improvement", "Debt Consolidation", "Personal Purchase", "Other"];
const MULTIPURPOSE_PURPOSES = ["Home Improvement", "Education", "Medical", "Livelihood", "Emergency", "Utility", "Other"];
const BUSINESS_PURPOSES = ["Working Capital", "Inventory", "Equipment", "Expansion", "Operating Expenses", "Emergency", "Other"];
const REPAYMENT_METHODS = [{ value: "payroll_deduction", label: "Payroll Deduction" }, { value: "automatic_debit", label: "Automatic Debit" }, { value: "manual_payment", label: "Manual Payment" }, { value: "other", label: "Other" }] as const;
const WEEKDAY_OPTIONS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((label, index) => ({ value: String(index), label }));
// These frequencies are entered as a weekday or days of the month; the rest still pick their next payment date.
const ENTERED_DAY_FREQUENCIES: PaymentFrequency[] = ["daily", "weekly", "semi_monthly", "monthly"];
const DEBT_TYPE_ICONS: Record<DebtTypePreset, React.ComponentType<IconProps>> = {
  personal_loan: User, salary_loan: Briefcase, multipurpose_loan: Stack, business_loan: Storefront, auto_loan: Car, custom_debt: PencilSimple,
};

type NonCreditDebtFormProps = {
  userId: string;
  deviceId: string;
  debt?: DebtAccount | null;
  onCancel: () => void;
  onSaved: (debt: DebtAccount) => void;
};

type Option<T extends string> = { value: T; label: string };

function isDayOfMonth(day: number) {
  return Number.isInteger(day) && day >= 1 && day <= 31;
}

function pesos(value: string) {
  const parsed = Number(value.replace(/,/g, ""));
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : Number.NaN;
}

const php = <Text style={ui.fieldSuffix}>₱</Text>;

function Field({ label, placeholder, value, onChangeText, numeric = false, prefix, suffix, error }: {
  label: string;
  placeholder: string;
  value: string;
  onChangeText: (value: string) => void;
  numeric?: boolean;
  prefix?: ReactNode;
  suffix?: string;
  error?: string;
}) {
  return (
    <View>
      <TextField label={label} accessibilityLabel={label} placeholder={placeholder} value={value} onChangeText={onChangeText} keyboardType={numeric ? "decimal-pad" : "default"} icon={prefix} suffix={suffix} error={Boolean(error)} />
      {error ? <FieldError>{error}</FieldError> : null}
    </View>
  );
}

// Static styles only: the function form of Pressable's style is dropped on device, which left selected chips white-on-cream.
function Choices<T extends string>({ label, values, selected, onChange, error }: { label?: string; values: readonly Option<T>[]; selected: T; onChange: (value: T) => void; error?: string }) {
  return (
    <View>
      {label ? <SectionLabel>{label}</SectionLabel> : null}
      <View accessibilityRole="radiogroup" style={ui.chips}>
        {values.map((item) => {
          const active = selected === item.value;
          return (
            <Pressable
              key={item.value}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`Select ${item.label}`}
              onPress={() => onChange(item.value)}
              style={[ui.chip, active ? ui.chipOn : null]}
            >
              <Text style={[ui.chipText, active ? ui.chipTextOn : null]}>{item.label}</Text>
            </Pressable>
          );
        })}
      </View>
      {error ? <FieldError>{error}</FieldError> : null}
    </View>
  );
}

function DebtTypeGrid({ selected, onChange }: { selected: DebtTypePreset; onChange: (value: DebtTypePreset) => void }) {
  return (
    <View accessibilityRole="radiogroup" style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      {DEBT_TYPE_OPTIONS.map((item) => {
        const active = selected === item.value;
        const Icon = DEBT_TYPE_ICONS[item.value];
        return (
          <Pressable
            key={item.value}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            accessibilityLabel={`Select ${item.label}`}
            onPress={() => onChange(item.value)}
            style={[ui.option, { flexBasis: "47%", flexGrow: 1, paddingVertical: 11, paddingHorizontal: 12, gap: 9 }, active ? ui.optionOn : null]}
          >
            <Icon color={active ? v4.brandMid : v4.mut} size={18} weight={active ? "fill" : "regular"} />
            <Text style={{ flex: 1, fontFamily: v4Font, fontSize: 12.5, fontWeight: active ? "700" : "600", color: active ? v4.brand : v4.ink2 }}>{item.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function NonCreditDebtForm({ userId, deviceId, debt, onCancel, onSaved }: NonCreditDebtFormProps) {
  const [type, setType] = useState<DebtTypePreset>(debt?.type ?? "personal_loan");
  const [name, setName] = useState(debt?.name ?? "");
  const [lender, setLender] = useState(debt?.lenderName ?? "");
  const [original, setOriginal] = useState(debt ? String(debt.originalBalanceCentavos / 100) : "");
  const [balance, setBalance] = useState(debt ? String(debt.currentBalanceCentavos / 100) : "");
  const [payment, setPayment] = useState(debt ? String(debt.minimumPaymentCentavos / 100) : "");
  const [allowsExtraPayments, setAllowsExtraPayments] = useState(debt?.allowsExtraPayments ?? false);
  // Interest is anchored to the start date; new debts start on the day they are added.
  const [startDate] = useState(() => debt?.typeSpecific.startDate || manilaToday());
  const [nextDueDate, setNextDueDate] = useState(debt?.nextDueDate ?? "");
  const [targetPayoffDate, setTargetPayoffDate] = useState(debt?.targetPayoffDate ?? "");
  const [maturityDate, setMaturityDate] = useState(debt?.maturityDate ?? "");
  const [rate, setRate] = useState(debt ? String(debt.annualInterestRateBps / 100) : "0");
  const [frequency, setFrequency] = useState<PaymentFrequency>(debt?.paymentFrequency ?? "monthly");
  const [semiMonthlyFirstDay, setSemiMonthlyFirstDay] = useState(debt?.paymentSchedule.semiMonthlyDays?.[0]?.toString() ?? "");
  const [semiMonthlySecondDay, setSemiMonthlySecondDay] = useState(debt?.paymentSchedule.semiMonthlyDays?.[1]?.toString() ?? "");
  const [dueDay, setDueDay] = useState(debt?.paymentFrequency !== "monthly" ? "" : debt.paymentSchedule.dayOfMonth ? String(debt.paymentSchedule.dayOfMonth) : debt.nextDueDate ? String(Number(debt.nextDueDate.slice(8, 10))) : "");
  const [dayOfWeek, setDayOfWeek] = useState<number | null>(debt?.paymentFrequency === "weekly" && debt.nextDueDate ? new Date(`${debt.nextDueDate}T00:00:00Z`).getUTCDay() : null);
  // An edit keeps its stored next due date until the schedule itself changes.
  const [scheduleEdited, setScheduleEdited] = useState(!debt);
  const [customIntervalDays, setCustomIntervalDays] = useState(debt?.paymentSchedule.customIntervalDays?.toString() ?? "");
  const [period, setPeriod] = useState<InterestRatePeriod>(debt?.interestPeriod ?? "annual");
  const [method, setMethod] = useState<InterestMethod>(debt?.interestMethod ?? "no_interest");
  const [purpose, setPurpose] = useState(debt?.typeSpecific.personalLoan?.purpose ?? "");
  const [incomeSource, setIncomeSource] = useState(debt?.typeSpecific.salaryLoan?.linkedIncomeSourceId ?? "");
  const [salaryLoanProvider, setSalaryLoanProvider] = useState<SalaryLoanProvider | "">(debt?.typeSpecific.salaryLoan?.provider ?? "");
  const [repaymentMethod, setRepaymentMethod] = useState(debt?.typeSpecific.salaryLoan?.repaymentMethod ?? "manual_payment");
  const [deduction, setDeduction] = useState(debt?.typeSpecific.salaryLoan?.deductionAmountCentavos ? String(debt.typeSpecific.salaryLoan.deductionAmountCentavos / 100) : "");
  const [deductionSchedule, setDeductionSchedule] = useState<PaymentFrequency>(debt?.typeSpecific.salaryLoan?.deductionSchedule ?? "monthly");
  const [businessSource, setBusinessSource] = useState(debt?.typeSpecific.businessLoan?.linkedBusinessOrIncomeSourceId ?? "");
  const [vehicle, setVehicle] = useState(debt?.typeSpecific.autoLoan?.vehicleDescription ?? "");
  const [vehiclePrice, setVehiclePrice] = useState(debt?.typeSpecific.autoLoan?.vehiclePurchasePriceCentavos == null ? "" : String(debt.typeSpecific.autoLoan.vehiclePurchasePriceCentavos / 100));
  const [downpayment, setDownpayment] = useState(debt?.typeSpecific.autoLoan?.downpaymentCentavos == null ? "" : String(debt.typeSpecific.autoLoan.downpaymentCentavos / 100));
  const [fees, setFees] = useState(debt ? String(debt.typeSpecific.feesCentavos / 100) : "");
  const [penaltyInfo, setPenaltyInfo] = useState(debt?.typeSpecific.penaltyInfo ?? "");
  const [termMonths, setTermMonths] = useState(debt?.typeSpecific.termMonths?.toString() ?? "");
  const [notes, setNotes] = useState(debt?.notes ?? "");
  const [incomeSources, setIncomeSources] = useState<IncomeSource[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => { listIncomeSources(userId).then(setIncomeSources).catch(() => setIncomeSources([])); }, [userId]);
  useEffect(() => { setErrors({}); }, [balance, customIntervalDays, dayOfWeek, dueDay, fees, frequency, lender, name, nextDueDate, original, payment, rate, semiMonthlyFirstDay, semiMonthlySecondDay, targetPayoffDate, termMonths]);

  async function save() {
    const semiMonthlyDays: [number, number] = [Number(semiMonthlyFirstDay), Number(semiMonthlySecondDay)];
    const enteredDays = scheduleEdited && ENTERED_DAY_FREQUENCIES.includes(frequency);
    const dueDate = enteredDays ? upcomingDueDate(frequency, { dayOfWeek, dayOfMonth: Number(dueDay), semiMonthlyDays }, manilaToday()) ?? "" : nextDueDate;
    // A quarterly or yearly debt keeps the day of its picked date (a stored day survives an untouched edit), so Jan 31 falls on Apr 30 and then Jul 31.
    const pickedDay = dueDate && (nextDueDate !== debt?.nextDueDate || !debt?.paymentSchedule.dayOfMonth) ? Number(dueDate.slice(8, 10)) : debt?.paymentSchedule.dayOfMonth;
    const dayOfMonth = frequency === "monthly" ? Number(dueDay) : frequency === "quarterly" || frequency === "yearly" ? pickedDay : undefined;
    const input: CreateDebtAccountInput = {
      type, name, lenderName: lender || null, originalBalanceCentavos: pesos(original), currentBalanceCentavos: pesos(balance), annualInterestRateBps: Math.round(Number(rate) * 100), minimumPaymentCentavos: pesos(payment), allowsExtraPayments, paymentFrequency: frequency, paymentSchedule: { semiMonthlyDays: frequency === "semi_monthly" ? semiMonthlyDays : undefined, customIntervalDays: frequency === "custom" ? Number(customIntervalDays) : undefined, dayOfMonth }, startDate, nextDueDate: dueDate, maturityDate: maturityDate || null, targetPayoffDate, interestPeriod: period, interestMethod: method, notes: notes || null,
      typeSpecific: {
        startDate, feesCentavos: fees ? pesos(fees) : 0, penaltyInfo: penaltyInfo || null, termMonths: termMonths ? Number(termMonths) : null,
        personalLoan: type === "personal_loan" ? { purpose: purpose || null } : undefined,
        salaryLoan: type === "salary_loan" ? { provider: salaryLoanProvider || null, linkedIncomeSourceId: incomeSource || null, repaymentMethod, deductionAmountCentavos: deduction ? pesos(deduction) : null, deductionSchedule } : undefined,
        multipurposeLoan: type === "multipurpose_loan" ? { purposes: purpose ? [purpose] : [] } : undefined,
        businessLoan: type === "business_loan" ? { linkedBusinessOrIncomeSourceId: businessSource || null, purpose: purpose || null } : undefined,
        autoLoan: type === "auto_loan" ? { vehicleDescription: vehicle || null, vehiclePurchasePriceCentavos: vehiclePrice ? pesos(vehiclePrice) : null, downpaymentCentavos: downpayment ? pesos(downpayment) : null, financedPrincipalCentavos: vehiclePrice ? pesos(vehiclePrice) - pesos(downpayment || "0") : null } : undefined,
      },
    };

    const nextErrors: Record<string, string> = {};
    if (!name.trim()) nextErrors.name = "Debt name is required.";
    if (type !== "custom_debt" && !lender.trim()) nextErrors.lender = "Lender or provider is required.";
    if (type === "salary_loan" && !salaryLoanProvider) nextErrors.salaryLoanProvider = "Choose the salary-loan provider.";
    if (type === "salary_loan" && !incomeSource) nextErrors.incomeSource = "Choose the income source that is deducted.";
    const salaryDeduction = input.typeSpecific.salaryLoan?.deductionAmountCentavos;
    if (type === "salary_loan" && repaymentMethod === "payroll_deduction" && (!deduction || typeof salaryDeduction !== "number" || !Number.isFinite(salaryDeduction) || salaryDeduction <= 0)) nextErrors.deduction = "Payroll deduction must be positive.";
    if (!Number.isFinite(input.originalBalanceCentavos) || input.originalBalanceCentavos <= 0) nextErrors.original = "Original amount must be positive.";
    if (!Number.isFinite(input.currentBalanceCentavos) || input.currentBalanceCentavos < 0) nextErrors.balance = "Current balance must be non-negative.";
    if (!Number.isFinite(input.minimumPaymentCentavos) || input.minimumPaymentCentavos <= 0) nextErrors.payment = "Minimum payment must be positive.";
    if (!Number.isFinite(input.annualInterestRateBps) || input.annualInterestRateBps < 0) nextErrors.rate = "Interest rate must be a non-negative number.";
    if (method === "no_interest" && input.annualInterestRateBps !== 0) nextErrors.rate = "No-interest debts must use a zero interest rate.";
    if (!Number.isFinite(input.typeSpecific.feesCentavos) || input.typeSpecific.feesCentavos < 0) nextErrors.fees = "Fees must be non-negative.";
    if (termMonths && (!Number.isSafeInteger(input.typeSpecific.termMonths) || input.typeSpecific.termMonths! <= 0)) nextErrors.termMonths = "Term must be a positive whole number of months.";
    if (enteredDays && frequency === "weekly" && dayOfWeek === null) nextErrors.dayOfWeek = "Choose the day this debt is due.";
    if (frequency === "monthly" && !isDayOfMonth(Number(dueDay))) nextErrors.dueDay = "Enter a due day from 1 to 31.";
    if (!targetPayoffDate) nextErrors.targetPayoffDate = "Target payoff date is required.";
    if (targetPayoffDate && dueDate && targetPayoffDate < dueDate) nextErrors.targetPayoffDate = "Target payoff date must be on or after the next payment date.";
    // Same rules as income paydays: days past the 28th become the 28th in February, so Date 1 must stay before it.
    const [firstDay, secondDay] = semiMonthlyDays;
    if (frequency === "semi_monthly" && (!isDayOfMonth(firstDay) || !isDayOfMonth(secondDay))) nextErrors.semiMonthlyDays = "Enter Date 1 and Date 2, each from 1 to 31.";
    else if (frequency === "semi_monthly" && firstDay >= secondDay) nextErrors.semiMonthlyDays = "Date 1 must come before Date 2.";
    else if (frequency === "semi_monthly" && firstDay >= Math.min(secondDay, 28)) nextErrors.semiMonthlyDays = "Date 1 must be the 27th or earlier when Date 2 is after the 28th, so February still has two payments.";
    if (!dueDate && !nextErrors.dayOfWeek && !nextErrors.dueDay && !nextErrors.semiMonthlyDays) nextErrors.nextDueDate = "Next payment date is required.";
    if (frequency === "custom" && (!Number.isSafeInteger(input.paymentSchedule.customIntervalDays) || input.paymentSchedule.customIntervalDays! <= 0)) nextErrors.customIntervalDays = "Custom interval must be a positive whole number of days.";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      setMessage("Some debt details are not valid. Check the highlighted fields and try again.");
      return;
    }

    setErrors({});
    setSaving(true);
    try {
      const result = debt ? await updateDebtAccount(userId, deviceId, debt.id, input) : await createDebtAccount(userId, deviceId, input);
      onSaved(result.debt);
    } catch {
      setMessage("Your debt information could not be loaded or saved. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }


  function chooseMethod(next: InterestMethod) {
    setMethod(next);
    // The rate field is hidden for no-interest debts, so clear it rather than fail validation on a value the user cannot see.
    if (next === "no_interest") setRate("0");
  }

  function renderTypeFields() {
    const incomeOptions = incomeSources.map((source) => ({ value: source.id, label: source.name }));
    const purposeOptions = (type === "business_loan" ? BUSINESS_PURPOSES : type === "multipurpose_loan" ? MULTIPURPOSE_PURPOSES : PERSONAL_PURPOSES).map((value) => ({ value, label: value }));
    if (type === "salary_loan") return (
      <>
        <Choices label="PROVIDER" values={SALARY_LOAN_PROVIDER_OPTIONS} selected={salaryLoanProvider} onChange={setSalaryLoanProvider} error={errors.salaryLoanProvider} />
        {incomeOptions.length
          ? <Choices label="DEDUCTED FROM" values={incomeOptions} selected={incomeSource} onChange={setIncomeSource} error={errors.incomeSource} />
          : <View><Banner tone="warn">Add an income source before creating a salary loan.</Banner>{errors.incomeSource ? <FieldError>{errors.incomeSource}</FieldError> : null}</View>}
        <Choices label="REPAYMENT METHOD" values={REPAYMENT_METHODS} selected={repaymentMethod} onChange={setRepaymentMethod} />
        {repaymentMethod === "payroll_deduction" ? (
          <>
            <View style={{ gap: 6 }}>
              <Field label="Payroll deduction" placeholder={DEBT_PLACEHOLDERS.salaryDeductionAmount} value={deduction} onChangeText={setDeduction} numeric prefix={php} error={errors.deduction} />
              <Note>Subtracted from the selected income source after its gross income is calculated.</Note>
            </View>
            <Choices label="DEDUCTION SCHEDULE" values={PAYMENT_FREQUENCY_OPTIONS.filter((option) => option.value !== "yearly")} selected={deductionSchedule} onChange={setDeductionSchedule} />
          </>
        ) : null}
      </>
    );
    if (type === "auto_loan") return (
      <>
        <Field label="Vehicle" placeholder={DEBT_PLACEHOLDERS.autoVehicleDescription} value={vehicle} onChangeText={setVehicle} />
        <Field label="Purchase price" placeholder={DEBT_PLACEHOLDERS.autoPurchasePrice} value={vehiclePrice} onChangeText={setVehiclePrice} numeric prefix={php} />
        <Field label="Downpayment" placeholder={DEBT_PLACEHOLDERS.autoDownpayment} value={downpayment} onChangeText={setDownpayment} numeric prefix={php} />
      </>
    );
    if (type === "business_loan") return (
      <>
        {incomeOptions.length
          ? <Choices label="LINKED INCOME SOURCE" values={incomeOptions} selected={businessSource} onChange={setBusinessSource} />
          : <Banner tone="info">Add an income source to link it to this business loan.</Banner>}
        <Choices label="PURPOSE" values={purposeOptions} selected={purpose} onChange={setPurpose} />
      </>
    );
    return <Choices label="PURPOSE" values={purposeOptions} selected={purpose} onChange={setPurpose} />;
  }

  const typeLabel = DEBT_TYPE_OPTIONS.find((option) => option.value === type)?.label ?? "Loan";

  return (
    <ScrollView contentContainerStyle={{ gap: 12, paddingBottom: 36 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <View style={{ gap: 3, paddingHorizontal: 2, paddingTop: 2 }}>
        <Text style={{ color: v4.ink, fontFamily: v4Font, fontSize: 20, fontWeight: "800", letterSpacing: -0.3 }}>{debt ? "Edit debt" : "Add a debt"}</Text>
        <Text style={{ color: v4.mut, fontFamily: v4Font, fontSize: 12.5 }}>Loans, installments, and anything that isn't a credit card.</Text>
      </View>

      <FormCard title="Type">
        <DebtTypeGrid selected={type} onChange={setType} />
        <Field label="Name" placeholder={DEBT_PLACEHOLDERS.debtName} value={name} onChangeText={setName} error={errors.name} />
        <Field label={`Lender${type === "custom_debt" ? " (optional)" : ""}`} placeholder={DEBT_PLACEHOLDERS.lenderName} value={lender} onChangeText={setLender} error={errors.lender} />
      </FormCard>

      <FormCard title="Balance">
        <Field label="Original amount" placeholder={DEBT_PLACEHOLDERS.originalAmount} value={original} onChangeText={setOriginal} numeric prefix={php} error={errors.original} />
        <Field label="Current balance" placeholder={DEBT_PLACEHOLDERS.currentBalance} value={balance} onChangeText={setBalance} numeric prefix={php} error={errors.balance} />
        <Field label="Minimum payment" placeholder={DEBT_PLACEHOLDERS.paymentAmount} value={payment} onChangeText={setPayment} numeric prefix={php} error={errors.payment} />
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12, borderTopWidth: 1, borderTopColor: v4.hairline, paddingTop: 12 }}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={ui.cardTitle}>Allow extra payments</Text>
            <Note>Put spare money toward this debt when you have it.</Note>
          </View>
          <Switch accessibilityLabel="Allow extra payments" value={allowsExtraPayments} onToggle={() => setAllowsExtraPayments((value) => !value)} />
        </View>
      </FormCard>

      <FormCard title="Interest">
        <Choices values={INTEREST_METHOD_OPTIONS} selected={method} onChange={chooseMethod} />
        {method !== "no_interest" ? (
          <>
            <Field label="Rate" placeholder={DEBT_PLACEHOLDERS.interestRate} value={rate} onChangeText={setRate} numeric suffix="%" error={errors.rate} />
            <Choices label="RATE PERIOD" values={INTEREST_PERIOD_OPTIONS} selected={period} onChange={setPeriod} />
          </>
        ) : errors.rate ? <FieldError>{errors.rate}</FieldError> : null}
        <Field label="Fees" placeholder="Enter fees" value={fees} onChangeText={setFees} numeric prefix={php} error={errors.fees} />
        <Field label="Penalties" placeholder="Add penalty information" value={penaltyInfo} onChangeText={setPenaltyInfo} />
      </FormCard>

      <FormCard title="Schedule">
        <Choices label="FREQUENCY" values={PAYMENT_FREQUENCY_OPTIONS} selected={frequency} onChange={(value) => { setFrequency(value); setScheduleEdited(true); }} />
        {frequency === "weekly" ? <Choices label="DUE DAY" values={WEEKDAY_OPTIONS} selected={dayOfWeek === null ? "" : String(dayOfWeek)} onChange={(value) => { setDayOfWeek(Number(value)); setScheduleEdited(true); }} error={errors.dayOfWeek} /> : null}
        {frequency === "monthly" ? (
          <View>
            <TextField label="Due day" accessibilityLabel="Due day" placeholder="15" value={dueDay} onChangeText={(value) => { setDueDay(value); setScheduleEdited(true); }} keyboardType="number-pad" maxLength={2} error={Boolean(errors.dueDay)} />
            {errors.dueDay ? <FieldError>{errors.dueDay}</FieldError> : null}
          </View>
        ) : null}
        {frequency === "semi_monthly" ? (
          <>
            <TextField label="Date 1" accessibilityLabel="First payment day" placeholder="15" value={semiMonthlyFirstDay} onChangeText={(value) => { setSemiMonthlyFirstDay(value); setScheduleEdited(true); }} keyboardType="number-pad" maxLength={2} error={Boolean(errors.semiMonthlyDays)} />
            <View>
              <TextField label="Date 2" accessibilityLabel="Second payment day" placeholder="30" value={semiMonthlySecondDay} onChangeText={(value) => { setSemiMonthlySecondDay(value); setScheduleEdited(true); }} keyboardType="number-pad" maxLength={2} error={Boolean(errors.semiMonthlyDays)} />
              {errors.semiMonthlyDays ? <FieldError>{errors.semiMonthlyDays}</FieldError> : null}
            </View>
          </>
        ) : null}
        {ENTERED_DAY_FREQUENCIES.includes(frequency) ? null : <DateField label="Next payment" placeholder={DEBT_PLACEHOLDERS.nextPaymentDate} value={nextDueDate || null} onChange={setNextDueDate} error={errors.nextDueDate} />}
        <MonthEndNote days={frequency === "monthly" ? [dueDay] : frequency === "semi_monthly" ? [semiMonthlyFirstDay, semiMonthlySecondDay] : frequency === "quarterly" || frequency === "yearly" ? [nextDueDate.slice(8, 10)] : []} />
        {frequency === "custom" ? <Field label="Every" placeholder="Enter number of days" value={customIntervalDays} onChangeText={setCustomIntervalDays} numeric suffix="days" error={errors.customIntervalDays} /> : null}
        <Field label="Term" placeholder={DEBT_PLACEHOLDERS.debtSpecificTerm} value={termMonths} onChangeText={setTermMonths} numeric suffix="months" error={errors.termMonths} />
        <DateField label="Maturity date (optional)" placeholder={DEBT_PLACEHOLDERS.maturityDate} value={maturityDate || null} onChange={setMaturityDate} />
        <DateField label="Pay off by" placeholder={DEBT_PLACEHOLDERS.targetPayoffDate} value={targetPayoffDate || null} onChange={setTargetPayoffDate} error={errors.targetPayoffDate} />
      </FormCard>

      {type !== "custom_debt" ? <FormCard title={`${typeLabel} details`}>{renderTypeFields()}</FormCard> : null}

      <FormCard title="Notes">
        <TextField label="Anything to remember" accessibilityLabel="Notes" placeholder={DEBT_PLACEHOLDERS.notes} value={notes} onChangeText={setNotes} multiline />
      </FormCard>

      {message ? <Banner tone="error">{message}</Banner> : null}

      <View style={{ flexDirection: "row", gap: 10, paddingTop: 4 }}>
        <Pressable accessibilityRole="button" disabled={saving} onPress={onCancel} style={[ui.button, ui.buttonGhost, { flex: 1 }, saving ? ui.dimmed : null]}>
          <Text style={[ui.buttonText, ui.buttonGhostText]}>Cancel</Text>
        </Pressable>
        <Pressable accessibilityRole="button" disabled={saving} onPress={() => save().catch(() => {})} style={[ui.button, { flex: 2 }, saving ? ui.dimmed : null]}>
          <Text style={ui.buttonText}>{saving ? "Saving..." : debt ? "Save changes" : "Save debt"}</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}
