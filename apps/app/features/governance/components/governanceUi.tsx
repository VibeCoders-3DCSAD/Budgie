import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { Check, Info, type Icon } from "phosphor-react-native";

// Building blocks for the Data and privacy screens (screens v5: export data, delete account), drawn
// with the v3 palette the design uses for these states.

const FONT = "Manrope";

export const privacyTones = {
  ink: "#1B1C1A",
  ink2: "#414942",
  outline: "#414942",
  divider: "#DBD7CD",
  surface: "#FFFFFF",
  brand: "#013220",
  danger: "#8A0000",
  okWash: "#E9F6EF",
  okInk: "#004D1B",
  errWash: "#FCEDEF",
  errInk: "#8A0000",
  warnWash: "#FDF3E7",
  warnInk: "#722C00",
  greyWash: "#EFEBE3",
} as const;

const tiles = {
  green: { bg: privacyTones.okWash, fg: privacyTones.okInk },
  red: { bg: privacyTones.errWash, fg: privacyTones.errInk },
  grey: { bg: privacyTones.greyWash, fg: privacyTones.ink2 },
} as const;

export type TileTone = keyof typeof tiles;

// Uppercase heading above a list (b-slabel).
export function GroupLabel({ children }: { children: string }) {
  return (
    <Text accessibilityRole="header" style={{ fontFamily: FONT, fontSize: 11, fontWeight: "700", letterSpacing: 0.6, textTransform: "uppercase", color: privacyTones.ink2, marginBottom: -3 }}>
      {children}
    </Text>
  );
}

// A white, outlined group of rows (b-list).
export function ListCard({ children }: { children: ReactNode }) {
  return (
    <View style={{ borderWidth: 1, borderColor: privacyTones.outline, borderRadius: 16, overflow: "hidden", backgroundColor: privacyTones.surface }}>
      {children}
    </View>
  );
}

const rowValueColors = { ink: privacyTones.ink, mut: privacyTones.ink2, err: privacyTones.errInk } as const;

export type RowValueTone = keyof typeof rowValueColors;

// One row of a ListCard (b-li), with an optional tinted icon tile and a right-hand value (b-li-rv).
export function ListRow({ icon: RowIcon, tone = "green", title, subtitle, value, valueTone = "ink", divider = false }: {
  icon?: Icon;
  tone?: TileTone;
  title: string;
  subtitle?: string;
  value?: string;
  valueTone?: RowValueTone;
  divider?: boolean;
}) {
  const tile = tiles[tone];
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 11, paddingVertical: 12, paddingHorizontal: 14, borderTopWidth: divider ? 1 : 0, borderTopColor: privacyTones.divider }}>
      {RowIcon ? (
        <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: tile.bg, alignItems: "center", justifyContent: "center" }}>
          <RowIcon size={17} color={tile.fg} />
        </View>
      ) : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ fontFamily: FONT, fontSize: 13, fontWeight: "600", color: privacyTones.ink }}>{title}</Text>
        {subtitle ? <Text numberOfLines={1} style={{ fontFamily: FONT, fontSize: 11, color: privacyTones.ink2, marginTop: 1 }}>{subtitle}</Text> : null}
      </View>
      {value ? <Text style={{ fontFamily: FONT, fontSize: 12.5, fontWeight: "700", color: rowValueColors[valueTone] }}>{value}</Text> : null}
    </View>
  );
}

export type ButtonVariant = "primary" | "ghost" | "danger";

const buttonColors: Record<ButtonVariant, { bg: string; fg: string; border?: string }> = {
  primary: { bg: privacyTones.brand, fg: "#FFFFFF" },
  ghost: { bg: privacyTones.surface, fg: privacyTones.ink, border: privacyTones.outline },
  danger: { bg: privacyTones.danger, fg: "#FFFFFF" },
};

