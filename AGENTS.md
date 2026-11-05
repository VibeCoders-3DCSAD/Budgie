# Odin Project Agents Guide

## Priority: Coding Standards

This section is the highest-priority project rule set. When there is any ambiguity in implementation, structure, naming, or dependency usage, follow these standards first.

Detailed repository standards live in [REPOSITORY-STANDARDS.md](docs/standards/REPOSITORY-STANDARDS.md). That file is the canonical location for enforceable coding standards and review rules.

### Standards Bootstrap

- Before making code or documentation changes in a consuming repository, verify that `AGENTS.md` and `docs/standards/REPOSITORY-STANDARDS.md` exist in that repository.
- If the shared standards are missing, clone the standards repository as a sibling of `odin` and `odin-ml`:
  ```bash
  git clone https://github.com/VibeCoders-3DCSAD/odin-standards.git ../odin-standards
  ```
- After cloning, run the sync script from the consuming repository root:
  ```bash
  ../odin-standards/scripts/sync-standards.sh
  ```
- On Windows PowerShell, run:
  ```powershell
  ..\odin-standards\scripts\sync-standards.ps1
  ```
- On Windows Command Prompt, run:
  ```bat
  ..\odin-standards\scripts\sync-standards.cmd
  ```
- Do not continue with implementation work until the local standards files are present and readable.

### Enforcement

- Treat this file as the project-wide source of truth for code organization and baseline engineering rules.
- Do not introduce new patterns, dependencies, or folder layouts that conflict with this file.
- Prefer extending an existing convention over creating a parallel convention.
- Keep implementations consistent across `odin` and `odin-ml` where the same architectural concern exists.
- If a new rule is needed, add it here before spreading the new pattern across the codebase.

### Required Standards

- Put code in the correct repository and directory based on responsibility.
- Keep frontend concerns in `odin/apps/app/`.
- Keep Node and Express backend concerns in `odin/apps/api/`.
- Keep shared TypeScript code in `odin/packages/`.
- Keep ML and FastAPI service concerns in `odin-ml/app/`.
- Keep tests near the repo they validate and use the approved testing stack for that repo.
- Install Node dependencies with `pnpm` only.
- Install Python dependencies in `odin-ml` using a virtual environment only.
- Respect the pinned runtime versions defined by `.nvmrc`, `.node-version`, `packageManager`, and `.python-version`.

### Domain and Data Scope Rules

- Odin is a single-user-account application, not a multi-tenant application.
- Model the system as `1 user = 1 account`.
- Do not introduce tenant, organization, workspace, or company-scoped architecture unless project requirements explicitly change.
- Even without multi-tenancy, all user-owned data must still be scoped to the authenticated user.
- Queries, mutations, derived data, and UI state that represent persisted user data must always resolve within the current authenticated user's boundary.
- Translate any multi-tenant review rule from prior experience into `user_id` ownership rules for this project.
- Do not fetch, update, or delete user-owned records without explicit user scoping.
- Validate foreign keys and related record references against the authenticated user's ownership boundary before use.
- Read paths need ownership checks too, not only write paths.

### Input, Database, and Sanitization Rules

- Any data that reaches the database must be validated, cleaned, and sanitized thoroughly.
- Treat dropdown values, form fields, query params, route params, and request bodies as untrusted input.
- Validate inputs before persistence and before using them in queries, filters, or downstream processing.
- Normalize values where appropriate so equivalent inputs do not create inconsistent stored data.
- Do not trust client-side validation as sufficient protection; enforce validation and sanitization at the backend boundary as well.
- Prefer explicit schemas and narrow accepted values over permissive input handling.
- Whitelist constrained values such as sort order, filter keys, and dropdown-backed options.
- Keep database reads for dropdowns and selector lists bounded and filtered to the current user's accessible records.

### Dependency Discipline

