# Odin QA

E2E test cases, test plans, and QA documentation for the Odin Android app.

## Overview

This is the `qa/` folder of the Odin monorepo. It contains manual test cases and Maestro automated E2E tests for the Odin Android application. The test cases cover authentication, privacy consent, settings, navigation, offline sync, and security. The application source lives in [`apps/app`](../apps/app/) (and the API in [`apps/api`](../apps/api/)).

## How to Use This Folder

### Finding Test Cases

All test cases are defined in `TEST-CASES.md`, organized by module:

- **Module 1:** Authentication (8 test cases)
- **Module 2:** Privacy Consent (3 test cases)
- **Module 3:** Settings (4 test cases)
- **Module 4:** Navigation (3 test cases)
- **Module 5:** Offline / Sync (3 test cases)
- **Module 6:** Security (2 test cases)

Each test case includes: test ID, description, steps, test data, expected result, and screenshot reference.

### Naming Conventions

Test cases use a **module prefix + number** format:

| Module | Prefix | Example |
|--------|--------|---------|
| Authentication | `AUTH-` | `AUTH-001`, `AUTH-018` |
| Privacy Consent | `CONSENT-` | `CONSENT-001`, `CONSENT-004` |
| Settings | `SET-` | `SET-001`, `SET-005` |
| Navigation | `NAV-` | `NAV-001`, `NAV-005` |
| Offline / Sync | `SYNC-` | `SYNC-001`, `SYNC-004` |
| Security | `SEC-` | `SEC-003`, `SEC-005` |

Screenshots are stored in `screenshots/` using the same prefix hierarchy (e.g., `screenshots/auth/AUTH-001-login-happy-path`).

## Test Framework

Tests are written for **Maestro** and run against the Odin Android app (`com.odin.finances`) on an Android emulator.

### Setup

1. Install Maestro CLI
2. Install the Odin APK on an Android emulator
3. Ensure the API server is reachable at the configured base URL
4. Run tests with `maestro test <flow-file>`

### Automated vs Manual

The appendix in `TEST-CASES.md` documents which of the 23 test cases are automated (Maestro) and which require manual execution or different tooling (e.g., OS-level interaction, network inspection, accessibility tooling).

## Test Environments

| Environment | Purpose |
|------------|---------|
| Android Emulator | Primary test target for all E2E flows |
| Local API | Development backend |
| Staging API | Pre-production validation |

## Test Coverage / Status

| Module | Total | Executed | Passed | Failed |
|--------|-------|----------|--------|--------|
| Authentication | 8 | 0 | 0 | 0 |
| Privacy Consent | 3 | 0 | 0 | 0 |
| Settings | 4 | 0 | 0 | 0 |
| Navigation | 3 | 0 | 0 | 0 |
| Offline / Sync | 3 | 0 | 0 | 0 |
| Security | 2 | 0 | 0 | 0 |
| **Total** | **23** | **0** | **0%** | **0%** |

> All test cases were prepared on 2026-07-14. Execution status will be updated as tests are run.

## Contribution Guidelines

### Adding New Test Cases

1. Create a branch: `test/add-XXX-description`
2. Add the test case entry to the appropriate module table in `TEST-CASES.md`
3. Add a screenshot reference in `screenshots/<module>/`
4. Submit PR with a clear description of the test scenario

### Writing Style

- Use clear, imperative steps (e.g., "Tap Sign in", not "User should tap Sign in")
- Include concrete test data, not placeholders
- State the expected result for each scenario
- Follow the existing table format in `TEST-CASES.md`

### Review Process

PRs require approval before merge. Reviewers verify:

- Test steps are reproducible
- Expected results are specific and testable
- Test data is appropriate and not sensitive

## Related Code

- [Odin monorepo root](../README.md) — Expo app (`apps/app`), Express API (`apps/api`), Supabase backend (`supabase/`)
