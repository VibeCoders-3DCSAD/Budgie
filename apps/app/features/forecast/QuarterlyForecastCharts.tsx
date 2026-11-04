import { useState, type ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import Svg, { Circle, Line, Path, Rect, Text as SvgText } from "react-native-svg";
import type { QuarterlyForecastPayload } from "./types";
import { SCHEDULED_PAYMENTS_CATEGORY } from "./scheduledForecast";
import { CalendarBlank, CaretDown, CaretUp, Check } from "phosphor-react-native";
import { v4, v4Font } from "../../components/BudgieForm";
import { ForecastCategoryPicker } from "./ForecastCategoryPicker";
import { manilaToday } from "../../lib/dates";
import { LEGACY_SEASON_LABELS, SEASON_PRESETS, normalizeCustomEvents, type SeasonalPreferences } from "@odin/spending-insights/seasons";
import { formatPeso } from "../../lib/format/money";
import { WithTermInfo } from "../../components/TermInfo";

const P = { brand: "#013220", ink: "#1B1C1A", muted: "#6B7A6F", line: "#D9E5DD", shell: "#F6FAF7", over: "#D9001F" };

const CHART_HEIGHT = 180;
const TOTAL_KEY = "__total";
// The right gutter fits half of the last centered quarter label ("Q3 2027"), so it is not clipped.
const PLOT = { top: 12, right: 28, bottom: 26, left: 52 };

// values holds each point's forecast and actual its recorded spending; null where a point has none.
type Series = { key: string; label: string; color: string; values: (number | null)[]; actual: (number | null)[] };
type CategoryAmount = { category: string; amountCentavos: number };
type Period = { totalCentavos: number; categories: CategoryAmount[] };
// A quarter (YYYYQn) or a month (YYYY-MM), with its actual spending or its forecast.
type Slot = { key: string; actual: Period | null; forecast: Period | null };
type Labels = { full: (key: string) => string; short: (key: string) => string; dates: (key: string) => string };

function compactPeso(centavos: number): string {
  const pesos = centavos / 100;
  if (pesos >= 1_000_000) return `₱${(pesos / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (pesos >= 1_000) return `₱${(pesos / 1_000).toFixed(1).replace(/\.0$/, "")}k`;
  return `₱${Math.round(pesos)}`;
}

// Everyday names for the HFCE expense groups.
const CATEGORY_NAMES: Record<string, string> = {
  alcohol_tobacco: "alcohol and cigarettes",
  billers_remittances: "Billers & Remittances",
  clothing_footwear: "clothes and shoes",
  communication: "load, phone, and internet",
  education: "school",
  food: "food and groceries",
  furnishings_household: "household items",
  health: "health and medicine",
  housing_water_utilities: "rent, water, and electricity",
  miscellaneous_goods_services: "other personal expenses",
  recreation_culture: "leisure and hobbies",
  restaurants_hotels: "eating out and hotels",
  transport: "transportation",
};

function categoryName(category: string): string {
  return CATEGORY_NAMES[category] ?? category.replaceAll("_", " ");
}

export function categoryLabel(category: string): string {
  const label = categoryName(category);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

const MONTH_RANGES = ["Jan–Mar", "Apr–Jun", "Jul–Sep", "Oct–Dec"];

const QUARTER_DATES = ["January 1 to March 31", "April 1 to June 30", "July 1 to September 30", "October 1 to December 31"];

function quarterDates(quarter: string): string {
  return `${QUARTER_DATES[Number(quarter.slice(5)) - 1]}, ${quarter.slice(0, 4)}`;
}

function monthRange(quarter: string): string {
  return `${MONTH_RANGES[Number(quarter.slice(5)) - 1]} ${quarter.slice(0, 4)}`;
}

function quarterLabel(quarter: string): string {
  return `${quarter.slice(4)} ${quarter.slice(0, 4)}`;
}

function shortQuarterLabel(quarter: string): string {
  return `${quarter.slice(4)} '${quarter.slice(2, 4)}`;
}

const QUARTER_LABELS: Labels = { full: quarterLabel, short: shortQuarterLabel, dates: quarterDates };

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function monthName(month: string): string {
  return MONTH_NAMES[Number(month.slice(5, 7)) - 1]!;
}

const shortMonthLabel = (month: string) => `${monthName(month).slice(0, 3)} '${month.slice(2, 4)}`;

const MONTH_LABELS: Labels = {
  full: shortMonthLabel,
  short: shortMonthLabel,
  dates: (month) => `${monthName(month)} ${month.slice(0, 4)}`,
};

// Forecast months that can be charted, starting with the current one.
const MONTHLY_FORECAST_MONTHS = 6;

// From six months of history odin-ml walks each month forward by HFCE, so the forecast is shown per month.
// Provisional histories forecast the same amount for every month of a quarter, so they stay quarterly.
export function monthlyForecast(forecast: QuarterlyForecastPayload, now = new Date()): NonNullable<QuarterlyForecastPayload["months"]> | null {
  if (forecast.baselineMethod !== "same_period_last_year" && forecast.baselineMethod !== "median_monthly") return null;
  // Months follow the Asia/Manila calendar.
  const first = manilaToday(now).slice(0, 7);
  const last = new Date(Date.UTC(Number(first.slice(0, 4)), Number(first.slice(5, 7)) - 1 + MONTHLY_FORECAST_MONTHS - 1, 1)).toISOString().slice(0, 7);
  const months = (forecast.months ?? []).filter((month) => month.month >= first && month.month <= last);
  return months.length ? months : null;
}

// One slot per period, in order; a period with both actual spending and a forecast shares its slot.
function mergeSlots(actual: [string, Period][], forecast: [string, Period][]): Slot[] {
  const actualByKey = new Map(actual);
  const forecastByKey = new Map(forecast);
  return [...new Set([...actualByKey.keys(), ...forecastByKey.keys()])].sort()
    .map((key) => ({ key, actual: actualByKey.get(key) ?? null, forecast: forecastByKey.get(key) ?? null }));
}

export type ForecastScale = "monthly" | "quarterly";
export type ForecastRange = "past" | "around" | "ahead";

// Each range charts six points: completed periods of actual spending, then forecast periods from the current one.
// The quarterly forecast reaches four quarters ahead, so its forward range keeps two past quarters.
const RANGE_POINTS: Record<ForecastScale, Record<ForecastRange, { past: number; next: number }>> = {
  monthly: { past: { past: 6, next: 0 }, around: { past: 3, next: 3 }, ahead: { past: 0, next: 6 } },
  quarterly: { past: { past: 6, next: 0 }, around: { past: 3, next: 3 }, ahead: { past: 2, next: 4 } },
};

// "Last 6 months", "Last 3 + next 3 months", "Next 6 months".
function rangeLabel({ past, next }: { past: number; next: number }, scale: ForecastScale): string {
  const unit = scale === "monthly" ? "months" : "quarters";
  if (!next) return `Last ${past} ${unit}`;
  return past ? `Last ${past} + next ${next} ${unit}` : `Next ${next} ${unit}`;
}

// Past this many points the axis labels every other point, counted from the first forecast point.
const FULL_AXIS_QUARTERS = 6;

function niceMax(value: number): number {
  if (value <= 0) return 100;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 2.5, 5, 10].find((candidate) => candidate * magnitude >= value)!;
  return step * magnitude;
}

