export type PrivacySettings = {
  personalization_enabled: boolean;
  model_training_opt_in: boolean;
  research_evaluation_opt_in: boolean;
  notifications_opt_in: boolean;
  data_retention_days: number | null;
};

export type ConsentRecord = {
  consent_kind: string;
  status: "granted" | "withdrawn";
  version: string;
  recorded_at: string;
};

export type DataExportRequest = {
  request: {
    id: string;
    status: "requested" | "processing" | "available" | "completed" | "failed" | "expired" | "cancelled";
  };
  // Dataset names in file order; the client fetches each one in batches.
  datasets: string[];
};

export type DataExportBatch = {
  dataset: string;
  rows: Record<string, unknown>[];
  // The last id of this page, or null when the dataset has no more rows.
  next_cursor: string | null;
};

export type AccountDeletionRequest = {
  id: string;
  status: "requested" | "processing" | "cancelled" | "completed";
  requested_at: string;
  scheduled_delete_at?: string;
  confirmed_at?: string;
  cancelled_at?: string | null;
};
