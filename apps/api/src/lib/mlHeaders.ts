import { createHmac } from "node:crypto";

const SHARED_SECRET_ENV = "ODIN_TRUSTED_HISTORY_SHARED_SECRET";
const HISTORY_SOURCE = "odin_api";

export function trustedMlHeaders(userId: string, body: string): Record<string, string> | null {
  const secret = process.env[SHARED_SECRET_ENV];
  if (!secret) return null;

  const signature = createHmac("sha256", secret)
    .update(`${HISTORY_SOURCE}:${userId}:`)
    .update(body)
    .digest("hex");

  return {
    "Content-Type": "application/json",
    "X-Odin-User-Id": userId,
    "X-Odin-History-Source": HISTORY_SOURCE,
    "X-Odin-History-Signature": signature,
  };
}
