import { useState, type ReactNode } from "react";
import { Dimensions, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { CaretRight, Check, Info, Warning, WarningCircle } from "phosphor-react-native";
import { BottomSheetSurface } from "./BottomSheetSurface";
import { ActionSheet } from "./ActionSheet";
import { formatPesoAmount } from "../lib/format/money";
import type { GlossaryTermId } from "../features/glossary/terms";
import { WithTermInfo } from "./TermInfo";

// Budgie V4 form tokens (screens v4, "v3" overrides).
export const v4 = {
  shell: "#FCF8F0",
  surface: "#FFFFFF",
  border: "#959592",
  hairline: "#EAEAE6",
  brand: "#013220",
  brandMid: "#068751",
  ink: "#1B1C1A",
  ink2: "#414942",
  mut: "#6B7A6F",
  placeholder: "#A6A79F",
  okBg: "#EFFEF7",
  okBorder: "#C8EFDC",
  okInk: "#0B7A4F",
  error: "#D9001F",
  errorBg: "#FFF0F2",
  errorFieldBg: "#FFF7F8",
  warnBg: "#FFF6EC",
  warnInk: "#B45309",
  infoBg: "#EFF4F1",
} as const;

export const v4Font = "Manrope";

// Tinted icon tiles used by list rows (b-li-ic.*).
export const tileTints = [
  { bg: "#F8ECDF", fg: "#AF6319" },
  { bg: "#E2F0EA", fg: "#0B8753" },
  { bg: "#013220", fg: "#FFFFFF" },
  { bg: "#E3F2EA", fg: "#068751" },
  { bg: "#EAEAE7", fg: "#414942" },
] as const;

export function FormCard({ children, title, right, term }: { children: ReactNode; title?: string; right?: ReactNode; term?: GlossaryTermId }) {
  return (
    <View style={styles.card}>
      {title ? (
        <View style={styles.cardHead}>
          <WithTermInfo term={term}><Text style={styles.cardTitle}>{title}</Text></WithTermInfo>
          {right}
        </View>
      ) : null}
      {children}
    </View>
  );
}

export function FieldLabel({ children, term }: { children: string; term?: GlossaryTermId }) {
  if (!term) return <Text style={styles.fieldLabel}>{children}</Text>;
  return <WithTermInfo term={term} style={styles.fieldLabelRow}><Text style={[styles.fieldLabel, styles.fieldLabelInRow]}>{children}</Text></WithTermInfo>;
}

export function FieldError({ children }: { children: string }) {
  return <Text style={styles.fieldError}>{children}</Text>;
}

// Uppercase heading above a group of chips (b-slabel).
export function SectionLabel({ children }: { children: string }) {
  return <Text style={styles.sectionLabel}>{children}</Text>;
}

type PickerFieldProps = {
  label: string;
  value: string;
  placeholder?: boolean;
  onPress: () => void;
  accessibilityLabel?: string;
  icon?: ReactNode;
  error?: boolean;
  term?: GlossaryTermId;
};

export function PickerField({ label, value, placeholder = false, onPress, accessibilityLabel, icon, error = false, term }: PickerFieldProps) {
  return (
    <View>
      <FieldLabel term={term}>{label}</FieldLabel>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? `${label}: ${value}`}
        style={[styles.fieldBox, error ? styles.fieldBoxError : null]}
      >
        {icon}
        <Text numberOfLines={1} style={[styles.fieldValue, placeholder ? styles.fieldPlaceholder : null]}>{value}</Text>
        <CaretRight color={v4.mut} size={16} weight="bold" />
      </Pressable>
    </View>
  );
}

export function TextField({ label, suffix, error, icon, term, style, ...input }: TextInputProps & { label: string; suffix?: string; error?: boolean; icon?: ReactNode; term?: GlossaryTermId }) {
  return (
    <View>
      <FieldLabel term={term}>{label}</FieldLabel>
      <View style={[styles.fieldBox, input.multiline ? styles.fieldBoxMultiline : null, error ? styles.fieldBoxError : null]}>
        {icon}
        <TextInput placeholderTextColor={v4.placeholder} {...input} style={[styles.fieldInput, input.multiline ? styles.fieldInputMultiline : null, style]} />
        {suffix ? <Text style={styles.fieldSuffix}>{suffix}</Text> : null}
      </View>
    </View>
  );
}

