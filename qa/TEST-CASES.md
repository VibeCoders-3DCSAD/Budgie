---
metadata:
  last_modified: "2026-07-16"
  version: "1.1.0"
  author: "Odin QA"
  status: "active"
  description: "Master test case registry for Odin Android app E2E testing with Maestro"
  test_framework: "Maestro"
  platform: "Android"
  device_target: "Android emulator"
  app_id: "com.odin.finances"
---

# Odin E2E Test Cases

## Summary

| Module No. | Module Name | No. of Test Cases | No. of Test Cases Executed | No. of tests Passed | Rate (Passed/Executed) | No. of tests Failed | Rate (Failed/Executed) | REMARKS |
|---|---|---|---|---|---|---|---|---|
| 1 | Authentication | 12 | 0 | 0 | 0% | 0 | 0% | — |
| 2 | Privacy Consent | 3 | 0 | 0 | 0% | 0 | 0% | — |
| 3 | Settings | 5 | 0 | 0 | 0% | 0 | 0% | — |
| 4 | Navigation | 3 | 0 | 0 | 0% | 0 | 0% | — |
| 5 | Offline / Sync | 4 | 0 | 0 | 0% | 0 | 0% | — |
| 6 | Security | 2 | 0 | 0 | 0% | 0 | 0% | — |
| 7 | Categories / Taxonomy | 8 | 0 | 0 | 0% | 0 | 0% | — |
| **Total** | | **37** | **0** | **0** | **0%** | **0** | **0%** | |

---

## Module 1: Authentication

**Description:** Tests for email/password registration, login, password reset, and auth UI behavior including validation, error states, and loading indicators.

**Precondition:** App installed on Android emulator, API server reachable at configured base URL.

**Post Condition:** User session state matches test intent (logged in / logged out).

**Date Prepared:** 2026-07-14

**Date Executed:** —

| Test No. | Test Case | Test Steps | Test Data | Expected Result | Actual Result | Remarks | Screenshot Name |
|---|---|---|---|---|---|---|---|
| AUTH-001 | Login happy path | 1. Launch app 2. Verify "Welcome back" screen 3. Enter valid email 4. Enter valid password 5. Tap "Sign in" | email: test@example.com, password: Test1234! | Dashboard loads or consent screen appears; user is authenticated | — | — | auth/AUTH-001-login-happy-path |
| AUTH-002 | Login with invalid password | 1. Launch app 2. Enter valid email 3. Enter wrong password 4. Tap "Sign in" | email: test@example.com, password: WrongPassword1! | Error notice "Sign in failed" displayed; email field retained, password cleared | — | — | auth/AUTH-002-login-invalid-password |
| AUTH-003 | Login with empty fields | 1. Launch app 2. Tap "Sign in" without entering any data | (none) | Inline error "Enter your email" shown; form does not submit | — | — | auth/AUTH-003-login-empty-fields |
| AUTH-006 | Registration happy path | 1. Launch app 2. Tap "Create account" 3. Enter full name 4. Enter valid email 5. Enter valid password 6. Enter matching confirm password 7. Tap "Create account" | name: Maestro Test, email: maestro_test_user@odin-test.com, password: SecurePass123! | Account created; consent screen appears or verification email notice shown | — | — | auth/AUTH-006-register-happy-path |
| AUTH-008 | Registration with weak password | 1. Launch app 2. Tap "Create account" 3. Enter valid email 4. Enter weak password (123) 5. Observe password rules 6. Tap "Create account" | email: weakpass@odin-test.com, password: 123 | Password rules shown with failing indicators; tapping "Create account" has no effect; form does not submit | — | — | auth/AUTH-008-register-weak-password |
| AUTH-009 | Password reset flow | 1. Launch app 2. Tap "Forgot password?" 3. Enter email 4. Tap "Send reset link" | email: test@example.com | Success message "If that email exists, a reset link is on the way now." displayed; no user enumeration | — | — | auth/AUTH-009-password-reset-flow |
| AUTH-016 | Password field toggle visibility | 1. Launch app 2. Enter password 3. Tap "Show password" 4. Tap "Hide password" | password: MySecret123! | Password toggles between masked and visible text; toggle icon changes | — | — | auth/AUTH-016-password-toggle-visibility |
| AUTH-018 | Login button loading state | 1. Launch app 2. Enter valid credentials 3. Tap "Sign in" 4. Observe notice during request | email: test@example.com, password: Test1234! | "Signing you in..." notice displayed during request; button shows loading spinner and is disabled; prevents double-submit | — | — | auth/AUTH-018-login-button-loading-state |
| AUTH-020 | Session restore on relaunch | 1. Launch app 2. Login 3. Kill app (press Home) 4. Relaunch app without clearing state | email: test@example.com, password: Test1234! | App restores to authenticated shell (Dashboard visible); login screen not shown | — | — | auth/AUTH-020-session-restore |
| AUTH-021 | Password reset complete flow | 1. Request password reset via AUTH-009 2. Open email client 3. Tap reset link in email 4. Enter new password 5. Enter matching confirm password 6. Tap "Update password" | new_password: NewSecure456! | "Password updated. Sign in with your new password." shown; login mode displayed; old password no longer works | — | — | — |
| AUTH-022 | Google Sign-In | 1. Launch app 2. Tap "Google" button 3. Select Google account in OS dialog 4. Wait for auth | (Google test account) | Google OS account picker appears; after selection, user lands on dashboard or consent screen | — | — | — |
| AUTH-023 | Email verification deep link | 1. Register new account requiring email verification 2. Open email client 3. Tap verification link 4. Return to app | (new registration credentials) | "Email verified! You can now log in." shown; app switches to login mode | — | — | — |

