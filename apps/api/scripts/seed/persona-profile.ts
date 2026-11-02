import type { SupabaseClient } from "@supabase/supabase-js";
import { demoPersonas, type DemoPersona } from "./personas.js";
import { seedMarker } from "./history.js";

// Demo onboarding is explicit so a newly created persona opens the app dashboard on first login.
export async function provisionPersonaProfile(supabase: SupabaseClient, userId: string, persona: DemoPersona) {
  const config = demoPersonas[persona];
  const completedAt = new Date().toISOString();
  const { error: profileError } = await supabase.from("profiles").update({ display_name: config.name, onboarding_completed_at: completedAt }).eq("user_id", userId);
  if (profileError) throw new Error(`Could not prepare demo profile: ${profileError.message}`);
  const { data: existing, error: lookupError } = await supabase.from("onboarding_sessions").select("id").eq("user_id", userId)
    .eq("metadata->>dummy_data_source", seedMarker).order("started_at", { ascending: false }).limit(1).maybeSingle();
  if (lookupError) throw new Error(`Could not find demo onboarding: ${lookupError.message}`);
  const row = {
    user_id: userId, status: "submitted", submitted_at: completedAt,
    raw_answers: {
      display_name: config.name, date_of_birth: persona === "seasonal-mom" ? "1989-05-12" : persona === "family-breadwinner" ? "1998-03-04" : "1995-08-20",
      monthly_income: String(config.salary), monthly_deductions: ["none"], monthly_deduction_amounts: {},
      emergency_savings_runway: persona === "healthy-worker" ? "3_to_6_months" : "less_than_1_month",
      liquid_emergency_savings: persona === "healthy-worker" ? "210000" : "0",
      monthly_essential_living_costs: String(config.living), paying_off_debt: persona === "debt-burdened" ? "true" : "false",
      monthly_debt_payments: persona === "debt-burdened" ? "15000" : "0", credit_card_payment_behavior: "no_credit_card",
      high_expense_seasons: persona === "seasonal-mom" ? ["q1", "q2"] : ["none"],
      low_expense_seasons: persona === "seasonal-mom" ? ["q3", "q4"] : ["none"],
      saving_seasons: persona === "seasonal-mom" ? ["q3", "q4"] : ["none"],
      // The breadwinner's parents depend on the remittance, so it is protected from plan cuts.
      ...(persona === "family-breadwinner" ? { has_dependents: true, protected_categories: ["dependents_elderly"], protected_category_costs: { dependents_elderly: "36000" } } : {}),
    },
    metadata: { dummy_data_source: seedMarker, demo_persona: persona },
  };
  const result = existing
    ? await supabase.from("onboarding_sessions").update(row).eq("id", existing.id).eq("user_id", userId)
    : await supabase.from("onboarding_sessions").insert(row);
  if (result.error) throw new Error(`Could not prepare demo onboarding: ${result.error.message}`);
}