type BannerTone = "error" | "warn" | "info";

const bannerTones: Record<BannerTone, { bg: string; fg: string; icon: string }> = {
  error: { bg: v4.errorBg, fg: v4.error, icon: v4.error },
  warn: { bg: v4.warnBg, fg: v4.warnInk, icon: "#AF6319" },
  info: { bg: v4.infoBg, fg: v4.ink2, icon: v4.brand },
};

export function Banner({ tone, children }: { tone: BannerTone; children: string }) {
  const colors = bannerTones[tone];
  const Icon = tone === "error" ? WarningCircle : tone === "warn" ? Warning : Info;
  return (
    <View accessibilityRole={tone === "error" ? "alert" : undefined} style={[styles.banner, { backgroundColor: colors.bg }]}>
      <Icon color={colors.icon} size={16} weight="bold" />
      <Text style={[styles.bannerText, { color: colors.fg }]}>{children}</Text>
    </View>
  );
}

type AmountHeroProps = {
  children?: ReactNode;
  label?: string;
  amountCentavos?: number;
  detail?: string;
};

export function AmountHero({ children, label = "AMOUNT", amountCentavos, detail }: AmountHeroProps) {
  // An unsized SVG keeps its intrinsic size on native, so the gradient is drawn at the measured card size.
  const [size, setSize] = useState({ width: 0, height: 0 });
  return (
    <View style={styles.hero} onLayout={(event) => setSize(event.nativeEvent.layout)}>
      {size.width > 0 ? <Svg style={StyleSheet.absoluteFill} width={size.width} height={size.height}>
        <Defs>
          <LinearGradient id="amountHero" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={v4.brand} />
            <Stop offset="1" stopColor={v4.brandMid} />
          </LinearGradient>
        </Defs>
        <Rect width={size.width} height={size.height} fill="url(#amountHero)" />
      </Svg> : null}
      <Text style={styles.heroLabel}>{label}</Text>
      {amountCentavos !== undefined ? (
        <Text style={styles.heroAmount}>
          {amountCentavos < 0 ? "-" : ""}<Text style={styles.heroCurrency}>₱</Text>
          {formatPesoAmount(amountCentavos)}
        </Text>
      ) : null}
      {detail ? <Text style={styles.heroDetail}>{detail}</Text> : null}
      {children}
    </View>
  );
}

