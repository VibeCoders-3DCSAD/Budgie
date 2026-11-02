import type { SupabaseClient } from "@supabase/supabase-js";

export type UserSelector =
  | { type: "userId"; value: string }
  | { type: "email"; value: string };

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function parseUserSelector(args: string[], usage: string): UserSelector {
  const valueFor = (flag: string) => {
    const index = args.indexOf(flag);
    return index === -1 ? undefined : args[index + 1];
  };
  const userId = valueFor("--user-id");
  const email = valueFor("--email")?.trim().toLowerCase();

  if ((userId && email) || (!userId && !email)) throw new Error(usage);
  if (userId) {
    if (!uuidPattern.test(userId)) throw new Error("--user-id must be a UUID");
    return { type: "userId", value: userId };
  }
  if (!emailPattern.test(email!)) throw new Error("--email must be a valid email address");
  return { type: "email", value: email! };
}

export function assertSeedConfirmation(selector: UserSelector, confirmation: string | undefined, dryRun: boolean) {
  if (dryRun) return;
  const normalizedConfirmation = selector.type === "email" ? confirmation?.trim().toLowerCase() : confirmation;
  if (normalizedConfirmation !== selector.value) {
    throw new Error(`This operation changes existing dummy records. Re-run with --confirm ${selector.value} after using --dry-run.`);
  }
}

export async function resolveSeedUserId(supabase: SupabaseClient, selector: UserSelector) {
  if (selector.type === "userId") return selector.value;

  const perPage = 1_000;
  for (let page = 1; ; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(`Could not look up user by email: ${error.message}`);
    const user = data.users.find((candidate) => candidate.email?.toLowerCase() === selector.value);
    if (user) return user.id;
    if (data.users.length < perPage) break;
  }
  throw new Error(`No auth user exists for email ${selector.value}`);
}
