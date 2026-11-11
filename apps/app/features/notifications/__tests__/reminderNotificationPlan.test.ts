import type { DashboardReminder, DashboardReminders } from "../../dashboard/types";
import { MAX_SCHEDULED_REMINDERS, planReminderNotifications } from "../reminderNotificationPlan";

const item = (overrides: Partial<DashboardReminder> = {}): DashboardReminder => ({
  id: "debt:loan:2026-11-14", title: "Car loan", detail: "Debt repayment", amountCentavos: 1_250_00,
  date: "2026-11-14", target: { kind: "debt", id: "loan" }, ...overrides,
});
const reminders = (attention: DashboardReminder[], upcoming: DashboardReminder[]): DashboardReminders => ({
  attention: { items: attention, unavailable: false }, upcoming: { items: upcoming, unavailable: false },
});
const beforeNine = new Date("2026-11-11T08:00:00+08:00");
const afterNine = new Date("2026-11-11T10:00:00+08:00");

describe("planReminderNotifications", () => {
  it("notifies an upcoming item at 9 AM Manila the day before and on the due date", () => {
    const planned = planReminderNotifications(reminders([], [item()]), beforeNine);
    expect(planned.map((n) => [n.title, n.fireAt.toISOString()])).toEqual([
      ["Car loan is due tomorrow", "2026-11-13T01:00:00.000Z"],
      ["Car loan is due today", "2026-11-14T01:00:00.000Z"],
    ]);
    expect(planned[0]).toMatchObject({ body: "Debt repayment", target: { kind: "debt", id: "loan" } });
  });

  it("never puts an amount on the lock screen", () => {
    const planned = planReminderNotifications(reminders([item({ id: "observation:t1" })], [item()]), beforeNine);
    for (const n of planned) expect(`${n.title} ${n.body}`).not.toMatch(/₱|1,250|1250/);
  });

  it("says expected for income", () => {
    const income = item({ id: "income:salary:2026-11-12", title: "Salary", date: "2026-11-12", target: { kind: "income", id: "salary" } });
    expect(planReminderNotifications(reminders([], [income]), beforeNine).map((n) => n.title))
      .toEqual(["Salary is expected tomorrow", "Salary is expected today"]);
  });

  it("drops times that have already passed", () => {
    const dueToday = item({ id: "debt:loan:2026-11-11", date: "2026-11-11" });
    expect(planReminderNotifications(reminders([], [dueToday]), beforeNine).map((n) => n.title)).toEqual(["Car loan is due today"]);
    expect(planReminderNotifications(reminders([], [dueToday]), afterNine)).toEqual([]);
  });

  it("repeats a Needs Attention item each morning for a week, starting today before 9 AM", () => {
    const planned = planReminderNotifications(reminders([item({ id: "biller:b1:2026-11-10", title: "Meralco" })], []), beforeNine);
    expect(planned).toHaveLength(7);
    expect(planned[0]!).toMatchObject({ title: "Needs attention: Meralco", fireAt: new Date("2026-11-11T09:00:00+08:00") });
    expect(planned[6]!.fireAt).toEqual(new Date("2026-11-17T09:00:00+08:00"));
  });

  it("starts Needs Attention tomorrow once today's 9 AM has passed", () => {
    const planned = planReminderNotifications(reminders([item({ id: "observation:t1" })], []), afterNine);
    expect(planned[0]!.fireAt).toEqual(new Date("2026-11-12T09:00:00+08:00"));
  });

  it("keeps the earliest notifications under the iOS pending limit", () => {
    const many = Array.from({ length: 20 }, (_, index) => item({ id: `observation:t${index}` }));
    const planned = planReminderNotifications(reminders(many, []), beforeNine);
    expect(planned).toHaveLength(MAX_SCHEDULED_REMINDERS);
    expect(planned.at(-1)!.fireAt <= new Date("2026-11-13T09:00:00+08:00")).toBe(true);
  });

  it("gives every notification a distinct reminder identifier", () => {
    const planned = planReminderNotifications(reminders([item({ id: "observation:t1" })], [item()]), beforeNine);
    const ids = planned.map((n) => n.identifier);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id.startsWith("reminder:")).toBe(true);
  });
});