- Do not add a new dependency when an existing project dependency already solves the problem adequately.
- Prefer shared utilities over duplicating logic across app, API, and ML service layers.
- Add frontend-only dependencies to `odin/apps/app`.
- Add backend-only Node dependencies to `odin/apps/api`.
- Add Python and ML dependencies only to `odin-ml`.
- Keep shared contracts, schemas, and reusable TypeScript utilities in `odin/packages`.

### Structural Discipline

- Organize by responsibility, not by arbitrary preference.
- Separate transport, business logic, and shared utilities.
- Avoid dumping unrelated files into repo roots.
- Create new top-level directories only when they represent a durable architectural boundary.
- Use clear, stable naming for files and folders.

### Function Design Rules

- Functions should do one thing only.
- If a function is growing in scope, split it before it becomes a maintenance problem.
- If a function can be cleanly decomposed into smaller responsibilities, decompose it.
- Prefer small composable functions over large multi-purpose functions.

### No God Classes or God Components

- Do not create god classes, god services, or god components.
- Split files that accumulate unrelated responsibilities.
- Keep components focused on presentation and local interaction concerns.
- Move data loading, orchestration, transformation, and domain logic out of oversized components.
- If a component or class becomes the default place for unrelated code, break it apart.

### DRY Rules

- Do not repeat logic that can be shared safely.
- Extract repeated logic into a reusable function, helper, module, or shared package at the correct boundary.
- Do not duplicate validation, transformation, or query-building logic across files.
- Prefer a single maintained source of truth over copied parallel implementations.

### Helper Placement Rules

- If a helper is reused across multiple files in the same area, move it into a dedicated helper file.
- Shared helpers should not stay embedded inside unrelated feature files once reuse is established.
- Place shared helpers in a `helpers/` directory within the nearest appropriate module boundary.
- Keep helper placement local first, and only move helpers higher in the tree when reuse crosses module boundaries.

### Logging Rules

- Do not log sensitive data.
- Never log secrets, access tokens, refresh tokens, passwords, raw credentials, or full authentication payloads.
- Do not log personally sensitive user data unless there is a clear operational need and the value is minimized.
- Prefer structured logs with safe identifiers and diagnostic context over dumping raw objects.
- Redact or omit sensitive fields before writing request, response, or error context to logs.
- Include safe diagnostic context in logs such as `user_id`, record IDs, request IDs, counts, and status values.
- Never return raw exception messages to clients.
- Log full exception objects server-side so stack traces and failure origins are preserved.

### Destructive Action Rules

- Any destructive user action must require explicit confirmation.
- Destructive actions include delete, reset, revoke, overwrite, purge, and irreversible state changes.
- Confirmation UX must clearly state what will change and whether the action can be undone.
- Do not make destructive operations one-tap or one-click by accident.

### Frontend App Standards

- The rules in this section apply to `odin/apps/app/`.

#### Component Architecture Standards

- Keep components small and purpose-specific.
- Separate screen composition, data fetching, state orchestration, and presentational UI when complexity grows.
- Prefer feature-local composition over monolithic screens.
- Extract reusable UI into components and reusable behavior into hooks or helpers.
- Do not bury business logic inside large JSX trees.
- Keep shared domain types in a reusable `types/` location and keep component-specific prop types colocated with the component.
- Do not prop drill past 2 levels; use a store or context when state crosses deeper trees.
- Keep state hooks close to the component or feature that owns them.
- Keep stores and contexts organized consistently and discoverably.

#### Mutation Pending State Rules

- Do not share one mutation pending state across an entire rendered list when actions are item-specific.
- Track pending state per item when multiple rows, cards, or list entries can trigger the same mutation.
- Avoid locking unrelated items in the UI because one item is mutating.
- Item-scoped actions must show item-scoped loading, disabled state, and error handling.

#### Layout and Positioning Rules

