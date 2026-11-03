// Fields of a caught error that are safe to log. PostgREST `details` is left out on purpose:
// constraint failures echo the failing row there, which can hold personal financial values.
export function loggableError(error: unknown): Record<string, unknown> {
  if (typeof error !== "object" || error === null) return { message: String(error) };
  const { name, code, status, message } = error as Record<string, unknown>;
  const fields: Record<string, unknown> = { name, code, status, message };
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined && value !== ""));
}