// Every category stays selectable; only one series is displayed at a time.
export function categorySeries(forecast: QuarterlyForecastPayload): Series[] {
  return slotCategorySeries(mergeSlots([], forecast.quarters.map(({ quarter, ...period }) => [quarter, period])));
}

function slotCategorySeries(slots: Slot[]): Series[] {
  const totals = new Map<string, number>();
  for (const slot of slots) for (const period of [slot.actual, slot.forecast]) for (const point of period?.categories ?? []) totals.set(point.category, (totals.get(point.category) ?? 0) + point.amountCentavos);
  const ranked = [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([category]) => category);
  const amountFor = (period: Period | null, category: string) => period ? period.categories.find((point) => point.category === category)?.amountCentavos ?? 0 : null;
  return ranked.map((category) => ({ key: category, label: categoryLabel(category), color: P.brand, values: slots.map((slot) => amountFor(slot.forecast, category)), actual: slots.map((slot) => amountFor(slot.actual, category)) }));
}

// A month this share above the usual month is worth getting ready for.
const PEAK_CHANGE = 0.05;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

// The costliest forecast month against the usual one, with how to get ready: set money aside in the months
// before it, or spend less that month on the expense that rises the most. months starts with this month.
function peakMonthNote(months: [string, Period][]): string | null {
  const usual = median(months.map(([, period]) => period.totalCentavos));
  const peakIndex = months.reduce((highest, [, period], index) => period.totalCentavos > months[highest]![1].totalCentavos ? index : highest, 0);
  const [peakMonth, peak] = months[peakIndex]!;
  const extra = peak.totalCentavos - usual;
  if (usual <= 0 || extra / usual < PEAK_CHANGE) return null;
  const amountIn = (period: Period, category: string) => period.categories.find((point) => point.category === category)?.amountCentavos ?? 0;
  // Scheduled bills and remittances are fixed, so they are never the expense to spend less on.
  const rises = peak.categories.filter(({ category }) => category !== SCHEDULED_PAYMENTS_CATEGORY).map(({ category, amountCentavos }) => ({ category, rise: amountCentavos - median(months.map(([, period]) => amountIn(period, category))) }));
  const driver = rises.reduce<(typeof rises)[number] | null>((best, item) => item.rise > 0 && (!best || item.rise > best.rise) ? item : best, null);
  const name = MONTH_LABELS.dates(peakMonth);
  if (peakIndex === 0) {
    const cut = driver ? `Try to spend less on ${categoryName(driver.category)} this month.` : "Try to keep your spending down this month.";
    return `This month, ${name}, will likely be your most expensive, at about ${formatPeso(peak.totalCentavos)}, or ${formatPeso(extra)} more than usual. ${cut}`;
  }
  // Rounded up to the peso, so the months before it cover the whole extra.
  const perMonth = Math.ceil(extra / peakIndex / 100) * 100;
  const cut = driver ? `, or spend less on ${categoryName(driver.category)} that month` : "";
  return `Your most expensive month will likely be ${name}, at about ${formatPeso(peak.totalCentavos)}, or ${formatPeso(extra)} more than usual. To get ready, set aside about ${formatPeso(perMonth)} a month from ${MONTH_LABELS.dates(months[0]![0])}${cut}.`;
}