- Do not use magic pixel numbers for positioning when layout primitives can express the intent.
- Prefer flexbox, spacing systems, alignment rules, and relative layout over arbitrary offsets.
- If a numeric spacing value is necessary, it should be explainable by the design system or layout requirement.
- Avoid fragile positioning that only works for one screen size or one content length.

#### Auth Hydration Rules

- Guard against auth hydration flashes in the frontend app.
- Do not render authenticated screens or protected content before auth state has been resolved.
- Add explicit loading or hydration guards around auth-dependent UI.
- Prevent brief flashes of unauthenticated or incorrect content during app startup and refresh.
- Treat `undefined` or unresolved auth/data state as different from loaded-empty state.

### Authorization and Service Boundary Rules

- Use `403` for permission denials on authenticated users and reserve `401` for authentication failures.
- Never comment out authorization checks.
- If one endpoint in a controller or route group requires authorization, verify the rest explicitly too, especially write endpoints.
- Services must not reach into auth/session globals directly; pass authenticated user context or `user_id` explicitly as parameters.
- Permission strings must use lowercase `object:action` format consistently.

### Backend Offline Sync Rules

- Backend sync routes must live in `odin/apps/api/` and keep route, controller, validation, and service responsibilities separate.
- Queue and sync APIs must accept domain operations, not saved HTTP route replays.
- Every sync operation must include an idempotency key, authenticated `user_id`, `device_id`, entity name, record ID, operation type, payload, changed fields, and base version.
- Resolve idempotency before conflict detection by checking the applied operation log first.
- Apply sync batches inside database transactions and return per-operation results.
- Use soft deletes for synced tables. Do not hard-delete synced rows from normal client-driven delete paths.
- Reject update-vs-missing-row instead of silently upserting.
- Enforce delete-wins before edit-vs-edit merge logic.
- Resolve edit-vs-edit conflicts per field, not by overwriting the whole row.
- Log losing, rejected, or overridden operations to edit history with safe diagnostic context.
- Do not store auth credentials, passwords, access tokens, or refresh tokens in offline business tables or sync queues.
- Registration, login, logout, forgot password, password update, data export, and account deletion remain online-only unless requirements explicitly change.
- Logout must be blocked while the current user has pending or failed sync queue rows. Attempt sync first when online; if rows remain, keep the user logged in and show a sync-required message.

### Query and Persistence Rules

- Never concatenate user input into raw SQL.
- Whitelist user-controlled sort columns and sort directions explicitly.
- Scope every read and write for user-owned records by `user_id`.
- Verify every request ID that references a user-owned record before reading or writing with it.
- Verify related IDs and pivot-table associations against the current user's ownership boundary before insert or sync.
- Read methods require ownership verification too, not only mutations.
- Never run database queries inside loops when a batch query can be used instead.
- Keep dropdown and selector queries bounded; avoid unbounded reads for UI lists.
- Use transactions for multi-step writes that must succeed or fail together.
- Separate store/create validation from update validation when uniqueness rules differ.
- Match string literal casing to the actual stored database values instead of guessing.
- Check sentinel values such as `0`, empty string, or `null` paths explicitly before ownership guards or lookups.

### Development Stage Rules

- Odin is pre-release and has no users; there is no production data to preserve.
- When asked to replace something, build the replacement and delete the old implementation in the same change. Do not keep the old code, tables, columns, routes, or components alongside it.
- Do not add backward-compatibility shims, deprecation paths, feature flags for the old behavior, or data back-fills for a replaced feature.

### Supabase Migration Rules

