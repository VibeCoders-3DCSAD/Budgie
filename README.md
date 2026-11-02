# Odin

Monorepo for the main Odin application.

## Demo Financial History

Configure `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `apps/api/.env`
or `apps/api/.env.local`. Preview the generated history without writing data:

```bash
pnpm --filter api seed -- --email <email> --password <password> --dry-run
```

To create the user if needed and replace that user's existing demo history, run
the same command with `--confirm <email>` instead of `--dry-run`. Replacement
deletes previous demo history and cannot be undone. Writes run in batches; a
failure may leave partial demo data, so rerun after resolving the error.
Apply pending migrations before seeding (`pnpm exec supabase db push --local`).
Savings contributions and debt/card repayments are uncategorized; repayment
transactions use explicit payment markers so they do not inflate expense-category forecasts.

Choose a persona with `--persona` (omit it to keep the original general demo):

| Persona | Story |
| --- | --- |
| `seasonal-mom` | Marissa Santos: four children, PHP 60,000 monthly take-home pay, PHP 42,000 living costs, PHP 14,000 additional school costs each month in Q1–Q2, summer activities in April–May, and Christmas spending in December. |
| `debt-burdened` | Carlo Reyes: PHP 25,000 income; half (PHP 12,500) goes to a personal loan and an online lending app loan against PHP 15,000 required, so PHP 2,500 goes overdue each month. The remaining PHP 12,500 covers bedspace rent, electricity, food, and commute, and cash hits zero before payday. About PHP 170,000 still outstanding; no savings. |
| `healthy-worker` | Andrea Cruz: PHP 75,000 income, about PHP 35,000 living costs that drift ±15% month to month, regular discretionary spending, New Year, summer, Undas, and Christmas peaks, four one-off purchases (up to a PHP 42,000 laptop) that unusual-spending detection flags and the forecast leaves out, a funded PHP 210,000 emergency reserve, and PHP 20,000 monthly house-deposit contributions. |
| `family-breadwinner` | Joel Mendoza: lives with their parents and sends PHP 18,000 home each payday (PHP 36,000 a month, 80% of their PHP 45,000 take-home pay), covering the household's rent, food, and utilities; the remaining PHP 9,000 pays their commute, work meals, phone, and personal care. |

```bash
pnpm --filter api seed -- --persona family-breadwinner --dry-run
pnpm --filter api seed -- --persona family-breadwinner --confirm family-breadwinner@odin.demo
```

Each persona always uses the same demo login:

| Persona | Email | Password |
| --- | --- | --- |
| `seasonal-mom` | `seasonal-mom@odin.demo` | `501bBg7OVnYhVQ3RSk5*` |
| `debt-burdened` | `debt-burdened@odin.demo` | `rT_nLxeJ_3t7MP6cWb7_` |
| `healthy-worker` | `healthy-worker@odin.demo` | `9hYZw-og6Wg-SZuwVx7$` |
| `family-breadwinner` | `family-breadwinner@odin.demo` | `HaxJi2ZDwEoNrfw9Ne2!` |

Seeding creates the account if it is missing (already email-confirmed), resets
an existing persona account to its demo password, and prints the credentials
when it finishes. `--email` and `--password` are rejected with `--persona`.
Without `--persona`, `--email` is required; a new account without `--password`
(or `SEED_PASSWORD`) gets a generated one, and an existing account keeps its
password. Persona seeding also sets the display name and submitted demo
onboarding answers so first login opens the dashboard. Demo histories cover
the last eight full quarters and the current quarter to date, so the forecast
chart can show two years of actual quarterly spending. The seed targets the
Supabase instance configured in the API environment.

Persona flexible spending uses 2025 NCR FIES anchors exported from `odin-ml`.
Each anchor averages the 50 households with the same household size and nearest
annual income to the persona's annual salary (sizes: mother 5, debt worker 1,
healthy worker 1, breadwinner and parents 3). These are unweighted descriptive
cohorts for synthetic demos. They are not survey-weighted population estimates;
FIES household income is also broader than an individual's net salary.

For each category, the quarterly target is `annual FIES amount × current-price
HFCE for that quarter / current-price HFCE for the full year`. Integer centavos
reconcile to the annual category anchor. Complete 2023–2025 HFCE years use their
own weights; unavailable or partial years, including 2026, explicitly reuse the
2025 seasonal template. The 2025 annual anchors stay constant across the demo
history, without inflation adjustments. These are synthetic quarterly estimates.

The 2025 cleaned food anchor overlaps its outside-meals restaurant proxy. The
export subtracts that proxy from food before aggregation, then recalculates the
unmapped expenditure remainder. That remainder is retained separately and is
not assigned to any category. Aggregate anchors, source file SHA-256 hashes,
selection rules, and observed HFCE values live in
`apps/api/scripts/fixtures/persona-spending.json`; seeding does not require the
sibling repository or access individual household records.

Refresh the aggregate fixture after updating the cleaned ML data (from the Odin
repository root):

```bash
pnpm --filter api persona-spending:export /absolute/path/to/odin-ml
```

Only the supported flexible categories are projected onto each persona's daily
cash budget. Bills, tuition timing, seasonal events, one-off purchases, debt,
family support, and savings keep their story constraints. Monthly plans use the
same projected category mix. The CLI prints full-quarter FIES benchmarks beside
generated category spending, including differences caused by these constraints.
Current-quarter actuals include only transactions through today. Debt repayments
and savings transfers are excluded from the category comparison; the breadwinner's
family support remains a `misc_other` expense. Total quarterly spending is still
governed by each persona's budget, rather than forced to match the FIES benchmarks.

## Repositories

- `apps/app`: Expo app for React Native mobile
- `apps/api`: Express API written in TypeScript
- `packages/`: reserved for shared packages

## Tech Stack

- Node.js `24.22.1` LTS
- pnpm `10.26.1`
- TypeScript `5.9.2`
- React `19.2.0`
- React Native `0.83.6`
- Expo SDK `55`
- Express `5.1.0`
- Supabase JS `2.57.4`
- NativeWind, Tailwind CSS, React Native Paper, `@expo/vector-icons`

## Prerequisites

Install these before working in this repository:

- Node.js `24.22.1` LTS
- Corepack enabled
- pnpm `10.26.1`

Version pins in this repo:

- `.nvmrc`
- `.node-version`
- `package.json` via `packageManager`

With nvm, install and select the pinned runtime before running pnpm:

```bash
nvm install
nvm use
node --version # v24.22.1
```

Node.js `24.22.1` is the minimum security baseline for the 24.x line. It fixes
[CVE-2026-111497 (Node2Shell)](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases),
a bundled Brotli decoder flaw that can permit remote code execution. The API's
Express JSON parser accepts Brotli-compressed requests by default, so upgrade
its runtime even if application dependencies have not changed.

For VPS deployments, install and select `.nvmrc` for the build **and the running
service**. Check `systemctl cat odin-api` for an `ExecStart` or `PATH` pinned to an
older Node binary; update it to the installed version, reload systemd if the
unit changed, and restart the service. Verify the running process's Node
executable and version after restart; changing `.nvmrc` or passing `/health`
alone does not prove that the runtime was upgraded.

Optional but typically needed for mobile work:

- Expo development builds for native Google Sign-In testing
- Android Studio for Android emulator and device builds
- JDK 21 for Android builds
- Android SDK Platform 36, Build-Tools, Emulator, and platform-tools (`adb`)
- Xcode for iOS simulator on macOS

## Environment Variables

Create an `.env` file from the example templates:

### App (`apps/app/.env`)

No `.env.example` is present yet. The app uses:

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- `EXPO_PUBLIC_API_BASE_URL`
- `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`
- `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`
- `EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME`

### API (`apps/api/.env.example` → `apps/api/.env`)

```
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
AUTH_REDIRECT_URL=
PORT=3001
```

Do not commit real secrets.

## What Is Already Wired

### Frontend (App)

- Auth experience: email+password login, registration, password reset, Google Sign-In, consent gate
- Privacy consent screen (first-time modal)
- Onboarding questionnaire with financial condition assessment and seasonal preferences
- Dashboard shell with drawer navigation and bottom toolbar
- Taxonomy screen: CRUD for category groups, categories, and subcategories (local-first with offline sync via SQLite)
- Privacy settings: 5 toggles (personalization, model training, research, notifications, data retention)
- User profile with data export request management
- Account offboarding: multi-step deletion flow
- Placeholder pages for: Transactions, History, Spending Forecast, Anomaly Alerts, Budget Advice, Savings & Goals, Debt Manager, Insurance, Assistant, and Add Transaction
- Offline sync engine: SQLite-based queue, push/pull sync with cursor-based API

The questionnaire uses New Year, Summer, Back-to-School, Rainy Season, Undas,
and Christmas and Ber Months as seasonal choices. Users can add up to 20 custom
events with a plain-text name and one or more months. Events are saved in the
authenticated user's onboarding answers, reused across the seasonal questions
and reassessments, and supplied as user-reported context to Groq only for the
selected months. They do not establish a category-specific spending cause.
Settings → Preferences lets users edit their seasonal choices and add, edit, or
remove custom events. Save preferences updates only the seasonal fields of the
latest submitted questionnaire, which also supplies Groq's planning context.
Names and classification inputs are excluded from this settings response and
editor; unfinished reassessments do not replace submitted preferences.

The essential-cost and debt-percentage inputs offer a selectable “I don't know”
card; selecting it highlights the choice, and Continue advances the questionnaire.
Credit-card setup uses four choices: no card, always pay on or before the due date,
1–11 months with an unpaid balance, or over a year. The API and ML service preserve
the selected duration range rather than inventing an exact month count.
- Toast notification system
- Deep link handling for password recovery and email verification

### Backend (API)

29 endpoints across 10 route modules:

| Route Module | Endpoints |
|---|---|
| `auth` | register, login, logout, session restore, password reset, password update, Google sign-in |
| `me` | get/update user profile |
| `eligibility-profile` | get/update eligibility data |
| `privacy` | get/update privacy settings |
| `consents` | record user consent |
| `push-device-tokens` | register device token |
| `data-export-requests` | list/create export requests |
| `account-deletion-requests` | create/confirm/cancel deletion (30-day delay) |
| `onboarding` | create/update session, upsert responses, submit (triggers profile assessment) |
| `profile` | get/confirm/reject/select/reassign financial profile assignment |
| `sync` | push local changes, pull server changes, register device |

### Database

19 Supabase migrations covering the full schema: user profiles, onboarding, financial profiles, taxonomy, transactions, budgets, savings goals, debt, forecasts, anomalies, alerts, reports, and sync infrastructure.

### Testing

- **API unit tests**: 18 test files (Jest + Supertest)
- **E2E tests**: 23 Maestro test cases in `qa/.maestro/` (auth, consent, settings, navigation, offline/sync, security)
- **Smoke test script**: `scripts/test-routes.sh`

## Commands

```bash
pnpm dev:app        # Expo app
pnpm dev:web        # Expo web
pnpm dev:api        # Express API (defaults to port 3001)
pnpm --filter api build
pnpm --filter app exec tsc --noEmit
pnpm test           # Run all tests
```

## Graphify

Graphify maps code into a local knowledge graph for architecture and relationship
queries. Install the CLI in an isolated tool environment (Python 3.10+ and `uv`):

```bash
uv tool install 'graphifyy[sql]==0.9.93'
graphify --version
```

The repository includes Graphify skills for Codex (`$graphify`) and Claude Code
(`/graphify`). Start a new assistant session after installation to discover them.
Claude Code's shared settings include Graphify's query guidance hooks.
Codex discovers `.agents/skills/graphify/`, a symlink to the bundled
`.codex/skills/graphify/` directory; preserve symlinks when cloning the repo.

From the repository root, build the initial graph without model calls:

```bash
graphify extract . --code-only
graphify cluster-only . --no-label
graphify export html
graphify query "How does offline synchronization work?"
```

Open `graphify-out/graph.html` in a browser to explore the graph. Generated files
are ignored by Git; each developer builds their own graph. After code changes,
run `graphify update .`. The graph excludes dependencies, assistant files,
worktrees, and build artifacts through `.gitignore` and `.graphifyignore`.
Code-only extraction uses local AST parsing; document and media extraction via
the assistant skill can use its model. This graph covers `odin`; build `odin-ml`
separately if needed.

## Offline account PIN

Native account access requires a six-digit PIN after initial online enrollment.
Five incorrect attempts lock entry for one hour. Offline access lasts 30 days
since successful online account verification; expiry preserves local records and
requires online verification. Logout requires internet, while Lock app works
offline. See [offline authentication](apps/app/features/auth/README.md) for recovery,
encryption, native rebuild steps, verification, and security limits.

## Android Device Flow

1. Connect an Android phone with USB debugging enabled.
2. Verify with `adb devices`.
3. Make the host API reachable: `adb reverse tcp:3001 tcp:3001`.
4. Start the API: `pnpm dev:api`.
5. Start the app: `pnpm --filter app android`.

For Android emulator, use `http://10.0.2.2:3001` as `EXPO_PUBLIC_API_BASE_URL`.

