// Rows per batch request. The API accepts up to 1,000.
export const EXPORT_BATCH_SIZE = 500;

// The API allows 120 batch requests a minute per user; one every 500 ms stays at that pace.
export const EXPORT_BATCH_INTERVAL_MS = 500;
