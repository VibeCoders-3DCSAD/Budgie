import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { CaretRight, House, Receipt, Users } from "phosphor-react-native";
import { AmountHero, Banner, Chip, styles as ui, v4, v4Font } from "../../components/BudgieForm";
import { useToast } from "../../components/Toast";
import { LocalDbError } from "../../local-db/helpers";
import { listFinancialAccounts, type FinancialAccount } from "../../local-db/repositories/foundations/financialFoundations";
import {
  deleteScheduledPayment, listScheduledPaymentSummaries, postDueScheduledPayments, recordScheduledPayment, setScheduledPaymentAutoPost,
  type ScheduledPaymentSummary,
} from "../../local-db/repositories/scheduled-payments/scheduledPayments";
import { listCategories, listSubcategories } from "../../local-db/repositories/ledger/taxonomy";
import { AutoPostSheet, DeleteConfirmDialog, RowMenuSheet } from "./components/ScheduledPaymentActions";
import { dueThisMonthCentavos, formatPeso, isDueSoon, rowSubtitle } from "./presentation";
import { manilaToday } from "../../lib/dates";

type Filter = "all" | "due_soon" | "auto_post" | "archived";
type Props = { userId: string; deviceId: string; syncVersion: number; onAdd: () => void; onEdit: (id: string) => void; onOpen: (id: string) => void; onSyncRequested: () => void };
type CategoryInfo = { label: string; slug: string };

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" }, { key: "due_soon", label: "Due soon" }, { key: "auto_post", label: "Auto-post" }, { key: "archived", label: "Archived" },
];

const FILTERED_EMPTY: Record<Exclude<Filter, "all">, [string, string]> = {
  due_soon: ["No payments are due soon", "Nothing falls in the next 3 days. Tap All to see every payment."],
  auto_post: ["No payments auto-post", "Turn on auto-post for a payment and Budgie records it on the due date."],
  archived: ["No archived payments", "Archived payments keep their history but stay out of your plan."],
};

function tileFor(slug: string) {
  if (slug.includes("housing")) return { bg: v4.brand, Icon: House };
  if (slug.includes("utilit") || slug.includes("communication") || slug.includes("bill")) return { bg: "#0F6CBD", Icon: Receipt };
  if (slug.includes("family") || slug.includes("support") || slug.includes("remit")) return { bg: "#AF6319", Icon: Users };
  return { bg: v4.ink2, Icon: Receipt };
}