## Troubleshooting

### Metro cannot resolve a newly added workspace package

Run `pnpm install` from the repository root, stop Metro, and restart it with
`pnpm --filter app start --clear`. Metro discovers workspace package folders at
startup, so Fast Refresh alone may not pick up a new package.

### `pnpm` warns about package manager version

```bash
corepack prepare pnpm@10.26.1 --activate
```

### Expo starts but styles don't load

Verify these files exist, then restart Expo:

- `apps/app/babel.config.js`
- `apps/app/metro.config.js`
- `apps/app/global.css`
- `apps/app/tailwind.config.js`

### Native or web dependencies out of sync

```bash
pnpm install
```

## Recommended Next Steps

- Add `.env.example` for the app
- Add app unit tests (Jest is installed, no test files yet)
- Add shared packages under `packages/`
- Add CI/CD pipeline and Docker support
- Implement placeholder pages (Transactions, Dashboard, Budget, etc.)

## Dev Instructions

### Arch Linux

```bash
sudo pacman -S --needed jdk21-openjdk android-tools android-sdk-cmdline-tools-latest
source /etc/profile
sudo chown -R $USER:$USER /opt/android-sdk
/opt/android-sdk/cmdline-tools/latest/bin/sdkmanager "build-tools;35.0.0" "platforms;android-35" --sdk_root=/opt/android-sdk
/opt/android-sdk/cmdline-tools/latest/bin/sdkmanager --licenses --sdk_root=/opt/android-sdk
mkdir -p ~/.gradle
echo "org.gradle.java.home=/usr/lib/jvm/java-21-openjdk" >> ~/.gradle/gradle.properties
/opt/android-sdk/platform-tools/adb devices
```

