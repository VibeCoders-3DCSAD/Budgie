// Default for tests that render shared UI (like the TermInfo (i) button) without a navigator.
// Route tests still replace it with their own jest.mock("expo-router", ...) factory.
export const router = { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => false) };
export const useRouter = () => router;
export const useLocalSearchParams = () => ({});
