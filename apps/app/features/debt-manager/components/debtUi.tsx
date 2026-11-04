import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { Bank, Briefcase, Car, CaretRight, CreditCard, HandCoins, Receipt, Wallet, type Icon } from "phosphor-react-native";
import { Chip, styles as ui, v4, v4Font } from "../../../components/BudgieForm";
import type { DebtTypePreset } from "../../../local-db/repositories/debts/debtAccounts";
import type { CreditCardStrategy } from "../../../local-db/repositories/credit-cards/creditCardRepaymentPlans";
import type { DebtForecastStatus } from "../forecast/helpers/debtForecast";
import type { DebtTrendRange } from "../forecast/helpers/debtTrendRange";
import { formatPesoOr } from "../../../lib/format/money";
import type { GlossaryTermId } from "../../glossary/terms";
import { WithTermInfo } from "../../../components/TermInfo";

// Debt Manager building blocks on top of the Budgie V4 form kit (screens v5: Debts, Debt detail, Card detail).

export function formatPeso(centavos: number | null | undefined): string {
  return formatPesoOr(centavos, "Not available");
}

export function formatShortDate(date: string): string {
  return new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${date.slice(0, 10)}T00:00:00Z`));
}

// "Mar 2027", for debt-free milestones.
export function formatMilestoneDate(date: string): string {
  return new Intl.DateTimeFormat("en-PH", { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T00:00:00.000Z`));
}

export function SectionHeader({ title, actionLabel, onAction, accessibilityLabel }: { title: string; actionLabel?: string; onAction?: () => void; accessibilityLabel?: string }) {
  return <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 10, marginTop: 6 }}>
    <Text accessibilityRole="header" style={{ fontFamily: v4Font, fontSize: 16, fontWeight: "800", color: v4.ink }}>{title}</Text>
    {actionLabel && onAction ? <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? actionLabel} onPress={onAction} hitSlop={10}><Text style={{ fontFamily: v4Font, fontSize: 12.5, fontWeight: "700", color: v4.brand }}>{actionLabel}</Text></Pressable> : null}
  </View>;
}

export type Tone = "ok" | "warn" | "err" | "info" | "neutral";

const toneColors: Record<Tone, { bg: string; fg: string }> = {
  ok: { bg: "#E9F6EF", fg: "#004D1B" },
  warn: { bg: "#FDF3E7", fg: "#722C00" },
  err: { bg: "#FCEDEF", fg: "#8A0000" },
  info: { bg: "#E6EFFC", fg: "#1D4ED8" },
  neutral: { bg: "#EFEBE3", fg: v4.ink2 },
};

export function toneColor(tone: Tone): string {
  return toneColors[tone].fg;
}

export function Pill({ label, tone = "neutral" }: { label: string; tone?: Tone }) {
  const colors = toneColors[tone];
  return <View style={{ alignSelf: "flex-start", borderRadius: 999, borderWidth: 1, borderColor: v4.ink2, backgroundColor: colors.bg, paddingHorizontal: 11, paddingVertical: 4 }}>
    <Text style={{ fontFamily: v4Font, fontSize: 11, fontWeight: "700", color: colors.fg }}>{label}</Text>
  </View>;
}

export function Pills({ children }: { children: ReactNode }) {
  return <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7 }}>{children}</View>;
}

// A label on the left and a bold value on the right (b-row).
export function InfoRow({ label, value, tone, term }: { label: string; value: string; tone?: Tone; term?: GlossaryTermId }) {
  return <View style={{ flexDirection: "row", alignItems: term ? "center" : "baseline", justifyContent: "space-between", gap: 12 }}>
    <WithTermInfo term={term}><Text style={{ fontFamily: v4Font, fontSize: 12.5, color: v4.ink2, flexShrink: 1 }}>{label}</Text></WithTermInfo>
    <Text style={{ fontFamily: v4Font, fontSize: 13, fontWeight: "700", color: tone ? toneColor(tone) : v4.ink, fontVariant: ["tabular-nums"], textAlign: "right", flexShrink: 1 }}>{value}</Text>
  </View>;
}