From the repo root:

```bash
corepack enable
corepack prepare pnpm@10.26.1 --activate
pnpm install
```

### Linux Mint

```bash
sudo apt update
sudo apt install openjdk-21-jdk android-sdk
sdkmanager --licenses
# If sdkmanager is not on PATH:
# /usr/lib/android-sdk/cmdline-tools/latest/bin/sdkmanager --licenses
mkdir -p ~/.gradle
echo "org.gradle.java.home=/usr/lib/jvm/java-21-openjdk-amd64" >> ~/.gradle/gradle.properties
export ANDROID_HOME=/usr/lib/android-sdk
adb devices
```

From the repo root:

```bash
corepack enable
corepack prepare pnpm@10.26.1 --activate
pnpm install
```

### Windows

Install Microsoft OpenJDK 21 and Android Studio.

In Android Studio, install: Android SDK Platform 36, Build-Tools, Emulator, Platform-Tools.

Accept SDK licenses via PowerShell:

```powershell
& "$env:ANDROID_HOME\cmdline-tools\latest\bin\sdkmanager.bat" --licenses
```

If `ANDROID_HOME` is not set, find it in Android Studio (Settings → Appearance & Behavior → System Settings → Android SDK) and set it:

```powershell
[Environment]::SetEnvironmentVariable("ANDROID_HOME", "$env:LOCALAPPDATA\Android\Sdk", "User")
```

