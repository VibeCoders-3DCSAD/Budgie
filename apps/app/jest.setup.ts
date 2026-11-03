import { configure } from "@testing-library/react-native";

// A test file's first render also loads react-native's lazily required components, and a CI runner is slower
// than a dev machine, so the 1 s default made the first waitFor in FinancialPlanScreen.test.tsx fail on CI.
// waitFor returns as soon as its check passes, so passing tests are no slower. Kept under Jest's 5 s test
// timeout so a real failure still reports waitFor's message.
configure({ asyncUtilTimeout: 4_000 });
