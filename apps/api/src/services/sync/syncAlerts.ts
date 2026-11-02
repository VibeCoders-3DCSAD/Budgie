import { normalizeRecurrenceMonths } from "@odin/spending-insights/recurringMonths.js";
import { SYNC_RPCS } from "./constants/entities.js";
import {
  ALERT_PREFERENCE_CREATE_FIELDS,
  ALERT_PREFERENCE_UPDATE_FIELDS,
  ALERT_SUPPRESSION_CREATE_FIELDS,
  ALERT_SUPPRESSION_UPDATE_FIELDS,
  ANOMALY_EVALUATION_CREATE_FIELDS,
  ANOMALY_EVALUATION_UPDATE_FIELDS,
  ANOMALY_RECURRENCES,
  ANOMALY_WHITELIST_CREATE_FIELDS,
  ANOMALY_WHITELIST_UPDATE_FIELDS,
} from "./constants/alerts.js";
import {
  allowedPayload,
  optionalFiniteInteger,
  optionalNumber,
  requireIsoTimestamp,
  requirePositiveInteger,
  requireString,
  type EntitySyncTable,
  type Payload,
} from "./syncValidation.js";

function validateAnomalyEvaluationCreate(payload: Payload): Payload {
  const sanitized = allowedPayload(payload, ANOMALY_EVALUATION_CREATE_FIELDS);
  requireString(sanitized, "transaction_id");
  requireString(sanitized, "subcategory_id");
  requirePositiveInteger(sanitized, "amount_centavos");
  requirePositiveInteger(sanitized, "usable_history_count");
  for (const field of ["usual_spending_centavos", "lower_bound_centavos", "upper_bound_centavos"]) optionalFiniteInteger(sanitized, field);
  optionalNumber(sanitized, "severity");
  requireString(sanitized, "model_version");
  requireString(sanitized, "evaluated_at");
  return sanitized;
}

// Scores stay immutable; only the user's answer may be recorded. Older apps send only
// confirmed_recurring_at, which means frequent; confirmed_recurring_at only accompanies frequent.
function validateAnomalyEvaluationUpdate(payload: Payload): Payload {
  const sanitized = allowedPayload(payload, ANOMALY_EVALUATION_UPDATE_FIELDS);
  if (sanitized.recurrence === undefined) {
    if (sanitized.recurrence_months !== undefined) throw new Error("recurrence_months must be distinct months from 1 to 12 on a yearly answer");
    requireIsoTimestamp(sanitized, "confirmed_recurring_at");
    return sanitized;
  }
  if (typeof sanitized.recurrence !== "string" || !ANOMALY_RECURRENCES.has(sanitized.recurrence)) {
    throw new Error("recurrence must be one_time, frequent, or yearly");
  }
  if (sanitized.recurrence === "frequent") requireIsoTimestamp(sanitized, "confirmed_recurring_at");
  else if (sanitized.confirmed_recurring_at !== undefined) throw new Error("confirmed_recurring_at is only recorded for frequent spending");
  if (sanitized.recurrence_months != null) {
    const months = normalizeRecurrenceMonths(sanitized.recurrence_months);
    if (sanitized.recurrence !== "yearly" || !months) throw new Error("recurrence_months must be distinct months from 1 to 12 on a yearly answer");
    sanitized.recurrence_months = months;
  }
  return sanitized;
}

export const syncAlerts: EntitySyncTable = {
  alert_notification_preferences: {
    rpc: SYNC_RPCS.alertFeedback,
    create: (_ctx, payload) => {
      const sanitized = allowedPayload(payload, ALERT_PREFERENCE_CREATE_FIELDS);
      requireString(sanitized, "category");
      return sanitized;
    },
    update: (_ctx, payload) => allowedPayload(payload, ALERT_PREFERENCE_UPDATE_FIELDS),
  },
  anomaly_whitelist_rules: {
    rpc: SYNC_RPCS.alertFeedback,
    create: (_ctx, payload) => {
      const sanitized = allowedPayload(payload, ANOMALY_WHITELIST_CREATE_FIELDS);
      requireString(sanitized, "merchant_name");
      requireString(sanitized, "subcategory_id");
      return sanitized;
    },
    update: (_ctx, payload) => allowedPayload(payload, ANOMALY_WHITELIST_UPDATE_FIELDS),
  },
  alert_suppression_rules: {
    rpc: SYNC_RPCS.alertFeedback,
    create: (_ctx, payload) => {
      const sanitized = allowedPayload(payload, ALERT_SUPPRESSION_CREATE_FIELDS);
      requireString(sanitized, "category");
      requireString(sanitized, "reason");
      return sanitized;
    },
    update: (_ctx, payload) => allowedPayload(payload, ALERT_SUPPRESSION_UPDATE_FIELDS),
  },
  anomaly_evaluations: {
    rpc: SYNC_RPCS.default,
    create: (_ctx, payload) => validateAnomalyEvaluationCreate(payload),
    update: (_ctx, payload) => validateAnomalyEvaluationUpdate(payload),
  },
};