Create `$env:USERPROFILE\.gradle\gradle.properties` with:

```properties
org.gradle.java.home=C:\Program Files\Microsoft\jdk-21.0.11-hotspot
```

Adjust the path to match your installed JDK 21 location.

Add platform-tools to `PATH`, then verify:

```powershell
adb devices
```

From PowerShell in the repo root:

```powershell
corepack enable
corepack prepare pnpm@10.26.1 --activate
pnpm install
```

## Repository Layout

```text
odin/
├── apps/
│   ├── api/
│   │   ├── src/
│   │   │   ├── __tests__/
│   │   │   ├── lib/
│   │   │   ├── middleware/
│   │   │   ├── routes/
│   │   │   ├── services/
│   │   │   ├── app.ts
│   │   │   └── index.ts
│   │   ├── .env.example
│   │   ├── jest.config.cjs
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── app/
│       ├── components/
│       ├── features/
│       │   ├── governance/
│       │   ├── onboarding/
│       │   └── taxonomy/
│       ├── hooks/
│       ├── lib/
│       ├── local-db/
│       ├── services/
│       ├── App.tsx
│       ├── app.config.ts
│       ├── global.css
│       ├── package.json
│       └── tsconfig.json
├── docs/
├── packages/
├── plans/
├── qa/.maestro/
├── scripts/
├── supabase/migrations/
├── package.json
├── pnpm-lock.yaml
├── pnpm-workspace.yaml
└── tsconfig.base.json
```