- `pnpm exec supabase db reset --local` is allowed for the local database only, and only with explicit approval because it deletes local data. Never reset or fresh-migrate any linked or remote database.
- When a migration that has not yet been applied to any remote or hosted database has a bug or needs an edit, overwrite that migration file instead of adding a corrective migration on top.
- Once a migration has been applied to a remote or hosted database, do not edit it; fix forward with a new migration.
- To reapply an overwritten migration: revert the objects it created, delete its row from `supabase_migrations.schema_migrations` by `version`, then run `pnpm exec supabase migration up --local` so only that migration replays. A local reset, with explicit approval, is an acceptable alternative when replaying the full sequence.
- Every migration sequence must replay on a clean local database before it is considered complete.
- A schema snapshot migration must only alter objects created by preceding migrations; make operations conditional when a later migration owns the object.
- Use `pnpm exec supabase db push --local --dry-run` to inspect the pending local sequence.

### External I/O and Reliability Rules

- Set explicit timeouts on all outbound HTTP calls.
- Treat frontend button disabling as UX only, not as a substitute for backend safety guarantees.
- Any future payment or payment-like mechanism must be idempotent at the backend and storage layers.

### Frontend Security and Storage Rules

- Do not store PII in client-side storage keys.
- Use opaque identifiers such as internal IDs or slugs in storage keys instead of emails, names, or phone numbers.

### Testing Rules

- Test real behavior, not assumed behavior.
- Read the source before writing selectors, redirects, or interaction assertions.
- Mock the full call graph a component depends on, not only the obvious first-level requests.
- Mock data must match the real runtime shape returned by the backend or database layer.
- Write E2E flows as Maestro YAML against the installed APK on emulator or device.
- Keep test method signatures aligned with the production method signatures they exercise.

#### On-Device Verification (adb)

Use this to check UI flows, perceived speed, and that lists refresh after creates, edits, and deletes. Jest cannot show these.

- **Permission:** the connected device is usually the developer's own phone. Drive it only when the user has asked for on-device testing.
- **Device and Metro:** `adb devices` lists the device. The dev build loads JS from Metro through `adb reverse tcp:8081 tcp:8081`.
- **Loading new code:** if Fast Refresh has not picked up a change, restart the app with `adb shell am force-stop com.odin.finances`, then `adb shell monkey -p com.odin.finances -c android.intent.category.LAUNCHER 1`.
- **Logs:** JS `console.log` output appears in `adb logcat` under the `ReactNativeJS` tag. Clear the buffer with `adb logcat -c` before an action, then read it with `adb logcat -d | grep ReactNativeJS`.
- **Driving the UI:**
  - `adb shell input tap X Y`, `input swipe X1 Y1 X2 Y2 MS`, `input text`, and `input keyevent 4` (back). Coordinates are device pixels.
  - Capture the screen with `adb exec-out screencap -p > file.png`, saved under the agent scratchpad.
  - Scale screenshots down (for example `magick in.png -resize 40% out.png`) before reading them.
  - Take a screenshot after each step instead of assuming a tap landed.
- **Testing mutations:** never edit or delete the user's existing records.
  1. Create a clearly labelled test record, for example a ₱100 expense described `AGENTTEST`.
  2. Run the edit against it.
  3. Delete it, so balances and totals end where they started.
  4. Say in the report that the delete leaves a synced tombstone.
- **Inspecting without saving:** when only looking at a form, leave with its back arrow instead of saving.
- **Timing:**
  - Wrap the area under test in a temporary React `Profiler` whose `onRender` logs `actualDuration`, or log `Date.now()` around the async step.
  - Compare query time against render time; on device, rendering is usually the larger cost.
  - Remove all temporary instrumentation before finishing.
- **Inspecting the local DB:**
  - Copy it off the device with `adb exec-out run-as com.odin.finances cat files/SQLite/odin.db > <scratchpad>/odin.db`.
  - Open the copy read-only, for example with `node:sqlite` `new DatabaseSync(path, { readOnly: true })`.
  - Never write to the device database directly.

### Remediation Rules

- When a security or correctness issue is found in one place, sweep the codebase for the same pattern before considering the fix complete.

### Documentation Discipline

- When structure or dependency rules change, update `AGENTS.md`.
- When coding standards change, update `REPOSITORY-STANDARDS.md`.
- When setup instructions change, update the relevant `README.md`.
- Do not let repository documentation drift behind the actual implementation.