---

## Module 2: Privacy Consent

**Description:** Tests for the first-launch privacy consent flow including display, acceptance, and bypass prevention.

**Precondition:** App installed on Android emulator with clear state (fresh install or cleared data).

**Post Condition:** Consent status matches test intent (granted / dismissed).

**Date Prepared:** 2026-07-14

**Date Executed:** —

| Test No. | Test Case | Test Steps | Test Data | Expected Result | Actual Result | Remarks | Screenshot Name |
|---|---|---|---|---|---|---|---|
| CONSENT-001 | First-launch consent shown | 1. Launch app with clear state 2. Register new account 3. Wait for consent screen | email: new_user@odin-test.com, password: Test1234! | Privacy consent bottom sheet appears with "Privacy & consent" title and "Agree & continue" button | — | — | consent/CONSENT-001-first-launch-consent-shown |
| CONSENT-002 | Accept consent and proceed | 1. Register new user 2. Wait for consent screen 3. Tap "Agree and continue" | email: consent_accept@odin-test.com, password: Test1234! | Consent accepted; app proceeds to authenticated shell (dashboard visible) | — | — | consent/CONSENT-002-accept-consent-proceed |
| CONSENT-004 | Cannot bypass consent | 1. Register new user 2. Wait for consent screen 3. Tap backdrop to dismiss | email: consent_bypass@odin-test.com, password: Test1234! | Consent dismissed; user returned to login screen; app is not entered without consent | — | — | consent/CONSENT-004-cannot-bypass-consent |

---

## Module 3: Settings

**Description:** Tests for the settings page including privacy toggles, data export, and account deletion flows.

**Precondition:** App installed on Android emulator, user authenticated with valid session.

**Post Condition:** Settings state matches test intent; account status unchanged unless deletion tested.

**Date Prepared:** 2026-07-14

**Date Executed:** —