### Recurring Transaction Engine

The recurring engine is an idempotent SQL function (`odin.run_recurring_transaction_engine`) that scans active templates and posts occurrences and transactions. It is exposed via:

```
POST /odin/api/recurring/run
```

**Authentication:** The endpoint rejects user Bearer tokens (403). Call with `x-cron-secret` header matching the `RECURRING_CRON_SECRET` env var.

**Cron setup:** Configure a Supabase scheduled function (or external cron) to hit this endpoint hourly:

```bash
curl -X POST https://your-api.com/odin/api/recurring/run \
  -H "x-cron-secret: ${RECURRING_CRON_SECRET}" \
  -H "Content-Type: application/json" \
  -d '{}'
```

Optional payload: `{ "payload": { "as_of": "2024-01-15", "limit": 200 } }`

### Daily Financial Reports

Configure an external cron host for `0 18 * * *` in `Asia/Manila` to invoke the scheduler-owned report endpoint. It handles missed current-week daily dates and completed-week weekly catch-up itself.

```bash
curl -X POST https://your-api.com/odin/internal/daily-financial-reports/run \
  -H "x-scheduler-secret: ${DAILY_REPORT_SCHEDULER_SECRET}" \
  -H "Content-Type: application/json" \
  -d '{}'
```

Do not call this endpoint with a user session or from the mobile app.

### Savings interest configuration

All savings interest configuration lives inside Advanced Options. The form supports Daily Balance or ADB, Simple or Compound behavior, and fixed nominal annual rates only. None stores 0%, disables interest settings and preserves historical transactions. Tiered and conditional controls are excluded.

The form saves daily calculation separately from daily/monthly/quarterly/yearly/custom credit timing, posting day/date, start date and backdated starting balance, ADB averaging period, optional balance limits, Actual/365 or Actual/366 or Actual/Actual, configurable withholding tax (enabled at 20% by default), effective-dated rate history, a breakdown preference. Automatic interest generation is not available. Saved rate history cannot be overwritten through the form; append a dated change instead.

Migration `20261116000008_fixed_interest_form_configuration.sql` extends the existing interest-reference JSON validation. Apply pending migrations manually through the normal Supabase workflow. SQLite already stores the complete configuration in `interest_reference_json`; sync requires the new server migration.

Interest is entered manually as income. The form stores bank calculation terms; it does not generate credits, projections or balance changes. Migration `20261116000009_disable_automatic_savings_interest.sql` removes the legacy `post-due-savings-interest` cron job, retires the posting function as a safe no-op, and disables saved automatic projection flags. Existing transactions and balances are preserved. Apply this migration manually through the normal Supabase workflow to disable any previously deployed interest job.

Regression checks: `supabase/tests/fixed_interest_form_configuration.sql`, form interactions, SQLite round trips and API validation. The SQL tests roll back their fixtures.