This file is the shared top-level orientation document for the Odin workspace.
In consuming repositories, keep a copy at the repository root and keep shared
standards under `docs/standards/`.

It covers the two repositories in this workspace:

- `odin`: main application monorepo
- `odin-ml`: machine learning microservice

Use this file as the single project-level reference for dependency versions and directory placement rules. Coding standards can be added here incrementally.

## Repositories

### `odin`

Main product repository for:

- Expo mobile app
- React Native frontend
- Express API
- future shared TypeScript packages

### `odin-ml`

Secondary repository for:

- FastAPI service
- model-serving and ML endpoints
- training and inference utilities as the service grows

## Current Dependency Baseline

### Frontend and Main Backend

- Node.js `24.22.1` LTS
- pnpm `10.26.1`
- TypeScript `5.9.2`
- React `19.2.0`
- React Native `0.83.6`
- Expo SDK `55.0.26`
- Express `5.1.0`
- `@supabase/supabase-js` `2.57.4`
- NativeWind `4.2.3`
- Tailwind CSS `3.4.17`
- React Native Paper `5.15.1`
- `@expo/vector-icons` `15.1.1`

### Python and ML Service

- Python `3.14.4`
- FastAPI `0.135.3`
- Uvicorn
- TensorFlow `2.21.0`
- scikit-learn `1.8.0`
- Pytest
- HTTPX

### Tooling and Testing

- Git
- GitHub
- Jest
- Maestro
- React Native Testing Library
- Supertest
- Pytest
- FastAPI Test Client planned

## Version Pinning

The workspace pins runtime versions with repo-local files:

- `odin/.nvmrc`: Node.js `24.22.1`
- `odin/.node-version`: Node.js `24.22.1`
- `odin/package.json`: pnpm `10.26.1` via `packageManager`
- `odin-ml/.python-version`: Python `3.14.4`

Use these files as the source of truth for local runtime selection.

## Git Commit Message Standards

Use this format for commit messages:

```text
<type>(<scope>): <brief message>
```

Required subject format:

```text
<type>(<scope>): <brief message>

[optional body]

[optional footer]
```

- Use lowercase `type` and `scope` tokens.
- Always include a scope. Do not use unscoped subjects such as `fix: ...`.
- Keep the brief message specific, imperative, and focused on the change.

### Commit Types

- `build`: build system, packaging, or compile pipeline changes
- `chore`: maintenance tasks that do not change functionality
- `ci`: continuous integration, checks, or release automation
- `docs`: documentation-only changes
- `feat`: new features or capabilities
- `fix`: bug fixes or behavior corrections
- `perf`: performance improvements
- `refactor`: structural improvements without changing behavior
- `revert`: reverts of prior commits
- `style`: formatting-only changes with no behavior impact
- `test`: test-only changes

### Commit Scopes

- `api`: API routing, transport, request handling, or API contracts
- `app`: Expo app shell, navigation, or app-level wiring
- `backend`: backend service logic outside narrow API routing
- `ci`: CI configuration, checks, or workflow files
- `config`: repo configuration, tooling config, or runtime pins
- `database`: schema, migrations, RLS, queries, or persistence behavior
- `deps`: dependency additions, removals, upgrades, or lockfile changes
- `docs`: documentation and prose-only updates
- `frontend`: screens, components, hooks, styles, or client-side behavior
- `infra`: deployment, hosting, environment, or operational setup
- `ml`: model service, training, evaluation, forecasting, or ML contracts
- `standards`: shared engineering standards and agent guidance
- `tests`: test fixtures, test helpers, and test coverage

Examples:

```text
feat(frontend): add budget summary screen
fix(database): scope transactions by user id
chore(deps): update supabase cli
docs(standards): document commit message format
```

### Subject Rules