export function Segment<T extends string>({ options, value, onChange, disabled = false }: {
  options: { key: T; label: string; icon?: (color: string) => ReactNode }[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <View accessibilityRole="radiogroup" style={styles.segment}>
      {options.map((option) => {
        const selected = option.key === value;
        const color = selected ? "#FFFFFF" : v4.ink2;
        return (
          <Pressable
            key={option.key}
            onPress={() => onChange(option.key)}
            disabled={disabled}
            accessibilityRole="radio"
            accessibilityLabel={option.label}
            accessibilityState={{ selected, disabled }}
            style={[styles.segmentItem, selected ? styles.segmentItemOn : null, disabled && !selected ? styles.dimmed : null]}
          >
            {option.icon?.(color)}
            <Text style={[styles.segmentText, { color }]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Chip({ label, selected, onPress, accessibilityLabel }: { label: string; selected: boolean; onPress: () => void; accessibilityLabel?: string }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected }}
      style={[styles.chip, selected ? styles.chipOn : null]}
    >
      <Text style={[styles.chipText, selected ? styles.chipTextOn : null]}>{label}</Text>
    </Pressable>
  );
}

export function Switch({ value, onToggle, accessibilityLabel, disabled = false }: { value: boolean; onToggle: () => void; accessibilityLabel: string; disabled?: boolean }) {
  return (
    <Pressable
      onPress={onToggle}
      disabled={disabled}
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked: value, disabled }}
      hitSlop={8}
      style={[styles.switchTrack, value ? styles.switchTrackOn : null, disabled ? styles.dimmed : null]}
    >
      <View style={[styles.switchThumb, value ? styles.switchThumbOn : null]} />
    </Pressable>
  );
}

// A selectable option card in a picker sheet (b-opt): a check when selected, an empty ring otherwise.
export function OptionRow({ title, subtitle, selected, onPress }: { title: string; subtitle?: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="radio" accessibilityLabel={title} accessibilityState={{ checked: selected }} style={[styles.option, selected ? styles.optionOn : null]}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={styles.optionTitle}>{title}</Text>
        {subtitle ? <Text numberOfLines={1} style={styles.optionSubtitle}>{subtitle}</Text> : null}
      </View>
      {selected ? <Check color={v4.brandMid} size={16} weight="bold" /> : <View style={styles.optionRing} />}
    </Pressable>
  );
}

export function BottomSheet({ visible, onClose, title, children }: { visible: boolean; onClose: () => void; title?: string; children: ReactNode }) {
  return (
    <ActionSheet visible={visible} onClose={onClose} backdropColor="rgba(27,28,26,0.4)">
      <Pressable onPress={() => {}} style={{ width: "100%" }}>
        <BottomSheetSurface style={{ backgroundColor: v4.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: Dimensions.get("window").height * 0.85 }}>
          <View style={{ width: 38, height: 4, borderRadius: 4, backgroundColor: "#DBD7CD", alignSelf: "center", marginTop: 10 }} />
          <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 36, gap: 12 }} bounces={false} keyboardShouldPersistTaps="handled">
            {title ? <Text style={{ fontFamily: v4Font, fontWeight: "800", fontSize: 16, color: v4.ink }}>{title}</Text> : null}
            {children}
          </ScrollView>
        </BottomSheetSurface>
      </Pressable>
    </ActionSheet>
  );
}

export function Note({ children }: { children: ReactNode }) {
  return <Text style={styles.note}>{children}</Text>;
}

// Shown under day-of-month inputs once a day past the 28th is entered; schedules fall back to the month's last day.
export function MonthEndNote({ days }: { days: Array<number | string | null | undefined> }) {
  if (!days.some((day) => Number(day) > 28 && Number(day) <= 31)) return null;
  return <Note>Days 29, 30 and 31 become the 28th in February (the 29th in leap years), and the 31st becomes the 30th in months with 30 days.</Note>;
}

export const styles = StyleSheet.create({
  card: { backgroundColor: v4.surface, borderWidth: 1, borderColor: v4.border, borderRadius: 16, paddingHorizontal: 15, paddingVertical: 14, gap: 12, shadowColor: v4.ink, shadowOpacity: 0.05, shadowRadius: 2, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  cardHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  cardTitle: { fontFamily: v4Font, fontSize: 13.5, fontWeight: "700", color: v4.ink, flexShrink: 1 },
  fieldLabel: { fontFamily: v4Font, fontSize: 11.5, fontWeight: "600", color: v4.ink2, marginBottom: 5 },
  fieldLabelRow: { marginBottom: 5 },
  fieldLabelInRow: { marginBottom: 0 },
  fieldError: { fontFamily: v4Font, fontSize: 10.5, fontWeight: "600", color: v4.error, marginTop: 4 },
  sectionLabel: { fontFamily: v4Font, fontSize: 11, fontWeight: "700", letterSpacing: 0.6, color: v4.ink2, marginBottom: 5 },
  fieldBox: { minHeight: 48, borderWidth: 1, borderColor: v4.border, backgroundColor: v4.surface, borderRadius: 12, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 9 },
  fieldBoxMultiline: { alignItems: "flex-start", paddingVertical: 12 },
  fieldBoxError: { borderColor: v4.error, backgroundColor: v4.errorFieldBg },
  fieldValue: { flex: 1, fontFamily: v4Font, fontSize: 13.5, color: v4.ink },
  fieldPlaceholder: { color: v4.placeholder },
  fieldInput: { flex: 1, fontFamily: v4Font, fontSize: 13.5, color: v4.ink, paddingVertical: 12 },
  fieldInputMultiline: { minHeight: 64, paddingVertical: 0, textAlignVertical: "top" },
  fieldSuffix: { fontFamily: v4Font, fontSize: 12, fontWeight: "700", color: v4.mut },
  banner: { flexDirection: "row", alignItems: "flex-start", gap: 9, borderRadius: 13, paddingVertical: 11, paddingHorizontal: 13 },
  bannerText: { flex: 1, fontFamily: v4Font, fontSize: 11.5, lineHeight: 17, fontWeight: "500" },
  hero: { borderRadius: 20, paddingHorizontal: 18, paddingVertical: 17, overflow: "hidden", backgroundColor: v4.brand },
  heroLabel: { fontFamily: v4Font, fontSize: 10.5, fontWeight: "700", letterSpacing: 0.95, color: "rgba(255,255,255,0.62)" },
  heroAmount: { marginTop: 6, fontFamily: v4Font, fontSize: 30, fontWeight: "800", letterSpacing: -0.6, color: "#FFFFFF", fontVariant: ["tabular-nums"] },
  heroCurrency: { fontSize: 13, fontWeight: "600", letterSpacing: 0 },
  heroDetail: { marginTop: 10, fontFamily: v4Font, fontSize: 12.5, fontWeight: "600", color: "#FFFFFF" },
  segment: { flexDirection: "row", backgroundColor: v4.surface, borderWidth: 1, borderColor: v4.border, borderRadius: 12, padding: 3, gap: 3 },
  segmentItem: { flex: 1, minHeight: 44, borderRadius: 9, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingHorizontal: 4 },
  segmentItemOn: { backgroundColor: v4.brand },
  segmentText: { fontFamily: v4Font, fontSize: 12, fontWeight: "600" },
  chip: { minHeight: 44, borderRadius: 999, borderWidth: 1, borderColor: v4.border, backgroundColor: v4.surface, paddingHorizontal: 13, justifyContent: "center" },
  chipOn: { backgroundColor: v4.okBg, borderColor: v4.brandMid },
  chipText: { fontFamily: v4Font, fontSize: 11.5, fontWeight: "600", color: v4.ink2 },
  chipTextOn: { color: v4.brand, fontWeight: "700" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  switchTrack: { width: 46, height: 28, borderRadius: 999, backgroundColor: "#DBD7CD", padding: 3, justifyContent: "center" },
  switchTrackOn: { backgroundColor: v4.brandMid },
  switchThumb: { width: 22, height: 22, borderRadius: 11, backgroundColor: "#FFFFFF", alignSelf: "flex-start" },
  switchThumbOn: { alignSelf: "flex-end" },
  option: { flexDirection: "row", alignItems: "center", gap: 11, borderWidth: 1, borderColor: v4.border, backgroundColor: v4.surface, borderRadius: 14, paddingVertical: 13, paddingHorizontal: 14 },
  optionOn: { borderColor: v4.brandMid, backgroundColor: "#F4FDF8" },
  optionTitle: { fontFamily: v4Font, fontSize: 13.5, fontWeight: "700", color: v4.ink },
  optionSubtitle: { fontFamily: v4Font, fontSize: 11, color: v4.ink2, marginTop: 1 },
  optionRing: { width: 18, height: 18, borderRadius: 9, borderWidth: 1.6, borderColor: v4.border },
  note: { fontFamily: v4Font, fontSize: 11, lineHeight: 16.5, color: v4.ink2 },
  dimmed: { opacity: 0.55 },
  list: { backgroundColor: v4.surface, borderWidth: 1, borderColor: v4.border, borderRadius: 16, overflow: "hidden" },
  listRow: { flexDirection: "row", alignItems: "center", minHeight: 56 },
  listRowDivider: { borderTopWidth: 1, borderTopColor: v4.hairline },
  listRowSelected: { backgroundColor: v4.okBg },
  listRowMain: { flex: 1, flexDirection: "row", alignItems: "center", gap: 11, paddingVertical: 12, paddingLeft: 14, paddingRight: 8 },
  listTile: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  listTitle: { fontFamily: v4Font, fontSize: 13, fontWeight: "600", color: v4.ink },
  listSubtitle: { fontFamily: v4Font, fontSize: 11, color: v4.mut, marginTop: 1 },
  listCaret: { width: 48, alignSelf: "stretch", alignItems: "center", justifyContent: "center" },
  button: { minHeight: 50, borderRadius: 14, backgroundColor: v4.brand, alignItems: "center", justifyContent: "center", paddingHorizontal: 16, flexDirection: "row", gap: 8 },
  buttonGhost: { backgroundColor: v4.surface, borderWidth: 1, borderColor: v4.border },
  buttonDanger: { backgroundColor: v4.error },
  buttonText: { fontFamily: v4Font, fontSize: 14, fontWeight: "800", color: "#FFFFFF" },
  buttonGhostText: { color: v4.ink, fontWeight: "700" },
});
