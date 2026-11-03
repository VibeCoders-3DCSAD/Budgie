import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { dashboardColors as P, dashboardStyles } from "../dashboardAppearance";
import { manilaToday } from "../../../lib/dates";
import { formatPeso } from "../dashboardFormatting";
import { useDashboardReminders } from "../hooks/useDashboardReminders";
import type { DashboardItemTarget, DashboardReminderSection } from "../types";

type Props = { userId: string; reloadKey: string; onOpen: (target: DashboardItemTarget) => void };

export function AttentionUpcoming({ userId, reloadKey, onOpen }: Props) {
  const { data, loading, refresh } = useDashboardReminders(userId, reloadKey);
  return <View style={styles.container}>
    <ReminderSection title="Needs Attention" section={data?.attention} loading={loading} empty="Nothing needs your attention right now." onRetry={refresh} onOpen={onOpen} />
    <ReminderSection title="Upcoming" section={data?.upcoming} loading={loading} empty="No expected income or commitments in the next seven days." onRetry={refresh} onOpen={onOpen} upcoming />
  </View>;
}

export function ReminderSection({ title, section, loading, empty, onRetry, onOpen, upcoming = false, today = manilaToday() }: {
  title: string; section?: DashboardReminderSection; loading: boolean; empty: string; onRetry: () => void; onOpen: Props["onOpen"]; upcoming?: boolean; today?: string;
}) {
  return <View>
    <View style={styles.heading}><Text style={styles.title}>{title}</Text>{loading ? <ActivityIndicator accessibilityLabel={`Loading ${title}`} color="#013220" size="small" /> : null}</View>
    <View style={styles.card}>
      {section?.unavailable ? <View style={styles.message}><Text style={styles.detail}>Some {title.toLowerCase()} information is unavailable.</Text><Pressable accessibilityRole="button" accessibilityLabel={`Retry ${title}`} onPress={onRetry} disabled={loading}><Text style={styles.action}>Try again</Text></Pressable></View> : null}
      {!loading && section && !section.unavailable && section.items.length === 0 ? <Text style={styles.detail}>{empty}</Text> : null}
      {section?.items.map((item, index) => {
        const days = Math.round((Date.parse(`${item.date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
        const date = new Date(`${item.date}T00:00:00+08:00`).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric" });
        return <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`Review ${item.title}`} onPress={() => onOpen(item.target)} style={[styles.row, index > 0 && { borderTopWidth: 1, borderTopColor: P.divider }]}>
          <View style={styles.rowHeading}><Text style={styles.name}>{item.title}</Text><Text style={[styles.amount, upcoming && item.target.kind === "income" ? styles.income : null]}>{formatPeso(item.amountCentavos)}</Text></View>
          <Text style={styles.detail}>{item.detail}</Text>
          <Text style={styles.date}>{date}{upcoming ? ` · ${days === 0 ? "Today" : days === 1 ? "In 1 day" : `In ${days} days`}` : ""}</Text>
          <Text style={styles.action}>{item.target.kind === "observation" ? "Review spending" : "View details"} →</Text>
        </Pressable>;
      })}
      {upcoming ? <Text style={styles.note}>Expected income is not included in your balance until posted.</Text> : null}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  container: { gap: 22, marginTop: 22 },
  heading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  title: dashboardStyles.sectionTitle,
  card: { ...dashboardStyles.card, gap: 10 },
  message: { gap: 8 },
  row: { gap: 6, paddingVertical: 12 },
  rowHeading: { flexDirection: "row", flexWrap: "wrap", alignItems: "baseline", gap: 8 },
  name: { flexGrow: 1, flexShrink: 1, fontFamily: "Manrope", fontWeight: "700", fontSize: 14, color: P.ink },
  amount: { fontFamily: "Manrope", fontWeight: "800", fontSize: 14, color: P.ink },
  income: { color: P.green },
  detail: { fontFamily: "Manrope", fontSize: 13, lineHeight: 19, color: P.secondary },
  date: { fontFamily: "Manrope", fontSize: 12, color: P.secondary },
  action: { fontFamily: "Manrope", fontWeight: "700", fontSize: 13, color: P.green },
  note: { fontFamily: "Manrope", fontSize: 12, lineHeight: 18, color: P.secondary },
});
