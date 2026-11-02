// Any RFC 4122-shaped UUID. Version and variant bits are not checked, because IDs are generated on devices.
const UUID_BODY = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

export const UUID_PATTERN = new RegExp(`^${UUID_BODY}$`, "i");

// A biller or remittance payment's client_mutation_id, capturing the scheduled payment's UUID.
export const SCHEDULED_PAYMENT_MUTATION_PATTERN = new RegExp(`^scheduled-payment:(${UUID_BODY}):`, "i");