- Keep the subject between 50 and 72 characters when possible.
- Use imperative mood.
- Start the brief message lowercase unless it begins with a proper noun,
  acronym, or code identifier.
- Do not end the subject with a period.

### Body Rules

- Use a blank line between the subject and the body.
- Wrap body lines at 72 characters when practical.
- Explain what changed and why it changed.
- Prefer context and intent over repeating implementation details from the diff.
- Use short paragraphs or short bullets when helpful.

Suggested body order:

1. Current situation
2. Reason for change
3. Action taken
4. Impact or notes

### Footer Rules

- Add footers only when they provide useful metadata.
- Use consistent footer tokens such as `Fixes:`, `Closes:`, `Refs:`, `See also:`, or `BREAKING CHANGE:`.
- Keep footer metadata concise.

### Commit Quality Rule

A valid commit subject should complete this sentence naturally:

```text
If applied, this commit will <your subject line here>
```

## Top-Level Directory Layout

```text
App/
├─ AGENTS.md
├─ odin/
└─ odin-ml/
```

## Directory Placement Rules

### `odin`

Use this structure:

```text
odin/
├─ apps/
│  ├─ app/
│  └─ api/
├─ packages/
├─ README.md
├─ package.json
├─ pnpm-workspace.yaml
└─ tsconfig.base.json
```

Put code in these locations:

- `odin/apps/app/`: mobile and web frontend application code
- `odin/apps/api/`: Express backend code
- `odin/packages/`: shared packages used by multiple apps

#### `odin/apps/app`

Put these concerns here:

- screens
- navigation
- UI components specific to the frontend app
- frontend hooks
- client-side Supabase integration
- app-specific styling and theme setup
- app-owned Expo native modules in `apps/app/modules/`, with platform implementations and native tests colocated inside each module

Suggested internal growth pattern:

```text
odin/apps/app/
├─ components/
├─ screens/
├─ features/
├─ hooks/
├─ lib/
├─ services/
├─ types/
└─ assets/
```

#### `odin/apps/api`

Put these concerns here:

- HTTP routes
- controllers
- request validation
- service-layer business logic
- database and Supabase server integration
- backend-only utilities

Suggested internal growth pattern:

```text
odin/apps/api/
├─ src/
│  ├─ routes/
│  ├─ controllers/
│  ├─ services/
│  ├─ middleware/
│  ├─ lib/
│  ├─ types/
│  └─ index.ts
```

#### `odin/packages`

Use shared packages for code reused across multiple apps. Examples:

- shared TypeScript types
- design system primitives
- validation schemas
- config presets
- reusable SDK wrappers

Suggested package layout:

```text
odin/packages/
├─ shared/
├─ ui/
├─ config/
└─ schemas/
```

### `odin-ml`

Use this structure:

```text
odin-ml/
├─ app/
├─ tests/
├─ README.md
├─ requirements.txt
└─ requirements-dev.txt
```

Put code in these locations:

- `odin-ml/app/`: FastAPI application code
- `odin-ml/tests/`: unit and API tests

Suggested internal growth pattern:

```text
odin-ml/
├─ app/
│  ├─ api/
│  ├─ services/
│  ├─ models/
│  ├─ schemas/
│  ├─ core/
│  └─ main.py
├─ tests/
└─ scripts/
```

Put these concerns here:

- `app/api/`: route modules
- `app/services/`: inference and business logic
- `app/models/`: model-loading and model wrapper code
- `app/schemas/`: Pydantic request and response models
- `app/core/`: settings, startup wiring, shared infrastructure
- `tests/`: pytest coverage
- `scripts/`: one-off local scripts for training or maintenance if needed

## Environment Rules

- Install Node dependencies with `pnpm`, not `npm` or `yarn`
- Keep frontend and main backend dependencies inside `odin`
- Install Python dependencies inside a virtual environment in `odin-ml`
- Use the pinned version files in each repo when selecting runtimes
- Use `source .venv/bin/activate.fish` for Fish
- Use `source .venv/bin/activate` for Bash
- Use `.\.venv\Scripts\Activate.ps1` for Windows PowerShell

