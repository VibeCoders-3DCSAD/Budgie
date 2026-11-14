## Account Registration

Allows users to securely create an account and verify their email address.
[Login](02-login.md) owns Login, password recovery,
sessions, and logout after registration.

### Account Creation and Email Verification

- Register an account with email and password
- Verify email ownership using the verification link
- Resend the verification email when needed
- Direct users to Login after email verification is complete
- Display registration, verification, and network errors

### Registration Form

- Registration: email, password, and password confirmation
- Email placeholder: `you@example.com`
- Password placeholder: `Enter your password`
- Password confirmation placeholder: `Re-enter your password`

### Registration and Verification States

- Initial state: registration form is ready for input
- Empty-input state: required fields are blank and submission is blocked
- Validation-failure state: one or more fields contain invalid or mismatched values
- Submitting state: registration request is in progress and duplicate submission is prevented
- Account-exists state: registration email is already associated with an account
- Email-unverified state: the account is created and requires email verification before sign-in
- Verification-pending state: the user must open the verification link sent to their email
- Verifying state: email verification is in progress
- Resending state: a new verification email is being requested
- Network-required state: the action cannot continue without an internet connection
- Network-error state: the request failed because connectivity was interrupted
- Server-error state: the authentication service could not complete the request
- Rate-limited state: the user must wait before retrying
- Success state: account creation completed and email verification is required
- Email-verified state: email verification completed and the user can sign in

### Registration Validation

- Prevent submission when required inputs are empty
- Reject malformed email addresses
- Enforce password requirements
- Require matching password and confirmation during registration
- Trim and normalize supported text inputs before validation
- Display validation feedback beside the affected input
- Preserve valid user input after validation failure
- Clear field-level errors when the corresponding input is corrected
- Keep registration and verification errors understandable and free of sensitive details

### Registration and Verification Messages

- Empty email: `Enter your email first. Add your email before continuing.`
- Empty password: `Enter your password first. Add your password before continuing.`
- Invalid email during registration: `Use a valid email to create your account. Check the format and try again.`
- Missing password: `Password is required. Enter your password before continuing.`
- Invalid password: `Your password does not meet the requirements. Choose a stronger password and try again.`
- Mismatched registration passwords: `Your passwords do not match yet. Enter the same password in both fields.`
- Existing account: `An account with this email already exists. Sign in or use a different email address.`
- Rate limited: `Too many attempts were made. Wait before trying again.`
- Invalid email address: `That email address is not valid. Enter a valid email address and try again.`
- Bad request: `Your request is not valid. Check your input and try again.`
- Authentication service failure: `The app could not complete that request. Please try again.`
- Registration failure: `Registration failed. Please try again.`
- Network required: `No internet connection is available. Connect to the internet and try again.`
- Network error: `Budgie could not be reached. Check your internet connection and try again.`
- Request timeout: `The request timed out. Check your connection and try again.`
- Verification failure: `We could not verify your email yet. Open the latest verification link and try again.`
- Verification resend failure: `The verification email could not be sent. Check your connection and try again.`
- Verification sent: `A new verification email was sent to {email}. Check your inbox to continue.`
- Generic failure: `Something went wrong. Please try again.`
- Email verification complete: `Email verification completed. Return to sign in to continue.`
- Verification-link instructions: `Check {email} for Budgie's verification link. The link confirms email ownership and unlocks sign-in.`
- Verification reminder: `Verification email sent to {email}. Tap the link there, then come back and sign in.`
- Registration in progress: `Creating your Budgie account... Please wait a moment.`
- Account-created success: `Account created. One more step. Verify your email to continue.`
- Email-verified success: `Email verified. You can now log in. Sign in to continue.`
