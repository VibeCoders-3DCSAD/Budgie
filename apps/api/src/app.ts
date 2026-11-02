import cors from "cors";
import express from "express";
import type { Request, Response, NextFunction } from "express";
import authRoutes from "./routes/auth.js";
import meRoutes from "./routes/me.js";
import consentRoutes from "./routes/consents.js";
import dataExportRoutes from "./routes/data-export-requests.js";
import accountDeletionRoutes from "./routes/account-deletion-requests.js";
import onboardingRoutes from "./routes/onboarding.js";
import onboardingPreferenceRoutes from "./routes/onboarding-preferences.js";
import financialClassificationRoutes from "./routes/financial-classification.js";
import syncRoutes from "./routes/sync.js";
import recurringRoutes from "./routes/recurring.js";
import forecastRoutes from "./routes/forecast.js";
import financialPlanRoutes from "./routes/financial-plans.js";

const app = express();
app.disable("etag");

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "1mb" }));

app.use((request: Request, response: Response, next: NextFunction) => {
  const start = Date.now();
  response.on("finish", () => {
    console.log(
      `${request.method} ${request.originalUrl} → ${response.statusCode} (${Date.now() - start}ms)`,
    );
  });
  next();
});

app.get("/health", (_request: Request, response: Response) => {
  response.status(200).json({
    service: "odin-api",
    status: "ok",
    timestamp: new Date().toISOString(),
  });
});

app.get("/", (_request: Request, response: Response) => {
  response.status(200).json({
    message: "Odin API is running.",
  });
});

app.use("/odin/api/auth", authRoutes);
app.use("/odin/api/me", meRoutes);
app.use("/odin/api/consents", consentRoutes);
app.use("/odin/api", dataExportRoutes);
app.use("/odin/api", accountDeletionRoutes);
app.use("/odin/api", onboardingRoutes);
app.use("/odin/api", onboardingPreferenceRoutes);
app.use("/odin/api", financialClassificationRoutes);
app.use("/odin/api/sync", syncRoutes);
app.use("/odin/api/recurring", recurringRoutes);
app.use("/odin/api/forecast", forecastRoutes);
app.use("/odin/api/financial-plans", financialPlanRoutes);

app.use((error: Error, request: Request, response: Response, _next: NextFunction) => {
  const parseError = error as Error & { type?: string };

  if (parseError.type === "entity.parse.failed" || error instanceof SyntaxError) {
    response.status(400).json({
      error: "Bad Request",
      message: "Invalid JSON in request body",
    });
    return;
  }

  console.error("Unhandled error", {
    method: request.method,
    route: request.originalUrl,
    request_id: request.header("x-request-id")?.slice(0, 128) ?? null,
    user_id: (request as Request & { userId?: string }).userId ?? null,
    error,
  });
  response.status(500).json({
    error: "Internal Server Error",
    message: "An unexpected error occurred",
  });
});

export default app;
