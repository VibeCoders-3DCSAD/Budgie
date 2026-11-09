// Tour wording from spec 04 §4.8.
export const TOUR_MESSAGES = {
  initial: "Welcome to Budgie. Take a guided tour to learn where things are and how to use them.",
  practice: "This is a tutorial example. It will not change your balances or financial records.",
  paused: "Continue whenever you are ready. Open Settings → Help and About → Resume tutorial.",
  skipped: "You can start the tour anytime from Settings → Help and About → Replay tutorial.",
  resume: "Continue your tutorial from where you left off.",
  targetUnavailable: "This step is unavailable right now. Retry, skip this step, or continue later.",
  saveFailed: "Your tutorial progress could not be saved. You can continue, but you may need to repeat this step later.",
  replay: "To take the tour again, tap your profile icon, open Settings → Help and About, and choose Replay tutorial.",
  complete: "You're ready! Replay this tutorial anytime from Settings → Help and About → Replay tutorial.",
  error: "The tutorial could not be loaded. Try again or continue using the app.",
} as const;