function shareOfTen(share: number): string {
  const tenths = Math.round(share * 10);
  if (tenths >= 10) return "almost every peso you spend";
  if (tenths < 1) return "a small part of what you spend";
  return `about ${tenths} of every 10 pesos you spend`;
}

// How the notes name a period and how often its amount is spent.
type NoteWording = { name: (key: string) => string; every: string };

const MONTH_WORDING: NoteWording = { name: MONTH_LABELS.dates, every: "a month" };
const QUARTER_WORDING: NoteWording = { name: monthRange, every: "every 3 months" };

// A plain-language reading of the forecast: the costliest month, the biggest expense, and what changes the most.
// Forecasts without monthly figures are read per quarter.
export function forecastInterpretation(forecast: QuarterlyForecastPayload, now = new Date()): string[] {
  const months = monthlyForecast(forecast, now);
  const periods: [string, Period][] = months
    ? months.map(({ month, ...period }) => [month, period])
    : forecast.quarters.map(({ quarter, ...period }) => [quarter, period]);
  const wording = months ? MONTH_WORDING : QUARTER_WORDING;
  const first = periods[0];
  const last = periods.at(-1);
  if (!first || !last || first === last) return [];
  const [, firstPeriod] = first;
  const [lastKey, lastPeriod] = last;
  const notes: string[] = [];

  if (months) {
    const peakNote = peakMonthNote(periods);
    if (peakNote) notes.push(peakNote);
  } else {
    const [peakKey, peak] = periods.reduce((highest, period) => period[1].totalCentavos > highest[1].totalCentavos ? period : highest);
    const [, low] = periods.reduce((lowest, period) => period[1].totalCentavos < lowest[1].totalCentavos ? period : lowest);
    if (peak.totalCentavos > low.totalCentavos) notes.push(`Your most expensive stretch will likely be ${wording.name(peakKey)}, at about ${formatPeso(peak.totalCentavos)}. Try to save a little extra before then.`);
  }

  const total = periods.reduce((sum, [, period]) => sum + period.totalCentavos, 0);
  const amountIn = (period: Period, category: string) => period.categories.find((point) => point.category === category)?.amountCentavos ?? 0;
  const categories = [...new Set(periods.flatMap(([, period]) => period.categories.map((point) => point.category)))];
  const shares = categories.map((category) => ({ category, total: periods.reduce((sum, [, period]) => sum + amountIn(period, category), 0), change: amountIn(lastPeriod, category) - amountIn(firstPeriod, category) }));
  const largest = shares.reduce<(typeof shares)[number] | null>((best, item) => !best || item.total > best.total ? item : best, null);
  if (largest && total > 0) notes.push(`${categoryLabel(largest.category)} is your biggest expense, ${shareOfTen(largest.total / total)}.`);

  // Scheduled bills and remittances are only named as the biggest expense; their changes follow the schedule.
  const changing = shares.filter((item) => item.category !== SCHEDULED_PAYMENTS_CATEGORY);
  const rising = changing.reduce<(typeof shares)[number] | null>((best, item) => item.change > 0 && (!best || item.change > best.change) ? item : best, null);
  const falling = changing.reduce<(typeof shares)[number] | null>((best, item) => item.change < 0 && (!best || item.change < best.change) ? item : best, null);
  if (rising) notes.push(`By ${wording.name(lastKey)}, you will likely spend about ${formatPeso(rising.change)} more on ${categoryName(rising.category)} ${wording.every}.`);
  if (falling) notes.push(`You will likely spend about ${formatPeso(Math.abs(falling.change))} less on ${categoryName(falling.category)} ${wording.every} by ${wording.name(lastKey)}.`);
  return notes;
}

