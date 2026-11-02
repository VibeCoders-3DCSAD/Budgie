import { Router } from "express";
import type { Response } from "express";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth.js";
import { savedSeasonalPreferences } from "../services/onboarding/seasonalAnswers.js";
import { seasonalPreferencesError } from "@odin/spending-insights/seasons.js";

const router = Router();

router.get("/onboarding/preferences", requireAuth, async (request: AuthenticatedRequest, response: Response) => {
  const userId = request.userId!;
  const { data: session, error } = await request.supabase!
    .from("onboarding_sessions")
    .select("raw_answers, submitted_at")
    .eq("user_id", userId)
    .eq("status", "submitted")
    .order("submitted_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("saved seasonal preferences fetch failed", { user_id: userId, error });
    response.status(500).json({ error: "Internal Server Error", message: "Unable to load saved seasonal preferences." });
    return;
  }
  response.status(200).json({ payload: { preferences: session ? savedSeasonalPreferences(session.raw_answers) : null, submitted_at: session?.submitted_at ?? null } });
});

router.patch("/onboarding/preferences", requireAuth, async (request: AuthenticatedRequest, response: Response) => {
  const userId = request.userId!;
  const payload = request.body?.payload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload) || Object.keys(payload).some((key) => key !== "preferences")) {
    response.status(400).json({ message: "Only seasonal preferences can be changed here." });
    return;
  }
  const validationError = seasonalPreferencesError(payload.preferences);
  if (validationError) { response.status(400).json({ message: validationError }); return; }
  const preferences = savedSeasonalPreferences(payload.preferences);
  const supabase = request.supabase!;
  const { data: session, error: fetchError } = await supabase.from("onboarding_sessions")
    .select("id, raw_answers, submitted_at").eq("user_id", userId).eq("status", "submitted")
    .order("submitted_at", { ascending: false }).limit(1).maybeSingle();
  if (fetchError) {
    console.error("seasonal preferences save lookup failed", { user_id: userId, error: fetchError });
    response.status(500).json({ message: "Unable to save preferences. Please try again." });
    return;
  }
  if (!session) { response.status(404).json({ message: "Submit your questionnaire before editing preferences." }); return; }
  // Submitted classification inputs stay intact; this endpoint accepts seasonal keys only.
  const { data: updated, error: updateError } = await supabase.from("onboarding_sessions")
    .update({ raw_answers: { ...session.raw_answers, ...preferences } })
    .eq("id", session.id).eq("user_id", userId).eq("status", "submitted")
    .select("raw_answers, submitted_at").maybeSingle();
  if (updateError) {
    console.error("seasonal preferences save failed", { user_id: userId, session_id: session.id, error: updateError });
    response.status(500).json({ message: "Unable to save preferences. Please try again." });
    return;
  }
  if (!updated) { response.status(409).json({ message: "Your questionnaire changed. Reload preferences and try again." }); return; }
  response.status(200).json({ payload: { preferences: savedSeasonalPreferences(updated.raw_answers), submitted_at: updated.submitted_at } });
});

export default router;
