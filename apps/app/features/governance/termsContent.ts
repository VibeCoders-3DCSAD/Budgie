export type TermsSection = {
  heading: string;
  paragraphs: readonly string[];
};

// Draft v1 of the Terms & Conditions shown at first sign-in. Not yet reviewed by counsel.
export const TERMS_DRAFT_LABEL = "Draft v1";

export const TERMS_INTRO =
  "Please read these Terms & Conditions before using Budgie. By tapping \"Agree & continue\", you agree to them and to how we handle your data as described below.";

export const TERMS_SECTIONS: readonly TermsSection[] = [
  {
    heading: "1. About Budgie",
    paragraphs: [
      "Budgie is a personal finance app that helps you record transactions, track accounts, debts, bills and savings goals, and see budgeting insights and forecasts. Budgie is operated by the VibeCoders team (\"we\", \"us\").",
      "Each Budgie account belongs to one person. You may not share your account or use it to manage another person's finances without their consent.",
    ],
  },
  {
    heading: "2. Not financial advice",
    paragraphs: [
      "Insights, forecasts, financial health scores and suggestions in Budgie are estimates based on the data you enter. They are for information only and are not financial, investment, tax or legal advice.",
      "Budgie does not move money, connect to your bank, or make payments for you. You are responsible for your own financial decisions.",
    ],
  },
  {
    heading: "3. Your account",
    paragraphs: [
      "You must give accurate information when you register and keep your login details secure. Tell us right away if you think someone else has accessed your account.",
      "You are responsible for activity on your account. We may suspend or close accounts that break these terms or are used for unlawful purposes.",
    ],
  },
  {
    heading: "4. Your data",
    paragraphs: [
      "Your financial records belong to you. We use them only to run Budgie for you: storing and syncing your records, computing balances, and generating your insights and forecasts.",
      "Budgie keeps a copy of your records on your device so it works offline, and syncs them to our servers when you are online. Anyone with access to your unlocked device may be able to see this data.",
      "We never sell your data. We do not share it with third parties except service providers that help us host and run Budgie, or when the law requires it.",
      "Using your data to improve our models or for research is optional and off unless you turn it on in Privacy settings.",
    ],
  },
  {
    heading: "5. Your privacy rights",
    paragraphs: [
      "We process personal information in line with the Data Privacy Act of 2012 (Republic Act No. 10173). You have the right to be informed, to access, correct and download your data, to object to processing, and to have your data deleted.",
      "You can change your privacy choices, request a copy of your data, or delete your account from Settings at any time. Deleting your account permanently removes your records after the stated waiting period.",
    ],
  },
  {
    heading: "6. Acceptable use",
    paragraphs: [
      "Do not try to break, overload, reverse engineer or get unauthorized access to Budgie or other users' data, and do not use Budgie for fraud, money laundering or any other illegal activity.",
    ],
  },
  {
    heading: "7. Availability and accuracy",
    paragraphs: [
      "We work to keep Budgie available and accurate, but it is provided \"as is\". We do not guarantee it will be error-free or always available, and calculations depend on the data you enter.",
      "To the extent the law allows, we are not liable for losses from decisions you make based on Budgie, or from data loss caused by things outside our control. Keep your own records of important financial information.",
    ],
  },
  {
    heading: "8. Changes to these terms",
    paragraphs: [
      "We may update these terms. When we make a change that affects you, we will ask you to review and accept the new version before you continue using Budgie.",
    ],
  },
  {
    heading: "9. Contact",
    paragraphs: [
      "Questions about these terms or your data? Contact the VibeCoders team through the support channel listed in the app.",
    ],
  },
];
