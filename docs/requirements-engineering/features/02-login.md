## 2. Login

This specification covers Login, password recovery, sessions, and logout.
[Account Registration](01-account-registration.md) owns account creation and
email verification. Login restricts access until email verification is complete.

### 2.1 Account Access

- Log in with email and password
- Log in with Google
- Recover a forgotten password
- Log out
- Accept the Terms & Conditions before first use
- Display authentication and network errors

### 2.1.1 Terms & Conditions Consent

- Show the Terms & Conditions in a centred modal after sign-in when the user has
  not accepted the current terms version
- Show the terms version caption above the terms text
- Keep Agree & continue disabled until the terms text is scrolled to the end;
  text that fits without scrolling counts as read
- Record consent for the current terms version when the user agrees, then
  continue to the app
- Lock the app when the user declines or presses the Android back button; the
  modal cannot be dismissed without a choice
- Do not ask again users who already accepted the current terms version
- Ask again when the terms version changes

### 2.2 Authentication Forms

- Login: email and password
- Forgot password: email
- Password validation and matching-password validation during password recovery
- Email placeholder: `you@example.com`
- Password placeholder: `Enter your password`
- Forgot-password email placeholder: `Enter your registered email`

### 2.3 Authentication States

- Initial state: authentication form is ready for input
- Empty-input state: required fields are blank and submission is blocked
- Validation-failure state: one or more fields contain invalid values or mismatched new passwords
- Submitting state: authentication request is in progress and duplicate submission is prevented
- Invalid-credentials state: submitted login details are not accepted
- Email-unverified state: access is restricted until email verification is completed
- Network-required state: the action cannot continue without an internet connection
- Network-error state: the request failed because connectivity was interrupted
- Server-error state: the authentication service could not complete the request
- Rate-limited state: the user must wait before retrying
- Success state: the requested authentication action completed
- Password-reset-sent state: the reset request was accepted
- Session-expired state: the user must authenticate again
- Terms-unread state: the terms are shown and Agree & continue is disabled until the text is scrolled to the end
- Terms-read state: the terms have been read to the end and the user can agree or decline
- Consent-submitting state: the consent is being recorded and duplicate submission is prevented
- Consent-declined state: the user declined the terms and the app is locked

### 2.4 Authentication Validation

- Prevent submission when required inputs are empty
- Reject malformed email addresses
- Enforce password requirements
- Trim and normalize supported text inputs before validation
- Display validation feedback beside the affected input
- Preserve valid user input after validation failure
- Clear field-level errors when the corresponding input is corrected
- Keep authentication errors understandable and free of sensitive details

### 2.5 Authentication Messages

#### Validation Messages

- Empty email: `Enter your email first. Add your email before continuing.`
- Empty password: `Enter your password first. Add your password before continuing.`
- Invalid email during password recovery: `Enter a valid registered email. Check the address and try again.`
- Missing password: `Password is required. Enter your password before continuing.`
- Invalid password: `Your password does not meet the requirements. Choose a stronger password and try again.`
- Missing new password: `Choose a new password first. Enter a new password before continuing.`
- Mismatched new passwords: `Your new passwords do not match yet. Enter the same password in both fields.`

#### Authentication Error Messages

- Invalid credentials: `Your email or password was not accepted. Check your details and try again.`
- Unverified email: `Your email is not verified yet. Verify it first, then sign in.`
- Rate limited: `Too many attempts were made. Wait before trying again.`
- Invalid email address: `That email address is not valid. Enter a valid email address and try again.`
- Required refresh token: `Your session token is missing. Sign in again and retry.`
- Required Google token: `Your Google sign-in token is missing. Start Google sign-in again.`
- Google sign-in unavailable: `Google sign-in is not available right now. Use email and password instead.`
- Google sign-in cancelled: `Google sign-in was cancelled. Start it again or use email and password.`
- Google sign-in failure: `Google sign-in failed. Try again or use email and password.`
- Authentication failure: `Authentication failed. Check your details and try again.`
- Bad request: `Your request is not valid. Check your input and try again.`
- Authentication service failure: `The app could not complete that request. Please try again.`
- Session bootstrap failure: `Your session could not be started. Sign in again and try again.`
- Profile bootstrap failure: `Your profile could not be loaded. Try again.`
- Session restore failure: `Your session could not be restored. Sign in again.`
- Consent status failure: `Your consent status could not be checked. Try again.`
- Consent save failure: `Consent service is unavailable. Please try again.`
- Missing access token: `No sign-in session was returned. Sign in again and try again.`
- Logout failure: `Logout failed. Check your connection and try again.`

#### Network and Session Error Messages

- Network required: `No internet connection is available. Connect to the internet and try again.`
- Network error: `Odin could not be reached. Check your internet connection and try again.`
- Request timeout: `The request timed out. Check your connection and try again.`
- Missing authorization token: `Your sign-in session is missing. Sign in again and retry.`
- Missing recovery session: `Your recovery session is missing. Request a new reset link and open it on this device.`
- Expired session: `Your secure session is no longer valid. Sign in again to continue.`

#### Password Recovery Messages

- Password reset failure: `Your password reset request failed. Check your connection and try again.`
- Password reset accepted: `If that email exists, a reset link is on the way now. Check your inbox to continue.`
- Password update failure: `Your password could not be updated. Check your details and try again.`
- Password update success: `Your password was updated. Sign in with your new password.`
- Generic failure: `Something went wrong. Please try again.`
- Session-expired instructions: `Your secure session is no longer valid. Sign in again to protect your account.`
- Recovery-session ready: `Your reset session is ready. Choose a new password to continue.`
- Recovery-session missing: `This reset link did not include a recovery session. Request a new reset link and open it on this device.`

#### Authentication Progress and Success Messages

- Login in progress: `Signing you in... Please wait a moment.`
- Verification-link progress: `Opening your reset session... Please wait a moment.`
- Password-reset progress: `Sending your reset link... Please wait a moment.`
- Password-update progress: `Updating your password... Please wait a moment.`
- Google-login progress: `Opening Google sign-in... Please wait a moment.`
- Logout progress: `Logging you out... Please wait a moment.`
- Logged-out success: `You are logged out. Sign in again when you are ready.`
- Terms unread: `Scroll to the end to accept.`
- Terms read: `By continuing you agree to these terms.`
- Native Google logout warning: `Logged out from Odin. Google sign-out could not be completed; try again from Google later.`
