# QA Directory — Status Checkpoint

**Generated:** 2026-07-15 22:36 (PHT)
**Previous:** 2026-07-15 22:14 (PHT)

---

## 1. Directory Contents

| Path | Type | Description |
|------|------|-------------|
| `qa/CHECKPOINT.md` | file | This file |
| `qa/README.md` | file | QA overview, naming conventions, setup, coverage table |
| `qa/TEST-CASES.md` | file | Master test case registry (37 test cases, 7 modules) |
| `qa/UNTESTED-FEATURES.md` | file | Gap analysis (31 items: 10 high, 5 medium, 16 low priority) |
| `qa/.maestro/` | dir | Maestro E2E automation flows (31 YAML files) |
| `qa/screenshots/` | dir | Screenshot reference directories (8 modules, empty) |

---

## 2. Maestro Test Flows (31 automated)

### auth/ (9 files)
| File | Test Case | Last Modified |
|------|-----------|---------------|
| `AUTH-001-login-happy-path.yaml` | Login happy path | 2026-07-14 17:53 |
| `AUTH-002-login-invalid-password.yaml` | Login invalid password | 2026-07-14 17:53 |
| `AUTH-003-login-empty-fields.yaml` | Login empty fields | 2026-07-14 17:53 |
| `AUTH-006-register-happy-path.yaml` | Registration happy path | 2026-07-15 16:44 |
| `AUTH-008-register-weak-password.yaml` | Registration weak password | 2026-07-15 16:44 |
| `AUTH-009-password-reset-flow.yaml` | Password reset flow | 2026-07-14 17:53 |
| `AUTH-016-password-toggle-visibility.yaml` | Password toggle visibility | 2026-07-14 17:53 |
| `AUTH-018-login-button-loading-state.yaml` | Login button loading state | 2026-07-15 16:45 |
| `AUTH-020-session-restore.yaml` | Session restore on relaunch | 2026-07-15 21:30 |

### categories/ (8 files)
| File | Test Case | Last Modified |
|------|-----------|---------------|
| `TAX-001-view-category-groups.yaml` | View category groups | 2026-07-15 21:29 |
| `TAX-002-expand-collapse-group.yaml` | Expand and collapse group | 2026-07-15 21:29 |
| `TAX-003-create-category.yaml` | Create category | 2026-07-15 21:29 |
| `TAX-004-edit-category.yaml` | Edit category | 2026-07-15 21:29 |
| `TAX-005-delete-category.yaml` | Delete category | 2026-07-15 21:29 |
| `TAX-006-navigate-subcategories.yaml` | Navigate to subcategories | 2026-07-15 21:29 |
| `TAX-007-create-subcategory.yaml` | Create subcategory | 2026-07-15 21:29 |
| `TAX-008-category-form-validation.yaml` | Category form validation | 2026-07-15 21:29 |

### consent/ (3 files)
| File | Test Case | Last Modified |
|------|-----------|---------------|
| `CONSENT-001-first-launch-consent-shown.yaml` | First-launch consent shown | 2026-07-14 17:53 |
| `CONSENT-002-accept-consent-proceed.yaml` | Accept consent and proceed | 2026-07-14 17:53 |
| `CONSENT-004-cannot-bypass-consent.yaml` | Cannot bypass consent | 2026-07-15 16:48 |

### navigation/ (3 files)
| File | Test Case | Last Modified |
|------|-----------|---------------|
| `NAV-001-bottom-tab-navigation.yaml` | Bottom tab navigation | 2026-07-14 17:54 |
| `NAV-002-drawer-navigation.yaml` | Drawer navigation | 2026-07-14 17:54 |
| `NAV-005-back-button-behavior.yaml` | Back button behavior | 2026-07-14 17:54 |

### offline/ (4 files)
| File | Test Case | Last Modified |
|------|-----------|---------------|
| `SYNC-001-app-usable-offline.yaml` | App usable in airplane mode | 2026-07-14 17:54 |
| `SYNC-002-offline-indicator.yaml` | Offline blocks settings change | 2026-07-15 16:44 |
| `SYNC-004-sync-on-reconnect.yaml` | Sync on reconnect | 2026-07-14 17:54 |
| `SYNC-005-logout-after-offline.yaml` | Logout after offline period | 2026-07-15 21:30 |

### security/ (2 files)
| File | Test Case | Last Modified |
|------|-----------|---------------|
| `SEC-003-session-invalidation-logout.yaml` | Session invalidation on logout | 2026-07-14 17:54 |
| `SEC-005-sql-injection-inputs.yaml` | SQL injection in inputs | 2026-07-14 17:54 |

### settings/ (4 files)
| File | Test Case | Last Modified |
|------|-----------|---------------|
| `SET-001-toggle-privacy-setting.yaml` | Toggle privacy setting | 2026-07-14 17:53 |
| `SET-002-data-export-happy-path.yaml` | Data export happy path | 2026-07-14 17:53 |
| `SET-004-account-deletion-flow.yaml` | Account deletion flow | 2026-07-14 17:54 |
| `SET-005-account-deletion-cancel.yaml` | Account deletion cancel | 2026-07-14 17:54 |

### subflows/ (4 files)
| File | Test Case | Last Modified |
|------|-----------|---------------|
| `login.yaml` | Shared login subflow | 2026-07-14 17:52 |
| `logout.yaml` | Shared logout subflow | 2026-07-14 17:52 |
| `navigate-to-categories.yaml` | Navigate to categories | 2026-07-15 21:29 |
| `navigate-to-settings.yaml` | Navigate to settings | 2026-07-14 17:52 |

---

## 3. Test Case Summary

| Module | Automated | Manual | Total |
|--------|-----------|--------|-------|
| Authentication | 9 | 3 | 12 |
| Privacy Consent | 3 | 0 | 3 |
| Settings | 4 | 1 | 5 |
| Navigation | 3 | 0 | 3 |
| Offline / Sync | 4 | 0 | 4 |
| Security | 2 | 0 | 2 |
| Categories / Taxonomy | 8 | 0 | 8 |
| **Total** | **31** | **4** (net) | **37** |

---

## 4. Git History (QA-relevant commits)

| Date | Hash | Message |
|------|------|---------|
| 2026-07-14 21:48 | `b1a56e3` | test: Add initial test cases |
| 2026-07-15 20:45 | `13f1839` | test(qa): fix stale and incorrect test cases |
| 2026-07-15 21:16 | `4be7f30` | test(qa): add untested features gap analysis |
| 2026-07-15 21:33 | `1c133ea` | test(qa): add test cases for high-priority untested features |
| 2026-07-15 21:50 | `11e418e` | docs(qa): update gap analysis with new test case coverage |

Branch: `main` — 4 commits ahead of `origin/main`, working tree clean.

---

## 5. Coverage Gaps (from UNTESTED-FEATURES.md)

**High Priority (no tests):** AUTH-021 (password reset complete — needs email deep link), AUTH-022 (Google Sign-In — needs OS-level account), AUTH-023 (email verification deep link), SET-006 (settings error + retry — needs API failure simulation), toast notification system (partial coverage only).

**Placeholder screens (no real content):** Dashboard, Transactions, History, Spending Forecast, Anomaly Alerts, Budget Advice, Savings & Goals, Debt Manager, Insurance, Assistant, Add Transaction FAB.

---

## 6. Configuration

- **config.yaml** exists at `.maestro/config.yaml`
- **Test framework:** Maestro
- **Target:** Android emulator, app ID `com.odin.finances`
- **Screenshot directories:** 6 module folders exist, all empty