| Test No. | Test Case | Test Steps | Test Data | Expected Result | Actual Result | Remarks | Screenshot Name |
|---|---|---|---|---|---|---|---|
| SET-001 | Toggle privacy setting | 1. Login 2. Navigate to Settings 3. Scroll to Personalization toggle 4. Tap toggle | (standard login credentials) | Toggle switches state; setting persisted via API | — | — | settings/SET-001-toggle-privacy-setting |
| SET-002 | Data export happy path | 1. Login 2. Navigate to Settings 3. Scroll to "Export your data" 4. Tap 5. Tap "Export my data" | (standard login credentials) | Export request submitted; status message shown | — | — | settings/SET-002-data-export-happy-path |
| SET-004 | Account deletion flow | 1. Login 2. Navigate to Settings 3. Scroll to "Delete account" 4. Tap 5. Check confirmation checkbox 6. Tap "Delete my account" | (standard login credentials) | Deletion requested screen shown with 30-day grace period message | — | — | settings/SET-004-account-deletion-flow |
| SET-005 | Account deletion cancel | 1. Login 2. Navigate to Settings 3. Scroll to "Delete account" 4. Tap 5. Tap "Cancel" | (standard login credentials) | Returned to settings; account remains active | — | — | settings/SET-005-account-deletion-cancel |
| SET-006 | Settings error and retry | 1. Login 2. Navigate to Settings 3. Simulate API failure (disconnect backend or use proxy) 4. Observe error state 5. Tap "Retry" | (standard login credentials, backend unreachable) | Error message displayed with "Retry" button; tapping Retry re-fetches settings; success restores settings view | — | — | — |

---

## Module 4: Navigation

**Description:** Tests for bottom tab navigation, drawer menu navigation, and Android back button behavior.

**Precondition:** App installed on Android emulator, user authenticated with valid session.

**Post Condition:** Navigation state matches test intent; user on expected screen.

**Date Prepared:** 2026-07-14

**Date Executed:** —

| Test No. | Test Case | Test Steps | Test Data | Expected Result | Actual Result | Remarks | Screenshot Name |
|---|---|---|---|---|---|---|---|
| NAV-001 | Bottom tab navigation | 1. Login 2. Tap "Home" tab 3. Verify Dashboard 4. Tap "History" tab 5. Verify History 6. Tap "Assistant" tab 7. Verify Assistant 8. Tap "Savings" tab 9. Verify Savings | (standard login credentials) | Each tab shows correct screen; active tab highlighted | — | — | navigation/NAV-001-bottom-tab-navigation |
| NAV-002 | Drawer navigation | 1. Login 2. Tap hamburger menu 3. Verify drawer sections 4. Tap "Transactions" 5. Open drawer again 6. Tap "Spending Forecast" 7. Close drawer | (standard login credentials) | Drawer opens/closes; each item navigates to correct page; overlay tap closes drawer | — | — | navigation/NAV-002-drawer-navigation |
| NAV-005 | Back button behavior | 1. Login 2. Navigate to Settings via drawer 3. Press Android back button | (standard login credentials) | Returns to dashboard; no crash; navigation stack respected | — | — | navigation/NAV-005-back-button-behavior |

---

## Module 5: Offline / Sync

**Description:** Tests for app behavior during network connectivity loss, offline indicator display, and automatic sync on reconnect.

**Precondition:** App installed on Android emulator, user authenticated. Tests use `setAirplaneMode` (Android-only).

**Post Condition:** Connectivity restored; app functional.

**Date Prepared:** 2026-07-14

**Date Executed:** —

