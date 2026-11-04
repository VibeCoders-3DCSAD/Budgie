## 14. User Settings

### 14.1 Account and Profile

- View and edit the user profile
- View registered account information
- Change the password
- Log out of the account while protecting unsynced changes
- Open Categories from Settings to manage categories and subcategories as defined
  in [Income and Expense Categories](11-income-and-expense-categories.md)

### 14.2 Settings Forms

- Display name
- Password change credentials
- Personalization preference
- Model-training consent
- Research-evaluation consent
- Notification preferences
- Data-retention preference, when available

### 14.3 Settings Form Placeholders

- Display name: `Enter display name`
- Current password: `Enter current password`
- New password: `Enter new password`
- Confirm new password: `Re-enter new password`
- Personalization preference: `Select personalization preference`
- Model-training consent: `Select model-training preference`
- Research-evaluation consent: `Select research-evaluation preference`
- Data-retention preference: `Select data-retention preference `
- Problem report: `Describe the problem`

### 14.4 Settings Selectors

- Personalization: On / Off
- Model-training consent: Granted / Not granted
- Research-evaluation consent: Granted / Not granted
- Data-retention preference, when available
- Savings notification preference
- Budget notification preference
- Debt notification preference
- Forecast notification preference
- Overspending notification preference
- In-app notification preference
- Push notification preference

### 14.5 Settings Validation

- Require a valid display name when it is changed
- Require the current password for password changes
- Require a valid new password
- Require matching new-password fields
- Require an explicit choice for consent changes
- Prevent account deletion without explicit confirmation
- Preserve valid entries after validation failure
- Display validation feedback beside the affected field
- Clear field errors when corrected

### 14.6 Privacy and Consent

- View privacy settings
- Manage personalization consent
- Manage model-training consent
- Manage research-evaluation consent
- View thesis disclosure
- View data-use explanations
- View consent history and status
- View research eligibility separately from app access

### 14.7 Notification Preferences

- Manage savings notification preferences
- Manage budget notification preferences
- Manage debt notification preferences
- Manage forecast notification preferences
- Manage overspending notification preferences
- Manage in-app and push notification preferences

### 14.8 Data and Account Governance

- Export financial data as one CSV file; CSV is the only export format, so no
  format selector is shown
- Save the prepared file directly: a browser download on web, or the system
  folder picker on devices
- Keep the prepared file while the screen is open, so a closed picker or a second
  copy does not need another export
- View export status
- View export progress while the export is prepared: a progress bar showing how
  much of the user's data has been read, and a message naming the current step
  (starting, reading a data set, waiting to retry, building the file, saving)
- Respect the export rate limits: up to 120 batch reads a minute and up to 10 new
  exports an hour per user
- When batch reads are rate-limited, pause for the server's requested wait,
  count the remaining seconds down live, and keep the progress bar where it was
- When starting a new export is rate-limited, stop on the first refusal without
  retrying and show how many minutes to wait, from the server's requested wait
  rounded up
- Do not retry a request when the server asks for a wait longer than 30 seconds
- Retry dropped connections and server errors after a short wait, keeping the
  progress already made
- Manage data-retention preferences when available
- Request account deletion
- Review deletion consequences
- Schedule the deletion no sooner than 30 days after the request, and show the
  scheduled date
- Cancel a pending deletion before its scheduled date to keep the account
- View deletion request history: the 20 most recent requests, newest first, each
  with its request date and status (Pending with its scheduled date, Cancelled
  with its cancellation date, or Not confirmed)
- Process confirmed deletions in a daily job at midnight (Asia/Manila): every
  account past its scheduled date is deleted with all its data, one account at a
  time, so one failure does not block the rest
- Keep a failed deletion queued and retry it in the next daily run
- Keep only a log of each processed request with no user id or personal data
- Protect unsynced changes before account actions

### 14.9 Sync and Connectivity

- View synchronization status
- View pending and failed sync activity
- Retry failed synchronization
- Manually start synchronization
- Recover from exhausted sync failures
- Discard failed local changes with confirmation
- View offline and network-required states

### 14.10 Help and About

- Provide Replay tutorial under Settings → Help and About, following
  [User Onboarding](04-user-onboarding.md)
- Start a replay at the Dashboard stage with fresh tour progress, without
  resetting financial data, questionnaire answers, or preferences
- Provide Resume tutorial under the same Help and About section when unfinished
  progress exists, continuing from the last unfinished step
- Keep replaying or resuming the guided tour separate from completing the Savings
  and Debt Profile Questionnaire
- Allow users to replay or resume the tour offline after the application is
  accessible locally

