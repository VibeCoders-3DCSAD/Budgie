import type { ReactNode } from "react";
import { Pressable, Text } from "react-native";

// Stand-in navigator for route tests: Protected renders its screens only when the guard passes.
export function Stack({ children }: { children: ReactNode }) { return <>{children}</>; }
Stack.Protected = function Protected({ guard, children }: { guard: boolean; children: ReactNode }) {
  return guard ? <>{children}</> : null;
};
Stack.Screen = function Screen({ name }: { name: string }) { return <Text>{`screen:${name}`}</Text>; };

export function Redirect({ href }: { href: string }) { return <Text>{`redirect:${href}`}</Text>; }

export function PinAccessScreen() { return <Text>pin</Text>; }

export function OnboardingFlow({ onComplete }: { onComplete: () => void }) {
  return <Pressable onPress={onComplete}><Text>onboarding</Text></Pressable>;
}

export function SafeAreaProvider({ children }: { children: ReactNode }) { return <>{children}</>; }

export function Icon() { return null; }