export default function BillersScreen({ userId, deviceId, syncVersion, onAdd, onEdit, onOpen, onSyncRequested }: Props) {
  const { showToast } = useToast();
  const [filter, setFilter] = useState<Filter>("all");
  const [payments, setPayments] = useState<ScheduledPaymentSummary[] | null>(null);
  const [archived, setArchived] = useState<ScheduledPaymentSummary[]>([]);
  const [categories, setCategories] = useState<Map<string, CategoryInfo>>(new Map());
  const [accounts, setAccounts] = useState<FinancialAccount[]>([]);
  const [failed, setFailed] = useState(false);
  const [menuFor, setMenuFor] = useState<ScheduledPaymentSummary | null>(null);
  const [autoPostFor, setAutoPostFor] = useState<ScheduledPaymentSummary | null>(null);
  const [deleting, setDeleting] = useState<ScheduledPaymentSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const today = manilaToday();
  // The shell passes a new callback on every render; reading it through a ref keeps load stable.
  const requestSync = useRef(onSyncRequested);
  requestSync.current = onSyncRequested;

  const load = useCallback(async () => {
    setFailed(false);
    try {
      if (await postDueScheduledPayments(userId, deviceId) > 0) requestSync.current();
      const [active, archivedPayments, loadedCategories, subcategories, loadedAccounts] = await Promise.all([
        listScheduledPaymentSummaries(userId), listScheduledPaymentSummaries(userId, "archived"), listCategories(userId), listSubcategories(userId, undefined, "expense"), listFinancialAccounts(userId),
      ]);
      const categoryById = new Map(loadedCategories.map((category) => [category.id, category]));
      setCategories(new Map(subcategories.map((subcategory) => {
        const parent = subcategory.category_id ? categoryById.get(subcategory.category_id) : undefined;
        return [subcategory.id, { label: parent?.label ?? subcategory.label, slug: `${parent?.slug ?? ""} ${subcategory.slug}`.toLowerCase() }];
      })));
      setPayments(active);
      setArchived(archivedPayments);
      setAccounts(loadedAccounts);
    } catch (error) {
      console.error("[SCHEDULED-PAYMENTS] load failed", error);
      setFailed(true);
    }
  }, [userId, deviceId]);

  useEffect(() => { load(); }, [load, syncVersion]);

  const visible = useMemo(() => {
    if (filter === "archived") return archived;
    const list = payments ?? [];
    if (filter === "due_soon") return list.filter((payment) => isDueSoon(payment.current, today));
    if (filter === "auto_post") return list.filter((payment) => payment.autoPost);
    return list;
  }, [filter, payments, archived, today]);

  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    try {
      await action();
      showToast(success, "success");
      requestSync.current();
      await load();
    } catch (error) {
      showToast(error instanceof LocalDbError ? error.message : "Your obligation data could not be loaded or saved. Try again.");
    } finally {
      setBusy(false);
    }
  }

  function postNow(payment: ScheduledPaymentSummary) {
    setMenuFor(null);
    const current = payment.current;
    if (!current) return;
    run(() => recordScheduledPayment(userId, deviceId, { scheduledPaymentId: payment.id, occurrenceDate: current.dueDate, amountCentavos: current.remainingCentavos, paymentDate: today, sourceAccountId: payment.sourceAccountId, notes: null }), `${formatPeso(current.remainingCentavos)} recorded for ${payment.name}.`);
  }

  function toggleAutoPost(payment: ScheduledPaymentSummary) {
    const next = !payment.autoPost;
    setAutoPostFor({ ...payment, autoPost: next });
    run(() => setScheduledPaymentAutoPost(userId, deviceId, payment.id, next), `Auto-post is ${next ? "on" : "off"} for ${payment.name}.`);
  }

  const activePayments = payments ?? [];
  const header = (
    <AmountHero
      label="DUE THIS MONTH"
      amountCentavos={dueThisMonthCentavos(activePayments, today)}
      detail={`${activePayments.length} ${activePayments.length === 1 ? "biller or remittance" : "billers and remittances"}`}
    />
  );

  function emptyState(title: string, body: string, action?: { label: string; onPress: () => void }) {
    return (
      <View style={{ alignItems: "center", paddingVertical: 34, paddingHorizontal: 20, gap: 8 }}>
        <Text style={{ fontFamily: v4Font, fontSize: 15, fontWeight: "700", color: v4.ink, textAlign: "center" }}>{title}</Text>
        <Text style={[ui.note, { textAlign: "center", maxWidth: 260 }]}>{body}</Text>
        {action ? <Pressable onPress={action.onPress} accessibilityRole="button" style={[ui.button, { alignSelf: "stretch", marginTop: 14 }]}><Text style={ui.buttonText}>{action.label}</Text></Pressable> : null}
      </View>
    );
  }

  if (failed) {
    return (
      <View style={{ gap: 14 }}>
        <Banner tone="error">Budgie cannot read your billers and remittances.</Banner>
        {header}
        {emptyState("Nothing loaded", "Close Budgie and open it again. Your data stays on this phone.", { label: "Try again", onPress: load })}
      </View>
    );
  }

  if (payments === null) {
    return (
      <View style={{ gap: 14 }}>
        {header}
        <View style={{ alignItems: "center", paddingVertical: 30, gap: 10 }}><ActivityIndicator color={v4.brand} /><Text style={ui.note}>Loading your billers and remittances…</Text></View>
      </View>
    );
  }

  if (payments.length === 0 && archived.length === 0) {
    return (
      <View style={{ gap: 14 }}>
        {header}
        {emptyState("No billers or remittances yet", "Add rent, a bill or a contribution. Budgie deducts it from your budget on the due date.", { label: "Add a biller or remittance", onPress: onAdd })}
      </View>
    );
  }

  return (
    <View style={{ gap: 14 }}>
      {header}
      <View style={ui.card}>
        <View style={ui.chips}>{FILTERS.map((option) => <Chip key={option.key} label={option.label} selected={filter === option.key} onPress={() => setFilter(option.key)} />)}</View>
      </View>
      {visible.length === 0 ? emptyState(...FILTERED_EMPTY[filter as Exclude<Filter, "all">]) : (
        <View style={ui.list}>
          {visible.map((payment, index) => {
            const category = (payment.subcategoryId ? categories.get(payment.subcategoryId) : undefined) ?? { label: "Uncategorized", slug: "" };
            const tile = tileFor(category.slug);
            const overdue = payment.current?.status === "overdue";
            return (
              <Pressable key={payment.id} onPress={() => onOpen(payment.id)} onLongPress={() => payment.status === "active" && setMenuFor(payment)} accessibilityRole="button" accessibilityLabel={payment.name} accessibilityHint="Opens the payment. Long press for actions." style={[ui.listRow, index > 0 ? ui.listRowDivider : null]}>
                <View style={ui.listRowMain}>
                  <View style={[ui.listTile, { backgroundColor: tile.bg }]}><tile.Icon color="#FFFFFF" size={17} weight="bold" /></View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text numberOfLines={1} style={ui.listTitle}>{payment.name}</Text>
                    <Text numberOfLines={1} style={[ui.listSubtitle, overdue ? { color: v4.error } : null]}>{payment.status === "archived" ? `${category.label} · Archived` : rowSubtitle(category.label, payment, payment.current, today)}</Text>
                  </View>
                  <Text style={{ fontFamily: v4Font, fontSize: 12.5, fontWeight: "700", color: overdue ? v4.error : v4.ink, fontVariant: ["tabular-nums"] }}>{formatPeso(payment.amountCentavos)}</Text>
                </View>
                <View style={[ui.listCaret, { width: 32 }]}><CaretRight color={v4.mut} size={15} weight="bold" /></View>
              </Pressable>
            );
          })}
        </View>
      )}
      {filter !== "archived" ? <Pressable onPress={onAdd} accessibilityRole="button" style={[ui.button, ui.buttonGhost]}><Text style={[ui.buttonText, ui.buttonGhostText]}>Add a biller or remittance</Text></Pressable> : null}

      <RowMenuSheet
        payment={menuFor}
        onClose={() => setMenuFor(null)}
        onPostNow={() => menuFor && postNow(menuFor)}
        onAutoPost={() => { setAutoPostFor(menuFor); setMenuFor(null); }}
        onEdit={() => { const id = menuFor?.id; setMenuFor(null); if (id) onEdit(id); }}
        onDelete={() => { setDeleting(menuFor); setMenuFor(null); }}
      />
      <AutoPostSheet payment={autoPostFor} accountName={accounts.find((account) => account.id === autoPostFor?.sourceAccountId)?.name ?? "—"} busy={busy} onToggle={() => autoPostFor && toggleAutoPost(autoPostFor)} onClose={() => setAutoPostFor(null)} />
      <DeleteConfirmDialog
        name={deleting?.name ?? null}
        onCancel={() => setDeleting(null)}
        onConfirm={() => { const target = deleting; setDeleting(null); if (target) run(() => deleteScheduledPayment(userId, deviceId, target.id), `${target.name} was deleted. Past transactions stay.`); }}
      />
    </View>
  );
}
