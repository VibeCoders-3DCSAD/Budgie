import { centavos, practiceId, synced, type Row, type SeedContext } from "./context";

export const ACCOUNT_IDS = {
  payroll: practiceId("account:payroll"),
  wallet: practiceId("account:wallet"),
  emergency: practiceId("account:emergency-fund"),
  house: practiceId("account:house-deposit"),
  card: practiceId("account:rewards-card"),
};

type AccountSpec = { id: string; name: string; kind: string; institution: string; openingPesos: number; inDashboard: boolean };

const ACCOUNTS: AccountSpec[] = [
  { id: ACCOUNT_IDS.payroll, name: "Payroll Account", kind: "bank", institution: "BPI", openingPesos: 70_000, inDashboard: true },
  { id: ACCOUNT_IDS.wallet, name: "GCash", kind: "e_wallet", institution: "GCash", openingPesos: 2_500, inDashboard: true },
  { id: ACCOUNT_IDS.emergency, name: "Emergency Fund", kind: "savings", institution: "BPI", openingPesos: 210_000, inDashboard: true },
  { id: ACCOUNT_IDS.house, name: "House Deposit Savings", kind: "savings", institution: "Maya", openingPesos: 60_000, inDashboard: true },
  { id: ACCOUNT_IDS.card, name: "Rewards Visa", kind: "credit_card", institution: "BPI", openingPesos: 0, inDashboard: false },
];

export function openingBalances(): Record<string, number> {
  return Object.fromEntries(ACCOUNTS.map((account) => [account.id, centavos(account.openingPesos)]));
}

// current_balance_centavos comes from the replayed ledger (see balances.ts).
export function accountRows(ctx: SeedContext, openedOn: string, balances: Record<string, number>): Row[] {
  return ACCOUNTS.map((account, index) => ({
    ...synced(ctx), id: account.id, name: account.name, kind: account.kind, status: "active",
    opening_balance_centavos: centavos(account.openingPesos), current_balance_centavos: balances[account.id],
    include_in_dashboard_balance: account.inDashboard, institution_name: account.institution,
    opened_on: openedOn, sort_order: index + 1, metadata: { practice: true },
  }));
}

export function savingsAccountDetailRows(ctx: SeedContext): Row[] {
  return [
    { ...synced(ctx), account_id: ACCOUNT_IDS.emergency, account_type: "personal_savings", interest_rate_bps: 25 },
    { ...synced(ctx), account_id: ACCOUNT_IDS.house, account_type: "high_yield_savings", interest_rate_bps: 350 },
  ];
}