- View frequently asked questions
- View offline help content
- View sync guidance
- Report a problem
- View app version
- View thesis project information
- View the decision-support disclaimer
- View privacy information and applicable terms

### 14.11 Settings States

- Initial state: settings are ready for use
- Loading state: profile, preferences, consent, or sync data is loading
- Hydration state: authenticated account state is being resolved before protected settings render
- Incomplete-profile state: required profile information is missing
- Unsaved-changes state: editable settings differ from saved values
- Saving state: a settings change is being saved
- Password-change state: password credentials are being updated
- Consent-review state: consent history and current decisions are displayed
- Export-preparing state: financial data export is being prepared; a progress
  bar fills as each data set is read, and a message describes the current step
- Export-retrying state: a request was interrupted and the export waits before
  retrying, keeping the progress already made
- Export-rate-limited state: the server asked the export to slow down; the export
  waits as long as the server asked, counts down to when it resumes, and keeps the
  progress already made
- Export-limit-reached state: too many exports were started; the export stops and
  tells the user how many minutes to wait before trying again
- Export-saving state: the prepared file is being saved to the device or downloaded
- Export-ready state: the export is prepared but not saved yet, for example
  because the save picker was closed; the user can save it again
- Export-saved state: the export file was saved or downloaded
- Export-failed state: the export could not be prepared
- Deletion-confirmation state: the user must review and confirm account deletion
- Deletion-pending state: account deletion has been requested and may be canceled
  until its scheduled date
- Deletion-history state: past deletion requests and their cancellations are listed
- Offline state: cached settings are available while network-required actions are unavailable
- Syncing state: local changes are being synchronized
- Sync-failed state: synchronization failed and can be retried
- Validation-failure state: settings input is invalid
- Error state: settings data could not be loaded or saved
- Success state: the requested settings action completed

### 14.12 Settings Messages

#### Validation Messages

- Invalid settings input: `Some settings need attention. Correct the marked fields and try again.`
- Settings validation failure: `Some settings could not be accepted. Correct the marked fields and try again.`

#### Error Messages

- Incomplete profile: `Your profile is missing required information. Complete the missing details and try again.`
- Export failed: `Your data export could not be prepared. Try the export again.`
- Export limit reached: `You have started too many exports. Try again in {minutes} minutes.`
- Sync failed: `Your changes could not be sent. Check your connection and try again.`
- Settings error: `Your settings could not be loaded or saved. Try again.`
- Loading failure: `Your settings are still loading. Wait a moment and try again.`

#### Notice Messages

- Initial state: `Your settings are ready. Review or update your preferences when you are ready.`
- Offline settings: `Some settings are available without internet access. Reconnect before using network-required actions.`
- Hydration: `Your account security is still being checked. Wait until settings finish loading.`
- Incomplete profile: `Your profile is incomplete. Add the missing information before continuing.`
- Unsaved changes: `You have unsaved settings changes. Save them or leave without saving.`
- Consent review: `Your consent choices are ready to review. Confirm each choice before saving.`
- Export ready: `Your financial data export is ready. Save it before leaving this screen, or it must be prepared again.`
- Deletion pending: `Your account deletion request is pending. Cancel the request before it is processed if you want to keep your account.`
- Deletion scheduled: `Scheduled for {date}`
- Deletion not confirmed: `The request was never confirmed`

#### Progress and Success Messages

- Settings loading: `Your settings are loading. Wait a moment for them to appear.`
- Password change: `Your password is being updated. Wait for confirmation before signing in again.`
- Settings syncing: `Your local settings changes are syncing. Keep the app open until syncing finishes.`
- Settings saving: `Your settings are being saved. Wait a moment for the update to finish.`
- Settings saved: `Your settings were saved. Continue using the app.`
- Export starting: `Your data export is starting. Keep this screen open.`
- Export reading: `Reading your {data set name} ({current} of {total}). Keep this screen open.`
- Export retrying: `The export is taking a short break before trying again. Your progress is kept.`
- Export rate-limited: `Too many requests were sent at once. The export resumes in {seconds} seconds. Your progress is kept.`
- Export building: `Your export file is being built. This only takes a moment.`
- Export saving: `Your export file is being saved. Choose where to keep it if asked.`
- Export saved: `{file name} · {record count} records`
- Deletion cancelled: `Deletion request cancelled. Your account stays.`

#### Confirmation Messages

- Account deletion confirmation: `Deleting your account removes your account and associated financial data. Cancel to keep your account or confirm deletion to continue.`

#### Recovery Messages

- Sync recovery: `Some settings changes could not be synchronized. Retry them or review the failed changes before discarding anything.`
