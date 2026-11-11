import { createContext, forwardRef, type ReactNode } from "react";

// react-native-spotlight-tour ships untranspiled ES modules. Tests render the tour's own components and drive
// the runner directly, so the provider and AttachStep only need to pass their children through.
export const SpotlightTourProvider = forwardRef<unknown, { children: ReactNode }>(({ children }, _ref) => <>{children}</>);
export const SpotlightTourContext = createContext<{ current?: number; changeSpot?: (spot: unknown) => void; stop?: () => void }>({ current: undefined });
export const AttachStep = ({ children }: { children: ReactNode }) => <>{children}</>;
export const useSpotlightTour = () => ({ current: undefined, goTo: jest.fn(), next: jest.fn(), previous: jest.fn(), stop: jest.fn(), start: jest.fn(), pause: jest.fn(), resume: jest.fn(), status: "idle" });
export const flip = jest.fn();
export const offset = jest.fn();
export const shift = jest.fn();
