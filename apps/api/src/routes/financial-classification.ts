import { Router } from "express";
import type { Response } from "express";

import { requireAuth } from "../middleware/auth.js";
import type { AuthenticatedRequest } from "../middleware/auth.js";
import { loggableError } from "../lib/errorLog.js";
import { getServiceRoleClient } from "../lib/supabase.js";
import { createFinancialConditionAssessment } from "../services/classification/financialConditionAssessmentService.js";

const router = Router();

router.post("/financial-classification/v2/assess", requireAuth, async (request: AuthenticatedRequest, response: Response) => {
  const userId = request.userId!;
  const assessment = await createFinancialConditionAssessment(userId, getServiceRoleClient());
  // The service logs which stage failed.
  if (!assessment) {
    response.status(500).json({ error: "Internal Server Error", message: "Failed to save financial classification." });
    return;
  }

  response.status(200).json({ payload: { assessment } });
});

router.get("/financial-classification/v2/latest", requireAuth, async (request: AuthenticatedRequest, response: Response) => {
  const { data, error } = await request.supabase!
    .from("financial_condition_assessments")
    .select("id, assessed_at, rule_set_version, output_snapshot")
    .eq("user_id", request.userId!)
    .order("assessed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("[financial-classification] latest assessment fetch failed", { user_id: request.userId, error: loggableError(error) });
    response.status(500).json({ error: "Internal Server Error", message: "Failed to fetch financial classification." });
    return;
  }
  response.status(200).json({ payload: { assessment: data } });
});

export default router;