export function ProgressBar({ label, valueLabel, ratio, tone = "ok", inverted = false }: { label: string; valueLabel: string; ratio: number; tone?: Tone; inverted?: boolean }) {
  const percent = Number.isFinite(ratio) ? Math.min(100, Math.max(0, ratio * 100)) : 0;
  return <View accessible accessibilityLabel={`${label}, ${valueLabel}`}>
    <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 10, marginBottom: 6 }}>
      <Text style={{ fontFamily: v4Font, fontSize: 12, fontWeight: "600", color: inverted ? "rgba(255,255,255,0.78)" : v4.ink2 }}>{label}</Text>
      <Text style={{ fontFamily: v4Font, fontSize: 11.5, fontWeight: "700", color: inverted ? "#FFFFFF" : v4.ink, fontVariant: ["tabular-nums"] }}>{valueLabel}</Text>
    </View>
    <View style={{ height: 8, borderRadius: 8, backgroundColor: inverted ? "rgba(255,255,255,0.22)" : "#DBD7CD", overflow: "hidden" }}>
      <View style={{ width: `${percent}%`, height: "100%", borderRadius: 8, backgroundColor: inverted ? "#FFFFFF" : tone === "ok" ? "#004D1B" : toneColor(tone) }} />
    </View>
  </View>;
}

// Bordered on its own; `flush` inside a card, where the rows run edge to edge without a second border.
export function List({ children, flush = false }: { children: ReactNode; flush?: boolean }) {
  return <View style={flush ? FLUSH_LIST : ui.list}>{children}</View>;
}

// Cancels the card's horizontal padding (BudgieForm card: paddingHorizontal 15).
export const FLUSH_LIST = { marginHorizontal: -15, borderTopWidth: 1, borderBottomWidth: 1, borderColor: v4.hairline } as const;

type ListRowProps = {
  icon?: ReactNode;
  tint?: { bg: string; fg: string };
  title: string;
  subtitle?: string;
  subtitleTone?: Tone;
  value?: string;
  caption?: string;
  captionTone?: Tone;
  divider?: boolean;
  onPress?: () => void;
  accessibilityLabel?: string;
};

// A grouped list row: tinted icon tile, title and subtitle, amount and caption on the right (b-li).
export function ListRow({ icon, tint, title, subtitle, subtitleTone, value, caption, captionTone, divider = false, onPress, accessibilityLabel }: ListRowProps) {
  const body = <>
    <View style={[ui.listRowMain, onPress ? null : { paddingRight: 14 }]}>
      {icon ? <View style={[ui.listTile, { backgroundColor: tint?.bg ?? "#E6EFE9" }]}>{icon}</View> : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={ui.listTitle}>{title}</Text>
        {subtitle ? <Text numberOfLines={1} style={[ui.listSubtitle, subtitleTone ? { color: toneColor(subtitleTone) } : null]}>{subtitle}</Text> : null}
      </View>
      {value || caption ? <View style={{ alignItems: "flex-end", flexShrink: 0 }}>
        {value ? <Text style={{ fontFamily: v4Font, fontSize: 12.5, fontWeight: "700", color: v4.ink, fontVariant: ["tabular-nums"] }}>{value}</Text> : null}
        {caption ? <Text style={{ fontFamily: v4Font, fontSize: 10.5, color: captionTone ? toneColor(captionTone) : v4.mut, marginTop: 1 }}>{caption}</Text> : null}
      </View> : null}
    </View>
    {onPress ? <View style={{ paddingRight: 12, justifyContent: "center" }}><CaretRight color={v4.mut} size={15} weight="bold" /></View> : null}
  </>;
  const style = [ui.listRow, divider ? ui.listRowDivider : null];
  return onPress
    ? <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? title} onPress={onPress} style={style}>{body}</Pressable>
    : <View accessible={Boolean(accessibilityLabel)} accessibilityLabel={accessibilityLabel} style={style}>{body}</View>;
}

export function Button({ label, onPress, variant = "primary", icon, disabled = false, accessibilityLabel, flex = false }: { label: string; onPress: () => void; variant?: "primary" | "ghost" | "danger"; icon?: ReactNode; disabled?: boolean; accessibilityLabel?: string; flex?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={[ui.button, variant === "ghost" ? ui.buttonGhost : variant === "danger" ? ui.buttonDanger : null, disabled ? ui.dimmed : null, flex ? { flex: 1 } : null]}>
    {icon}
    <Text style={[ui.buttonText, variant === "ghost" ? ui.buttonGhostText : null]}>{label}</Text>
  </Pressable>;
}

// A compact text action used inside cards, for secondary actions next to a primary button.
export function LinkButton({ label, onPress, tone, disabled = false, accessibilityLabel }: { label: string; onPress: () => void; tone?: Tone; disabled?: boolean; accessibilityLabel?: string }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} hitSlop={8} style={{ minHeight: 32, justifyContent: "center", opacity: disabled ? 0.55 : 1 }}>
    <Text style={{ fontFamily: v4Font, fontSize: 12.5, fontWeight: "700", color: tone ? toneColor(tone) : v4.brand }}>{label}</Text>
  </Pressable>;
}

