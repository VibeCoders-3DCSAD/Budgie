import cors from "cors";
import express from "express";
import { STATUS_CODES } from "node:http";
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

type HttpError = Error & { type?: string; status?: unknown; statusCode?: unknown; expose?: unknown; length?: unknown; limit?: unknown };

// body-parser/http-errors mark client errors that are safe to report with `expose`; only the status is reused.
function exposedClientStatus(error: HttpError): number | null {
  const status = typeof error.status === "number" ? error.status : error.statusCode;
  if (error.expose !== true || typeof status !== "number") return null;
  if (status < 400 || status > 499) return null;
  return status;
}

app.use((error: Error, request: Request, response: Response, _next: NextFunction) => {
  const parseError = error as HttpError;

  if (parseError.type === "entity.too.large") {
    // express.json runs before auth, so no user is known yet; body-parser sets `length` and `limit` in bytes.
    console.warn("Request body too large", {
      method: request.method,
      path: request.originalUrl,
      contentLength: request.headers["content-length"],
      length: parseError.length,
      limit: parseError.limit,
    });
    response.status(413).json({
      error: "Payload Too Large",
      message: "Request body is too large",
    });
    return;
  }

  if (parseError.type === "entity.parse.failed" || error instanceof SyntaxError) {
    response.status(400).json({
      error: "Bad Request",
      message: "Invalid JSON in request body",
    });
    return;
  }

  const clientStatus = exposedClientStatus(parseError);
  if (clientStatus !== null) {
    response.status(clientStatus).json({
      error: STATUS_CODES[clientStatus] ?? "Bad Request",
      message: "The request could not be processed",
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
