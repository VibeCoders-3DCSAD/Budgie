import { router, useFocusEffect, type Href } from "expo-router";
import { useCallback, useRef, type ReactNode } from "react";
import { BackHandler } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ROUTES } from "../../../routes";
import { useRefocusKey } from "../hooks/useRefocusKey";
import { goBackOr } from "../helpers/shellNavigation";
import { shellPalette } from "../theme";
import { InnerHeader } from "./InnerHeader";
import { PageScroll } from "./PageScroll";

type Props = {
  title: string;
  // Where Back goes when the page was opened without history; defaults to Home.
  fallbackHref?: Href;
  onScrollBeginDrag?: () => void;
  // Stays fixed under the back header while the content scrolls (the glossary search bar).
  header?: ReactNode;
  children: ReactNode;
};

// Frame for pages outside the tabs: back header and scrolling content, no tab bar.
export function InnerPage({ title, fallbackHref = ROUTES.dashboard, onScrollBeginDrag, header, children }: Props) {
  const interceptRef = useRef<(() => boolean) | null>(null);
  const setBackIntercept = useCallback((intercept: (() => boolean) | null) => { interceptRef.current = intercept; }, []);
  const goBack = useCallback(() => {
    if (interceptRef.current?.()) return;
    goBackOr(fallbackHref);
  }, [fallbackHref]);

  // Android back runs the same intercept; with history left the navigator pops the page itself.
  useFocusEffect(useCallback(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (interceptRef.current?.()) return true;
      if (router.canGoBack()) return false;
      router.replace(fallbackHref);
      return true;
    });
    return () => subscription.remove();
  }, [fallbackHref]));

  const visit = useRefocusKey();

  return (
    <SafeAreaView style={{ backgroundColor: shellPalette.shell }} className="flex-1">
      <InnerHeader title={title} onBack={goBack} />
      {header}
      <PageScroll scrollKey={String(visit)} tabBarShown={false} onScrollBeginDrag={onScrollBeginDrag} back={{ setBackIntercept, goBack }}>
        {children}
      </PageScroll>
    </SafeAreaView>
  );
}