export function Divider() {
  return <View style={{ height: 1, backgroundColor: v4.hairline }} />;
}

export const CARD_TINT = { bg: "#FCEDEF", fg: "#8A0000" } as const;

const DEBT_TYPE_TILES: Record<DebtTypePreset, { Icon: Icon; bg: string; fg: string }> = {
  salary_loan: { Icon: Bank, bg: "#FDF3E7", fg: "#722C00" },
  auto_loan: { Icon: Car, bg: "#E9F6EF", fg: "#004D1B" },
  business_loan: { Icon: Briefcase, bg: "#E6EFFC", fg: "#1D4ED8" },
  personal_loan: { Icon: HandCoins, bg: "#EFEBE3", fg: v4.ink2 },
  multipurpose_loan: { Icon: Wallet, bg: "#EFEBE3", fg: v4.ink2 },
  custom_debt: { Icon: Receipt, bg: "#EFEBE3", fg: v4.ink2 },
};

export function DebtTypeIcon({ type }: { type: DebtTypePreset }) {
  const { Icon: TypeIcon, fg } = DEBT_TYPE_TILES[type] ?? DEBT_TYPE_TILES.custom_debt;
  return <TypeIcon size={17} color={fg} weight="bold" />;
}

export function debtTypeTint(type: DebtTypePreset): { bg: string; fg: string } {
  const { bg, fg } = DEBT_TYPE_TILES[type] ?? DEBT_TYPE_TILES.custom_debt;
  return { bg, fg };
}

export function CardIcon() {
  return <CreditCard size={17} color={CARD_TINT.fg} weight="bold" />;
}

// Schedule state of a debt, worded the same everywhere in Debt Manager.
export function forecastStatusLabel(status: DebtForecastStatus): { label: string; tone: Tone } {
  if (status === "ahead") return { label: "Ahead", tone: "ok" };
  if (status === "on_track") return { label: "On track", tone: "ok" };
  if (status === "behind") return { label: "Behind", tone: "warn" };
  if (status === "paid_off") return { label: "Paid off", tone: "ok" };
  return { label: "No schedule", tone: "neutral" };
}

export function cardStrategyLabel(strategy: CreditCardStrategy["strategy"] | undefined): string {
  if (strategy === "pay_minimum") return "Minimum due";
  if (strategy === "percentage_of_statement") return "Percentage";
  if (strategy === "custom_payment") return "Custom";
  return "Pay in full";
}

const RANGE_OPTIONS = ["month", "year", "payoff", "all"] as const;

// Calendar window chips shared by every debt chart.
export function RangeChips({ range, onChange, payoffAvailable, allLabel = "Show all debt history" }: { range: DebtTrendRange; onChange: (range: DebtTrendRange) => void; payoffAvailable: boolean; allLabel?: string }) {
  return <View style={ui.chips}>{RANGE_OPTIONS.filter((option) => option !== "payoff" || payoffAvailable).map((option) => <Chip
    key={option}
    label={option === "payoff" ? "Today to debt-free" : option === "all" ? "All" : `1 ${option}`}
    accessibilityLabel={option === "payoff" ? "Show today until debt free" : option === "all" ? allLabel : `Show 1 ${option}`}
    selected={range === option}
    onPress={() => onChange(option)}
  />)}</View>;
}

export function ChartLegend({ color = "#2563EB" }: { color?: string }) {
  return <View accessibilityLabel="Chart legend: solid line actual balance, dashed line forecast" style={{ flexDirection: "row", gap: 14 }}>
    <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}><View style={{ width: 12, height: 2.5, borderRadius: 2, backgroundColor: color }} /><Text style={{ fontFamily: v4Font, fontSize: 10.5, fontWeight: "600", color: v4.ink2 }}>Actual balance</Text></View>
    <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>{[0, 1, 2].map((dash) => <View key={dash} style={{ width: 3, height: 2.5, borderRadius: 1, backgroundColor: color }} />)}<Text style={{ fontFamily: v4Font, fontSize: 10.5, fontWeight: "600", color: v4.ink2, marginLeft: 2 }}>Forecast</Text></View>
  </View>;
}
