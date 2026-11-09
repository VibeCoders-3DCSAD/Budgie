import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { shellPalette as palette } from "../../shell/theme";
import { useLogout } from "../../sync/SyncProvider";
import { usePracticeModeStore } from "../../../services/practiceMode";

// Lock and Log out, below the settings list.
export function AccountActions({ onLock }: { onLock: () => void }) {
  const { online, isLoggingOut, logoutError, confirmLogout } = useLogout();
  // The tour shows practice data; logging out from it would leave the account half switched.
  const practice = usePracticeModeStore((state) => state.active);
  const logoutDisabled = !online || isLoggingOut || practice;
  return (
    <View style={{ marginTop: 20 }}>
      <Pressable accessibilityRole="button" accessibilityLabel="Lock app" onPress={onLock}
        className="min-h-[54px] rounded-[14px] bg-[#013220] items-center justify-center mb-3">
        <Text className="text-white text-base font-bold">Lock app</Text>
      </Pressable>
      {logoutError ? (
        <View style={{ backgroundColor: "#FFF0F2", borderRadius: 14, padding: 14, marginBottom: 12 }}>
          <Text style={{ fontFamily: "Manrope", fontWeight: "500", fontSize: 13, color: "#D9001F" }}>{logoutError}</Text>
        </View>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Log out"
        disabled={logoutDisabled}
        onPress={confirmLogout}
        className={`min-h-[54px] rounded-[14px] border border-[#EAEAE6] bg-[#F1F0EB] items-center justify-center ${logoutDisabled ? "opacity-50" : "active:opacity-90"}`}
      >
        {isLoggingOut ? (
          <ActivityIndicator color={palette.error} />
        ) : (
          <Text className="text-[#D9001F] text-base font-bold">Log out</Text>
        )}
      </Pressable>
    </View>
  );
}