// Actual spending is drawn solid. The forecast is always dashed and starts from the last actual point before it.
function LineChart({ quarters, labels, series, selected, onSelect, label }: { quarters: string[]; labels: Labels; series: Series[]; selected: number; onSelect: (index: number) => void; label: string }) {
  const [width, setWidth] = useState(0);
  const plotWidth = Math.max(0, width - PLOT.left - PLOT.right);
  const plotHeight = CHART_HEIGHT - PLOT.top - PLOT.bottom;
  const max = niceMax(Math.max(0, ...series.flatMap((line) => [...line.values, ...line.actual]).filter((value): value is number => value !== null)));
  const x = (index: number) => PLOT.left + (quarters.length === 1 ? plotWidth / 2 : index / (quarters.length - 1) * plotWidth);
  const y = (value: number) => PLOT.top + plotHeight - value / max * plotHeight;
  const ticks = [0, max / 2, max];
  const slot = quarters.length > 1 ? plotWidth / (quarters.length - 1) : plotWidth;
  const crowded = quarters.length > FULL_AXIS_QUARTERS;
  const firstForecast = Math.max(0, series[0]?.values.findIndex((value) => value !== null) ?? 0);
  const labelled = (index: number) => !crowded || (index - firstForecast) % 2 === 0;
  const points = (values: (number | null)[]) => values.flatMap((value, index) => value === null ? [] : [[index, value] as const]);
  const path = (line: (readonly [number, number])[]) => line.map(([index, value], offset) => `${offset === 0 ? "M" : "L"} ${x(index)} ${y(value)}`).join(" ");
  const forecastLine = (line: Series) => {
    const forecast = points(line.values);
    const before = forecast[0] ? line.actual[forecast[0][0] - 1] : null;
    return before == null ? forecast : [[forecast[0]![0] - 1, before] as const, ...forecast];
  };
  const hasHistory = series.some((line) => line.actual.slice(0, firstForecast).some((value) => value !== null));
  const dot = (key: string, index: number, value: number, actual: boolean, color: string) => <Circle key={key} cx={x(index)} cy={y(value)} r={index === selected ? 5 : crowded ? 3 : 4} fill={actual ? P.shell : color} stroke={actual ? color : P.shell} strokeWidth={2} />;

  return <View accessibilityLabel={label} onLayout={(event) => setWidth(event.nativeEvent.layout.width)} style={{ height: CHART_HEIGHT, marginTop: 12 }}>
    {width > 0 ? <Svg width={width} height={CHART_HEIGHT} accessibilityRole="image">
      {hasHistory ? <Rect x={x(firstForecast) - slot / 2} y={PLOT.top} width={width - PLOT.right - x(firstForecast) + slot / 2} height={plotHeight} fill="#EFFEF7" /> : null}
      {hasHistory ? <SvgText x={x(firstForecast) - slot / 2 + 4} y={PLOT.top + 10} fill={P.muted} fontFamily="Manrope" fontSize={9} fontWeight="800">FORECAST</SvgText> : null}
      {ticks.map((tick) => <Line key={tick} x1={PLOT.left} x2={width - PLOT.right} y1={y(tick)} y2={y(tick)} stroke={P.line} strokeWidth={1} />)}
      {ticks.map((tick) => <SvgText key={`label-${tick}`} x={PLOT.left - 8} y={y(tick) + 4} fill={P.muted} fontFamily="Manrope" fontSize={10} textAnchor="end">{compactPeso(tick)}</SvgText>)}
      {quarters.map((quarter, index) => labelled(index) ? <SvgText key={quarter} x={x(index)} y={CHART_HEIGHT - 8} fill={index === selected ? P.ink : P.muted} fontFamily="Manrope" fontSize={crowded ? 9 : 10} fontWeight={index === selected ? "800" : "400"} textAnchor="middle">{crowded ? labels.short(quarter) : labels.full(quarter)}</SvgText> : null)}
      <Line x1={x(selected)} x2={x(selected)} y1={PLOT.top} y2={PLOT.top + plotHeight} stroke={P.muted} strokeWidth={1} strokeDasharray="3 3" />
      {series.map((line) => points(line.actual).length ? <Path key={`${line.key}-actual`} d={path(points(line.actual))} fill="none" stroke={line.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" /> : null)}
      {series.map((line) => points(line.values).length ? <Path key={`${line.key}-forecast`} d={path(forecastLine(line))} fill="none" stroke={line.color} strokeWidth={2} strokeDasharray="5 4" strokeLinejoin="round" strokeLinecap="round" /> : null)}
      {series.map((line) => points(line.actual).map(([index, value]) => dot(`${line.key}-actual-${index}`, index, value, true, line.color)))}
      {series.map((line) => points(line.values).map(([index, value]) => dot(`${line.key}-forecast-${index}`, index, value, false, line.color)))}
      {quarters.map((quarter, index) => <Rect key={`hit-${quarter}`} x={x(index) - slot / 2} y={0} width={slot} height={CHART_HEIGHT} fill="transparent" onPress={() => onSelect(index)} />)}
    </Svg> : null}
  </View>;
}

// The period to read: an underlined tab per forecast quarter, lighter than the chart settings above it.
function QuarterTabs({ quarters, selected, onSelect, offset = 0 }: { quarters: string[]; selected: number; onSelect: (index: number) => void; offset?: number }) {
  return <View accessibilityRole="tablist" style={{ flexDirection: "row", marginTop: 14 }}>
    {quarters.map((quarter, tab) => ({ quarter, index: offset + tab })).map(({ quarter, index }) => <Pressable key={quarter} accessibilityRole="tab" accessibilityLabel={`Show ${quarterLabel(quarter)} forecast`} accessibilityState={{ selected: index === selected }} onPress={() => onSelect(index)} style={{ flex: 1, alignItems: "center", borderBottomColor: index === selected ? P.brand : P.line, borderBottomWidth: index === selected ? 2 : 1, paddingVertical: 10 }}>
      <Text style={{ color: index === selected ? P.brand : P.muted, fontFamily: "Manrope", fontSize: 12, fontWeight: index === selected ? "800" : "600" }}>{quarterLabel(quarter)}</Text>
    </Pressable>)}
  </View>;
}

// A compact two-way switch that sizes to its labels.
function Segmented<T extends string>({ label, options, selected, onSelect }: { label: string; options: { value: T; label: string }[]; selected: T; onSelect: (value: T) => void }) {
  return <View style={{ backgroundColor: v4.surface, borderColor: v4.hairline, borderRadius: 10, borderWidth: 1, flexDirection: "row", padding: 3 }}>
    {options.map((option) => <Pressable key={option.value} accessibilityRole="button" accessibilityLabel={`${label}: ${option.label}`} accessibilityState={{ selected: option.value === selected }} onPress={() => onSelect(option.value)} style={{ alignItems: "center", backgroundColor: option.value === selected ? P.brand : "transparent", borderRadius: 7, justifyContent: "center", minHeight: 36, paddingHorizontal: 12 }}>
      <Text style={{ color: option.value === selected ? "#FFFFFF" : P.muted, fontFamily: "Manrope", fontSize: 12, fontWeight: "700" }}>{option.label}</Text>
    </Pressable>)}
  </View>;
}

// The time range as a dropdown, so its longer labels don't need a row of their own.
function RangePicker({ options, selected, onSelect }: { options: { value: ForecastRange; label: string }[]; selected: ForecastRange; onSelect: (value: ForecastRange) => void }) {
  const [open, setOpen] = useState(false);
  const Caret = open ? CaretUp : CaretDown;
  const current = options.find((option) => option.value === selected) ?? options[0]!;
  // Raised above the cards below, so the open list overlays them instead of pushing them down.
  return <View style={{ flexGrow: 1, zIndex: 10 }}>
    <Pressable accessibilityRole="button" accessibilityLabel={`Choose time range: ${current.label}`} accessibilityState={{ expanded: open }} onPress={() => setOpen((value) => !value)} style={{ alignItems: "center", backgroundColor: v4.surface, borderColor: v4.hairline, borderRadius: 10, borderWidth: 1, flexDirection: "row", gap: 6, minHeight: 44, paddingHorizontal: 12 }}>
      <CalendarBlank color={v4.mut} size={15} weight="bold" />
      <Text style={{ color: v4.ink, flex: 1, fontFamily: v4Font, fontSize: 12, fontWeight: "700" }}>{current.label}</Text>
      <Caret color={v4.mut} size={14} weight="bold" />
    </Pressable>
    {open ? <View style={{ backgroundColor: v4.surface, borderColor: v4.hairline, borderRadius: 10, borderWidth: 1, elevation: 6, left: 0, marginTop: 6, overflow: "hidden", position: "absolute", right: 0, shadowColor: "#000", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 12, top: "100%" }}>
      {options.map((option) => <Pressable key={option.value} accessibilityRole="radio" accessibilityLabel={option.label} accessibilityState={{ checked: option.value === selected }} onPress={() => { onSelect(option.value); setOpen(false); }} style={{ alignItems: "center", backgroundColor: option.value === selected ? "#EFFEF7" : v4.surface, flexDirection: "row", gap: 8, minHeight: 44, paddingHorizontal: 12 }}>
        <Text style={{ color: v4.ink, flex: 1, fontFamily: v4Font, fontSize: 13 }}>{option.label}</Text>
        {option.value === selected ? <Check color={v4.brandMid} size={16} weight="bold" /> : null}
      </Pressable>)}
    </View> : null}
  </View>;
}

function Card({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return <View style={{ backgroundColor: P.shell, borderColor: P.line, borderRadius: 16, borderWidth: 1, padding: 16 }}>
    <Text style={{ color: P.ink, fontFamily: "Manrope", fontSize: 16, fontWeight: "800" }}>{title}</Text>
    <Text style={{ color: P.muted, fontFamily: "Manrope", fontSize: 12, marginTop: 3 }}>{subtitle}</Text>
    {children}
  </View>;
}

// How far to trust the forecast, from how much spending history it was based on.
export function forecastReliabilityNote(forecast: QuarterlyForecastPayload): string | null {
  if (forecast.quality === "INSUFFICIENT_DATA") return "Provisional forecast. You have fewer than 6 months of recorded spending, so these are rough estimates, not yet a personal forecast.";
  if (forecast.seasonalUncertainty) return "Seasonal changes aren't shown yet. Until you have 12 months of history, each quarter is based on your typical month, so peaks like school fees or Christmas aren't included yet.";
  return null;
}

// The seasons the user said cost them more, while the forecast still has too little history to show them.
export function seasonalPreferenceNote(forecast: QuarterlyForecastPayload, preferences: SeasonalPreferences | null | undefined): string | null {
  if (!preferences || !(forecast.seasonalUncertainty || forecast.quality === "INSUFFICIENT_DATA")) return null;
  const custom = normalizeCustomEvents(preferences.custom_seasonal_events);
  const names = [...new Set(preferences.high_expense_seasons.flatMap((key) => {
    const name = SEASON_PRESETS.find((preset) => preset.key === key)?.label ?? custom.find((event) => event.id === key)?.name ?? LEGACY_SEASON_LABELS[key];
    return key === "none" || !name ? [] : [name];
  }))];
  if (!names.length) return null;
  const seasons = names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
  return `You said your spending goes up during ${seasons}. We'll reflect that once you have enough history.`;
}

// The selected point's amount: its forecast, or its actual spending before the forecast starts.
function PointAmount({ title, forecast, actual }: { title: string; forecast: number | null; actual: number | null }) {
  return <>
    <Text style={{ color: P.muted, fontFamily: "Manrope", fontSize: 12, marginTop: 12 }}>{title}{forecast === null ? " · Actual" : " · Forecast"}</Text>
    <Text style={{ color: P.brand, fontFamily: "Manrope", fontSize: 22, fontWeight: "800", marginTop: 2 }}>{formatPeso(forecast ?? actual ?? 0)}</Text>
  </>;
}

// Spending so far against its forecast; spending past the forecast fills the bar and turns red.
function ProgressRow({ label, forecast, actual }: { label: string; forecast: number; actual: number }) {
  const over = actual > forecast;
  const filled = forecast > 0 ? Math.min(1, actual / forecast) : actual > 0 ? 1 : 0;
  const note = over ? `${formatPeso(actual - forecast)} over` : forecast > 0 ? `${Math.round(actual / forecast * 100)}% of forecast` : "";
  return <View accessible accessibilityLabel={`${label}: ${formatPeso(actual)} spent of ${formatPeso(forecast)} forecast${note ? `, ${note}` : ""}`} style={{ marginTop: 10 }}>
    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
      <Text style={{ color: P.ink, flexShrink: 1, fontFamily: "Manrope", fontSize: 13, fontWeight: "700" }}>{label}</Text>
      <Text style={{ color: over ? P.over : P.ink, fontFamily: "Manrope", fontSize: 13, fontWeight: "700" }}>{formatPeso(actual)} of {formatPeso(forecast)}</Text>
    </View>
    <View style={{ backgroundColor: P.line, borderRadius: 4, height: 8, marginTop: 6, overflow: "hidden" }}>
      <View style={{ backgroundColor: over ? P.over : P.brand, height: "100%", width: `${filled * 100}%` }} />
    </View>
    {note ? <Text style={{ color: over ? P.over : P.muted, fontFamily: "Manrope", fontSize: 11, marginTop: 3 }}>{note}</Text> : null}
  </View>;
}

// This month's or quarter's forecast against the spending recorded so far, shown inside the spending card.
function ForecastVsActual({ period, unit, label, forecast, actual }: { period: string; unit: "month" | "quarter"; label: string; forecast: number; actual: number }) {
  return <View style={{ borderTopColor: P.line, borderTopWidth: 1, marginTop: 14, paddingTop: 12 }}>
    <WithTermInfo term="forecast-vs-actual"><Text style={{ color: P.ink, fontFamily: "Manrope", fontSize: 13, fontWeight: "800" }}>Forecast vs Actual</Text></WithTermInfo>
    <Text style={{ color: P.muted, fontFamily: "Manrope", fontSize: 11, marginTop: 2 }}>{period} so far, against this {unit}'s forecast</Text>
    <ProgressRow label={label} forecast={forecast} actual={actual} />
  </View>;
}

function quarterOf(month: string): string {
  return `${month.slice(0, 4)}Q${Math.ceil(Number(month.slice(5, 7)) / 3)}`;
}

// The months' spending added up by category, such as a quarter's months so far.
function combinePeriods(periods: Period[]): Period {
  const totals = new Map<string, number>();
  for (const period of periods) for (const point of period.categories) totals.set(point.category, (totals.get(point.category) ?? 0) + point.amountCentavos);
  const categories = [...totals].map(([category, amountCentavos]) => ({ category, amountCentavos }));
  return { totalCentavos: categories.reduce((sum, point) => sum + point.amountCentavos, 0), categories };
}

// history holds actual spending for the quarters before the forecast, oldest first; monthHistory holds the
// months before a monthly forecast, ending with the current month so far.
export function QuarterlyForecastCharts({ forecast, history = [], monthHistory = [], preferences, now = new Date() }: { forecast: QuarterlyForecastPayload; history?: QuarterlyForecastPayload["quarters"]; monthHistory?: NonNullable<QuarterlyForecastPayload["months"]>; preferences?: SeasonalPreferences | null; now?: Date }) {
  const [chosenScale, setScale] = useState<ForecastScale>("monthly");
  const [range, setRange] = useState<ForecastRange>("around");
  const [chosen, setSelected] = useState<number | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const monthly = monthlyForecast(forecast, now);
  const months = chosenScale === "monthly" ? monthly : null;
  const scale: ForecastScale = months ? "monthly" : "quarterly";
  const labels = months ? MONTH_LABELS : QUARTER_LABELS;
  const unit = months ? "months" : "quarters";
  const thisMonth = manilaToday(now).slice(0, 7);
  const thisQuarter = quarterOf(thisMonth);
  // The current month or quarter is charted as a forecast; its spending so far goes to Forecast vs Actual.
  const thisPeriod = months
    ? { name: MONTH_LABELS.dates(thisMonth), unit: "month" as const, forecast: months.find((month) => month.month === thisMonth), actual: monthHistory.find((month) => month.month === thisMonth) }
    : { name: quarterLabel(thisQuarter), unit: "quarter" as const, forecast: forecast.quarters.find((quarter) => quarter.quarter === thisQuarter), actual: combinePeriods(monthHistory.filter((month) => quarterOf(month.month) === thisQuarter)) };
  const amountIn = (period: Period | undefined, key: string) => period?.categories.find((point) => point.category === key)?.amountCentavos ?? 0;
  const points = RANGE_POINTS[scale][range];
  const actual: [string, Period][] = months
    ? monthHistory.filter((month) => month.month !== thisMonth).map(({ month, ...period }) => [month, period])
    : history.map(({ quarter, ...period }) => [quarter, period]);
  const projected: [string, Period][] = months
    ? months.map(({ month, ...period }) => [month, period])
    : forecast.quarters.map(({ quarter, ...period }) => [quarter, period]);
  const slots = mergeSlots(points.past ? actual.slice(-points.past) : [], projected.slice(0, points.next));
  const firstForecast = slots.findIndex((slot) => slot.forecast);
  // A range without forecast points opens on its latest month or quarter.
  const opening = firstForecast === -1 ? slots.length - 1 : firstForecast;
  const selected = chosen !== null && chosen < slots.length ? chosen : opening;
  const quarters = slots.map((slot) => slot.key);
  const current = slots[selected];
  const choose = <T,>(set: (value: T) => void) => (value: T) => { set(value); setSelected(null); };
  const settings = <View style={{ alignItems: "flex-start", flexDirection: "row", flexWrap: "wrap", gap: 8, zIndex: 10 }}>
    {monthly ? <Segmented label="Show spending" options={[{ value: "monthly" as const, label: "Monthly" }, { value: "quarterly" as const, label: "Quarterly" }]} selected={scale} onSelect={choose(setScale)} /> : null}
    <RangePicker options={(["past", "around", "ahead"] as const).map((value) => ({ value, label: rangeLabel(RANGE_POINTS[scale][value], scale) }))} selected={range} onSelect={choose(setRange)} />
  </View>;
  if (!current) {
    return <View style={{ marginTop: 20 }}>
      {settings}
      <Text style={{ color: P.muted, fontFamily: "Manrope", fontSize: 13, lineHeight: 20, marginTop: 14 }}>No recorded spending in this range yet.</Text>
    </View>;
  }
  // Total heads the dropdown and is shown first; its key can't clash with a category slug.
  const total: Series = { key: TOTAL_KEY, label: "Total", color: P.brand, values: slots.map((slot) => slot.forecast?.totalCentavos ?? null), actual: slots.map((slot) => slot.actual?.totalCentavos ?? null) };
  const categories = slotCategorySeries(slots);
  const line = categories.find((series) => series.key === selectedCategory) ?? total;
  // The seasons note follows the user's current answers, so it is never saved or reworded with the forecast notes.
  const seasonsNote = seasonalPreferenceNote(forecast, preferences);
  const interpretation = [...forecast.interpretation ?? forecastInterpretation(forecast, now), ...seasonsNote ? [seasonsNote] : []];
  const reliability = forecastReliabilityNote(forecast);
  const actualCount = slots.filter((slot) => slot.actual).length;
  const forecastCount = slots.filter((slot) => slot.forecast).length;
  const spending = current.forecast ? "" : " · actual spending";
  const forecastQuarters = slots.filter((slot) => slot.forecast).map((slot) => slot.key);

  return <View style={{ gap: 14, marginTop: 20 }}>
    {reliability ? <View accessibilityRole="alert" style={{ backgroundColor: forecast.quality === "INSUFFICIENT_DATA" ? "#FFF4E5" : "#EFFEF7", borderColor: forecast.quality === "INSUFFICIENT_DATA" ? "#F3C98B" : P.line, borderRadius: 12, borderWidth: 1, padding: 12 }}>
      <Text style={{ color: P.ink, fontFamily: "Manrope", fontSize: 12, lineHeight: 18 }}>{reliability}</Text>
    </View> : null}
    <View style={{ zIndex: 10 }}>
      {settings}
      {months || !forecastQuarters.length ? null : <QuarterTabs quarters={forecastQuarters} offset={firstForecast} selected={selected} onSelect={setSelected} />}
      <Text style={{ color: P.muted, fontFamily: "Manrope", fontSize: 12, marginTop: 8 }}>{labels.dates(current.key)}{spending}</Text>
    </View>
    <Card title="Projected spending" subtitle={actualCount ? `${actualCount} ${unit} of actual spending and ${forecastCount} forecast ${unit}` : `All forecast categories, per ${months ? "month" : "quarter"}`}>
      <ForecastCategoryPicker categories={[total, ...categories]} selected={line} onSelect={setSelectedCategory} />
      <PointAmount title={labels.full(current.key)} forecast={line.values[selected] ?? null} actual={line.actual[selected] ?? null} />
      <LineChart quarters={quarters} labels={labels} series={[line]} selected={selected} onSelect={setSelected} label={line !== total ? `${line.label} spending over ${quarters.length} ${unit}` : actualCount ? `Actual spending for ${actualCount} ${unit} and projected spending for ${forecastCount} ${unit}` : `Total projected spending for ${quarters.length} ${unit}`} />
      {thisPeriod.forecast ? <ForecastVsActual period={thisPeriod.name} unit={thisPeriod.unit} label={line.label} forecast={line === total ? thisPeriod.forecast.totalCentavos : amountIn(thisPeriod.forecast, line.key)} actual={line === total ? thisPeriod.actual?.totalCentavos ?? 0 : amountIn(thisPeriod.actual, line.key)} /> : null}
      {line.key === SCHEDULED_PAYMENTS_CATEGORY ? <Text style={{ color: P.muted, fontFamily: "Manrope", fontSize: 12, marginTop: 8 }}>Based on your scheduled bills and remittances.</Text> : null}
    </Card>
    {interpretation.length ? <Card title="What this means for you" subtitle="How your spending will likely change">
      <View style={{ gap: 8, marginTop: 12 }}>{interpretation.map((note) => <View key={note} style={{ flexDirection: "row", gap: 8 }}>
        <Text style={{ color: P.brand, fontFamily: "Manrope", fontSize: 13, fontWeight: "800" }}>•</Text>
        <Text style={{ color: P.ink, flex: 1, fontFamily: "Manrope", fontSize: 13, lineHeight: 20 }}>{note}</Text>
      </View>)}</View>
      <Text style={{ color: P.muted, fontFamily: "Manrope", fontSize: 11, lineHeight: 16, marginTop: 12 }}>Estimates use your expense history and Philippine household spending trends, plus scheduled bills and remittances. These are estimates, not exact amounts.</Text>
    </Card> : null}
  </View>;
}