| Test No. | Test Case | Test Steps | Test Data | Expected Result | Actual Result | Remarks | Screenshot Name |
|---|---|---|---|---|---|---|---|
| SYNC-001 | App usable in airplane mode | 1. Login 2. Enable airplane mode 3. Verify Dashboard visible 4. Navigate tabs 5. Disable airplane mode | (standard login credentials) | App remains functional with cached data; no crash; navigation works offline | — | — | offline/SYNC-001-app-usable-offline |
| SYNC-002 | Offline blocks settings change | 1. Login 2. Enable airplane mode 3. Navigate to Settings 4. Tap Personalization toggle 5. Disable airplane mode | (standard login credentials) | Toast "Can't save while offline" shown; toggle does not persist; settings remain unchanged | — | — | offline/SYNC-002-offline-indicator-shown |
| SYNC-004 | Sync on reconnect | 1. Login 2. Enable airplane mode 3. Wait 4. Disable airplane mode 5. Wait for sync | (standard login credentials) | App syncs automatically on reconnect; data fresh; no errors | — | — | offline/SYNC-004-sync-on-reconnect |
| SYNC-005 | Logout blocked while offline | 1. Login 2. Enable airplane mode 3. Attempt logout 4. Verify "This action can only be done while online" toast 5. Disable airplane mode 6. Logout succeeds 7. Verify login screen | (standard login credentials) | Logout blocked with toast while offline; logout succeeds after reconnect; returned to login screen | — | — | offline/SYNC-005-logout-after-offline |

---

## Module 6: Security

**Description:** Tests for session management security and input sanitization.

**Precondition:** App installed on Android emulator, API server reachable.

**Post Condition:** No unauthorized access; inputs sanitized.

**Date Prepared:** 2026-07-14

**Date Executed:** —

| Test No. | Test Case | Test Steps | Test Data | Expected Result | Actual Result | Remarks | Screenshot Name |
|---|---|---|---|---|---|---|---|
| SEC-003 | Session invalidation on logout | 1. Login 2. Navigate to Settings 3. Tap "Log out" 4. Verify login screen 5. Verify dashboard not visible | (standard login credentials) | Returned to login; "Dashboard" not visible; session invalidated | — | — | security/SEC-003-session-invalidation-logout |
| SEC-005 | SQL injection in inputs | 1. Launch app 2. Enter SQL payload in email field 3. Enter SQL payload in password field 4. Tap "Sign in" | email: ' OR 1=1 --, password: ' OR 1=1 -- | Error "Sign in failed" shown; no unauthorized access; input sanitized | — | — | security/SEC-005-sql-injection-inputs |

---

## Module 7: Categories / Taxonomy

**Description:** Tests for the categories and taxonomy management including viewing groups, CRUD operations on categories and subcategories, form validation, and navigation.

**Precondition:** App installed on Android emulator, user authenticated with valid session.

**Post Condition:** Category state matches test intent; no orphaned records.

**Date Prepared:** 2026-07-15

**Date Executed:** —

| Test No. | Test Case | Test Steps | Test Data | Expected Result | Actual Result | Remarks | Screenshot Name |
|---|---|---|---|---|---|---|---|
| TAX-001 | View category groups | 1. Login 2. Navigate to Categories via drawer 3. Verify group headers | (standard login credentials) | Four category groups visible: Essentials, Obligatory, Discretionary, Financial Allocation | — | — | categories/TAX-001-view-category-groups |
| TAX-002 | Expand and collapse group | 1. Login 2. Navigate to Categories 3. Tap "Essentials" group 4. Verify categories shown 5. Tap again to collapse | (standard login credentials) | Group expands showing categories within; tapping again collapses; caret icon toggles direction | — | — | categories/TAX-002-expand-collapse-group |
| TAX-003 | Create category | 1. Login 2. Navigate to Categories 3. Tap create button (+) 4. Select group 5. Enter label 6. Enter description 7. Tap "Save" | label: Maestro Test Category, description: Automated test category | Modal closes; new category appears in its group; category count updates | — | — | categories/TAX-003-create-category |
| TAX-004 | Edit category | 1. Login 2. Navigate to Categories 3. Expand group 4. Tap edit (pencil) on a non-system category 5. Modify label 6. Tap "Save" | updated_label: Maestro Edit Target Renamed | Modal closes; category label updated in the list | — | — | categories/TAX-004-edit-category |
| TAX-005 | Delete category | 1. Login 2. Navigate to Categories 3. Expand group 4. Tap delete (trash) on a non-system category 5. Confirm deletion in dialog | (test category created for this purpose) | Confirmation dialog shown; after confirm, category removed from list; group count updates | — | — | categories/TAX-005-delete-category |
| TAX-006 | Navigate to subcategories | 1. Login 2. Navigate to Categories 3. Expand Essentials 4. Tap a category row 5. Verify subcategory view 6. Press back | (standard login credentials) | Subcategory list shown with breadcrumb "Categories / {name}"; back returns to groups | — | — | categories/TAX-006-navigate-subcategories |
| TAX-007 | Create subcategory | 1. Login 2. Navigate to Categories 3. Expand Essentials 4. Tap add subcategory (+) on a category 5. Enter label 6. Enter description 7. Tap "Save" | label: Maestro Subcategory, description: Automated test subcategory | Modal closes; subcategory created; category subcount updates | — | — | categories/TAX-007-create-subcategory |
| TAX-008 | Category form validation | 1. Login 2. Navigate to Categories 3. Tap create button 4. Tap "Save" without filling fields 5. Observe errors 6. Fill label only 7. Tap "Save" 8. Cancel | (none) | "Label is required" shown first; "Description is required" shown after filling label only; cancel returns to categories | — | — | categories/TAX-008-form-validation |