// A full-width action (b-btn). Disabled and busy buttons fade to half opacity and ignore presses; a busy one
// shows only a spinner. A dimmed button fades the same way but still answers presses, so an offline tap can
// explain itself with a toast (the design's offline states).
export function ActionButton({ label, onPress, variant = "primary", icon: ButtonIcon, busy = false, disabled = false, dimmed = false }: {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  icon?: Icon;
  busy?: boolean;
  disabled?: boolean;
  dimmed?: boolean;
}) {
  const colors = buttonColors[variant];
  const inactive = disabled || busy;
  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: inactive || dimmed, busy }}
      style={{
        minHeight: 50, borderRadius: 12, paddingHorizontal: 16,
        flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
        backgroundColor: colors.bg, borderWidth: colors.border ? 1 : 0, borderColor: colors.border,
        opacity: inactive || dimmed ? 0.5 : 1,
      }}
    >
      {busy ? <ActivityIndicator color={colors.fg} /> : (
        <>
          {ButtonIcon ? <ButtonIcon size={17} color={colors.fg} /> : null}
          <Text style={{ fontFamily: FONT, fontSize: 14, fontWeight: variant === "ghost" ? "700" : "800", color: colors.fg }}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

// A warning line at the top of a page (b-banner.warn), such as the offline notice.
export function WarnBanner({ children }: { children: string }) {
  return (
    <View accessibilityLiveRegion="polite" style={{ flexDirection: "row", alignItems: "flex-start", gap: 9, borderRadius: 14, paddingVertical: 11, paddingHorizontal: 13, backgroundColor: privacyTones.warnWash }}>
      <Info size={16} color={privacyTones.warnInk} />
      <Text style={{ flex: 1, fontFamily: FONT, fontSize: 11.5, lineHeight: 16.7, fontWeight: "500", color: privacyTones.ink2 }}>{children}</Text>
    </View>
  );
}

// A tinted status card with a title and a line of text (b-card.ok / b-card.err).
export function StatusCard({ tone, title, children, leading }: { tone: "ok" | "err"; title: string; children: string; leading?: ReactNode }) {
  return (
    <View
      accessibilityLiveRegion="polite"
      accessibilityRole={tone === "err" ? "alert" : undefined}
      style={{
        borderWidth: 1, borderColor: privacyTones.outline, borderRadius: 16, paddingVertical: 14, paddingHorizontal: 15, gap: 9,
        backgroundColor: tone === "ok" ? privacyTones.okWash : privacyTones.errWash,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        {leading}
        <Text style={{ fontFamily: FONT, fontSize: 13.5, fontWeight: "700", color: privacyTones.ink, flex: 1 }}>{title}</Text>
      </View>
      <Text style={{ fontFamily: FONT, fontSize: 12.5, lineHeight: 18.75, color: privacyTones.ink2 }}>{children}</Text>
    </View>
  );
}

// A tinted hint with a link-style action (b-nudge.info).
export function Nudge({ icon: NudgeIcon, title, body, actionLabel, onAction }: {
  icon: Icon;
  title: string;
  body: string;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <View style={{ flexDirection: "row", gap: 11, borderRadius: 14, paddingVertical: 13, paddingHorizontal: 14, backgroundColor: privacyTones.okWash }}>
      <View style={{ marginTop: 1 }}><NudgeIcon size={16} color={privacyTones.brand} /></View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: FONT, fontSize: 12.5, fontWeight: "700", color: privacyTones.ink, marginBottom: 2 }}>{title}</Text>
        <Text style={{ fontFamily: FONT, fontSize: 12, lineHeight: 17.4, color: privacyTones.ink2 }}>{body}</Text>
        <Pressable onPress={onAction} accessibilityRole="button" accessibilityLabel={actionLabel} hitSlop={10} style={{ alignSelf: "flex-start", marginTop: 6 }}>
          <Text style={{ fontFamily: FONT, fontSize: 12, fontWeight: "700", color: privacyTones.brand }}>{actionLabel}</Text>
        </Pressable>
      </View>
    </View>
  );
}

// An acknowledgement checkbox on a tinted row (b-check).
export function CheckRow({ checked, onToggle, label }: { checked: boolean; onToggle: () => void; label: string }) {
  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={label}
      style={{ flexDirection: "row", alignItems: "flex-start", gap: 10, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 13, backgroundColor: privacyTones.okWash }}
    >
      <View style={{
        width: 19, height: 19, borderRadius: 6, marginTop: 1, borderWidth: 1.6,
        borderColor: checked ? privacyTones.okInk : privacyTones.outline,
        backgroundColor: checked ? privacyTones.okInk : "transparent",
        alignItems: "center", justifyContent: "center",
      }}>
        {checked ? <Check size={12} color="#FFFFFF" weight="bold" /> : null}
      </View>
      <Text style={{ flex: 1, fontFamily: FONT, fontSize: 12, lineHeight: 17.4, color: privacyTones.ink2 }}>{label}</Text>
    </Pressable>
  );
}

// A centred icon in a dashed circle with a title and a short explanation (b-emptyill).
export function Illustration({ icon: IllustrationIcon, title, children }: { icon: Icon; title: string; children: ReactNode }) {
  return (
    <View style={{ alignItems: "center", paddingVertical: 26, paddingHorizontal: 18 }}>
      <View style={{ width: 96, height: 96, borderRadius: 48, borderWidth: 1.5, borderStyle: "dashed", borderColor: privacyTones.outline, alignItems: "center", justifyContent: "center", marginBottom: 14 }}>
        <IllustrationIcon size={34} color={privacyTones.ink2} />
      </View>
      <Text accessibilityRole="header" style={{ fontFamily: FONT, fontSize: 15, fontWeight: "700", color: privacyTones.ink, marginBottom: 4, textAlign: "center" }}>{title}</Text>
      <Text style={{ fontFamily: FONT, fontSize: 12, lineHeight: 18, color: privacyTones.ink2, maxWidth: 230, textAlign: "center" }}>{children}</Text>
    </View>
  );
}

// A label on the left and a bold value on the right in an outlined box ("Scheduled deletion  Sep 27, 2026").
export function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, borderWidth: 1, borderColor: privacyTones.outline, borderRadius: 16, paddingVertical: 14, paddingHorizontal: 15, backgroundColor: privacyTones.surface }}>
      <Text style={{ fontFamily: FONT, fontSize: 12.5, color: privacyTones.ink2 }}>{label}</Text>
      <Text style={{ fontFamily: FONT, fontSize: 13, fontWeight: "700", color: privacyTones.ink, fontVariant: ["tabular-nums"] }}>{value}</Text>
    </View>
  );
}

// The vertical rhythm of the design's page body (ph-body: 11px between blocks).
export function PageStack({ children }: { children: ReactNode }) {
  return <View style={{ gap: 11, paddingTop: 6, paddingBottom: 16 }}>{children}</View>;
}

// "Dec 1, 2026", or the fallback when there is no date.
export function formatShortDate(value: string | null | undefined, fallback = "Not scheduled"): string {
  if (!value) return fallback;
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
