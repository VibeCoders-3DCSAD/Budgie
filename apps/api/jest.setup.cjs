const dotenv = require('dotenv');
const path = require('node:path');

dotenv.config({ path: path.join(__dirname, '.env') });
dotenv.config({ path: path.join(__dirname, '.env.local'), override: true });

// Integration tests create users and financial rows with the service-role key, so they may
// only run against a disposable local Supabase stack, never a shared or production project.
if (process.env.RUN_INTEGRATION_TESTS) {
  const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);
  let host = '';
  try { host = new URL(process.env.SUPABASE_URL ?? '').hostname; } catch { /* reported below */ }
  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(`Integration tests only run against a local Supabase stack; SUPABASE_URL host is "${host || 'unset'}". Point SUPABASE_URL at 127.0.0.1 (pnpm exec supabase start).`);
  }
}
