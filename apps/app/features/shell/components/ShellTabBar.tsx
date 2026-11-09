import { router } from "expo-router";
import { Plus } from "phosphor-react-native";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ROUTES } from "../../../routes";
import { isTabBarVisible, shellTabs, type ShellTab } from "../helpers/shellNavigation";
import { shellPageColor } from "../helpers/shellColors";
import { useShellChromeStore } from "../stores/useShellChromeStore";
import { shellPalette as palette } from "../theme";
import { TourTarget } from "../../onboarding-tour/components/TourTarget";

const TOOLBAR_MAX_WIDTH = 430;

// Floats over the tab pages (they pad their content for it), with the Add transaction button in the middle.
export function ShellTabBar({ focusedTab }: { focusedTab: string | undefined }) {
  const { bottom: bottomInset } = useSafeAreaInsets();
  const activityEditing = useShellChromeStore((state) => state.activityEditing);
  if (!isTabBarVisible(focusedTab, activityEditing)) return null;
  const backgroundColor = shellPageColor(focusedTab as ShellTab);

  return (
    <View className="absolute bottom-0 left-0 right-0 items-center">
      <View
        style={{ maxWidth: TOOLBAR_MAX_WIDTH, backgroundColor, paddingBottom: bottomInset + 8, minHeight: 62 + bottomInset }}
        className="w-full px-6 pt-[7px] flex-row items-start justify-between border-t border-[#EAEAE6]"
      >
        {shellTabs.flatMap(({ tab, href, label, Icon }, index) => {
          const selected = focusedTab === tab;
          const button = (
            <TourTarget key={tab} id={`tab-${tab}`}>
            <Pressable
              onPress={() => router.navigate(href)}
              accessibilityRole="tab"
              accessibilityLabel={label}
              accessibilityState={{ selected }}
              style={{ minWidth: 56, alignItems: "center", justifyContent: "flex-start", gap: 3 }}
            >
              <View style={{ width: 44, height: 28, borderRadius: 10, backgroundColor: selected ? palette.brand : "transparent", alignItems: "center", justifyContent: "center" }}>
                <Icon size={selected ? 18 : 21} color={selected ? "#FFFFFF" : palette.mut} weight={selected ? "fill" : "regular"} />
              </View>
              <Text style={{ fontFamily: "Manrope", fontSize: 11, fontWeight: selected ? "700" : "600", color: selected ? palette.brand : palette.mut }}>
                {label}
              </Text>
            </Pressable>
            </TourTarget>
          );
          if (index !== 2) return [button];
          return [
            <TourTarget key="add" id="tab-add">
            <Pressable
              onPress={() => router.push(ROUTES.transactionForm)}
              accessibilityRole="button"
              accessibilityLabel="Add transaction"
              className="w-[50px] h-[50px] rounded-full items-center justify-center -mt-[22px]"
              style={{
                backgroundColor: palette.brand,
                shadowColor: "#013220",
                shadowOpacity: 0.3,
                shadowRadius: 18,
                shadowOffset: { width: 0, height: 8 },
                elevation: 6,
              }}
            >
              <Plus size={23} color="white" weight="bold" />
            </Pressable>
            </TourTarget>,
            button,
          ];
        })}
      </View>
    </View>
  );
}
