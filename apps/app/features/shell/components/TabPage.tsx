import { useCallback, type ReactNode } from "react";
import { SafeAreaFrame } from "../../../components/SafeAreaFrame";
import { ROUTES } from "../../../routes";
import { useRefocusKey } from "../hooks/useRefocusKey";
import { goBackOr, type Hub, type ShellTab } from "../helpers/shellNavigation";
import { shellPageColor } from "../helpers/shellColors";
import { shellPalette } from "../theme";
import { HubSegments, HubTitle } from "./HubHeader";
import { PageScroll } from "./PageScroll";
import { TopBar } from "./TopBar";

type Props = {
  tab: ShellTab;
  // Hides the top bar and tab bar padding (Activity while editing in place).
  hideChrome?: boolean;
  hub?: { hub: Hub; pathname: string };
  showScrollToEnd?: boolean;
  children: ReactNode;
};

const noIntercept = () => {};

// Frame for the four tab pages: top bar, then scrolling content above the floating tab bar.
export function TabPage({ tab, hideChrome = false, hub, showScrollToEnd, children }: Props) {
  const backgroundColor = hideChrome ? shellPalette.shell : shellPageColor(tab);
  const goBack = useCallback(() => goBackOr(ROUTES.dashboard), []);
  const visit = useRefocusKey();

  return (
    <SafeAreaFrame style={{ backgroundColor }} className="flex-1">
      {hideChrome ? null : <TopBar backgroundColor={backgroundColor} divider={tab === "dashboard" || tab === "activity"} />}
      <PageScroll scrollKey={`${hub?.pathname ?? tab}:${visit}`} tabBarShown={!hideChrome} showScrollToEnd={showScrollToEnd}
        stickyHeaderIndex={hub ? 1 : undefined} back={{ setBackIntercept: noIntercept, goBack }}>
        {hub ? <HubTitle title={hub.hub.title} /> : null}
        {hub ? <HubSegments hub={hub.hub} pathname={hub.pathname} /> : null}
        {children}
      </PageScroll>
    </SafeAreaFrame>
  );
}