## App Releases

The app checks GitHub Releases on `VibeCoders-3DCSAD/Budgie` when it opens. It offers an update when the latest release is newer than the installed version, and shows the installed version's release notes once after an update. A release must follow these rules or the check silently skips it.

1. Bump the version in `odin/apps/app/app.config.ts`:
   - `version`: the next semver, for example `1.0.0` → `1.0.1`.
   - `android.versionCode`: the previous code plus 1. Android refuses to install an APK over one with the same or a higher code.
2. Apply the same `versionName` and `versionCode` in `odin/apps/app/android/app/build.gradle`. The `android/` folder is gitignored and generated by `expo prebuild`; edit it directly or re-run prebuild, so the local build matches `app.config.ts`.
3. Commit the bump, push it, and build the release APK from a clean working tree: `cd odin/apps/app/android && ./gradlew assembleRelease`. Output: `android/app/build/outputs/apk/release/app-release.apk`.
4. Confirm `output-metadata.json` next to the APK shows the new `versionName` and `versionCode`.
5. Create the release:
   ```bash
   gh release create v<version> -R VibeCoders-3DCSAD/Budgie \
     --target "$(git rev-parse HEAD)" --title "Budgie <version>" --latest \
     --notes "<markdown notes>" Budgie-<version>.apk
   ```
   - Tag format is exactly `v<major>.<minor>.<patch>`. Pre-release suffixes such as `-beta.1` are ignored by the app.
   - `--target` needs the full commit SHA, which must already be on GitHub.
   - Do not mark it as a draft or pre-release; the app only reads the latest published release.
6. Write the notes for users, not developers: short `-` bullets under `##` headings describing what changed. The app shows headings and bullets as plain styled text, and links and bold as plain text.
7. Keep the release signing keystore (`android/app/my-upload-key.keystore`) backed up outside the repo. Losing it means updates can no longer install over existing installs.
8. Publishing a release is outward-facing: only create one when the user asks.

## Current Entrypoints

### `odin`

- frontend app entry: `expo-router/entry` (the `main` field of `odin/apps/app/package.json`)
- Expo Router routes: `odin/apps/app/app/`, root layout `odin/apps/app/app/_layout.tsx`
- API entry: `odin/apps/api/src/index.ts`

### `odin-ml`

- FastAPI entry: `odin-ml/app/main.py`

## Placement Summary

- frontend app code goes in `odin/apps/app/`
- Node/Express backend code goes in `odin/apps/api/`
- shared TypeScript code goes in `odin/packages/`
- ML service code goes in `odin-ml/app/`
- ML tests go in `odin-ml/tests/`

## Reserved For Standards

This file is intended to grow into the shared standards document for the project.

Suggested future sections:

- naming conventions
- file and folder conventions
- TypeScript rules
- React and React Native rules
- Express API conventions
- FastAPI conventions
- testing requirements
- environment variable policy
- Git workflow

## Graphify

- For architecture and relationship questions, query the local graph first with
  `graphify query "<question>"` when `graphify-out/graph.json` exists. Use
  `graphify path "<A>" "<B>"` and `graphify explain "<concept>"` for focused lookups.
- Verify relevant source before editing. Use source searches when the graph is
  missing, stale, or does not provide enough context.
- After code changes, run `graphify update .` when the CLI and graph are available.
- Keep generated `graphify-out/` files local. In odin, see the README's Graphify section
  for installation and the initial code-only build.
- In odin, Codex discovers `.agents/skills/graphify/`, linked to the installed skill at
  `.codex/skills/graphify/SKILL.md` (`$graphify`);
  Claude Code uses `.claude/skills/graphify/SKILL.md` (`/graphify`).