---

## Appendix: Automated vs Manual Coverage

### Automated (Maestro — 31 test cases)

| Module | Automated IDs |
|---|---|
| Authentication | AUTH-001, AUTH-002, AUTH-003, AUTH-006, AUTH-008, AUTH-009, AUTH-016, AUTH-018, AUTH-020 |
| Privacy Consent | CONSENT-001, CONSENT-002, CONSENT-004 |
| Settings | SET-001, SET-002, SET-004, SET-005 |
| Navigation | NAV-001, NAV-002, NAV-005 |
| Offline / Sync | SYNC-001, SYNC-002, SYNC-004, SYNC-005 |
| Security | SEC-003, SEC-005 |
| Categories / Taxonomy | TAX-001, TAX-002, TAX-003, TAX-004, TAX-005, TAX-006, TAX-007, TAX-008 |

### Not Automated (Manual / Different Tooling — 43 test cases)

| Module | IDs | Reason |
|---|---|---|
| Authentication | AUTH-004, AUTH-005, AUTH-007, AUTH-010, AUTH-011, AUTH-012, AUTH-013, AUTH-014, AUTH-015, AUTH-017, AUTH-021, AUTH-022, AUTH-023 | Account lockout, Google OAuth, email verification link, session expiry, password reset complete flow, email verification deep link require backend harness, OS-level interaction, or email client access |
| Privacy Consent | CONSENT-003, CONSENT-005, CONSENT-006, CONSENT-007 | SDK traffic verification, consent persistence, analytics gating need network inspection tools |
| Settings | SET-003, SET-006, SET-007, SET-008, SET-009 | Empty state, API failure simulation, deep link protection, long text need specific data setup or proxy tooling |
| Navigation | NAV-003, NAV-004, NAV-006, NAV-007, NAV-008 | Drawer overlay tap, deep links, tab state preservation, rapid switching, auth gate on all routes |
| Offline / Sync | SYNC-003, SYNC-006, SYNC-007, SYNC-008, SYNC-009, SYNC-010 | Write queueing, conflict resolution, intermittent connectivity, throttled network, mid-sync interruption, local data survival |
| Security | SEC-001, SEC-002, SEC-004, SEC-006, SEC-007 | Token storage inspection, PII key audit, HTTPS enforcement, XSS, screenshot protection |
| Accessibility | A11Y-001 through A11Y-005 | Touch targets, screen reader, contrast, focus order, dynamic type need dedicated accessibility tooling |
| Platform | PLAT-001 through PLAT-007 | App lifecycle, incoming calls, memory, dark mode, locale need device-level automation |
| Performance | PERF-001 through PERF-003 | Cold start timing, scroll FPS, memory leaks need profiling tools |
