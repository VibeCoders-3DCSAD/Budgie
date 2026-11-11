import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Animated, Image, Pressable, Text, View } from "react-native";
import { SafeAreaFrame } from "../../../components/SafeAreaFrame";
import { Backspace, LockSimple, WifiHigh } from "phosphor-react-native";
import { useAuthStore } from "../stores/useAuthStore";
import { isValidPin } from "../helpers/pinPolicy";

const budgieMascot = require("../../../assets/budgie-hi.png");
const PIN_LENGTH = 6;
const MESSAGE_INTERVAL_MS = 2000;
const UNLOCK_MESSAGES = ["Checking your PIN…", "Opening your vault…", "Loading your records…", "Almost there…"];
const SETUP_MESSAGES = ["Securing your PIN…", "Encrypting your data…", "Double-checking the encrypted copy…", "Keeping your unsynced changes safe…", "Almost done…"];
const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "delete"] as const;

export default function PinAccessScreen() {
  const phase = useAuthStore((state) => state.phase);
  const busy = useAuthStore((state) => state.busy);
  const error = useAuthStore((state) => state.error);
  const lockoutMs = useAuthStore((state) => state.lockoutMs);
  const recoveryVerified = useAuthStore((state) => state.recoveryVerified);
  const [pin, setPin] = useState("");
  const [firstPin, setFirstPin] = useState<string | null>(null);
  const [inputError, setInputError] = useState<string | null>(null);
  const [messageIndex, setMessageIndex] = useState(0);
  const shake = useRef(new Animated.Value(0)).current;
  const setup = phase === "enrollment-required";
  const verification = phase === "verification-required";
  const confirming = setup && firstPin !== null;
  const lockedOut = lockoutMs > 0;
  const keypadDisabled = busy || lockedOut;
  const message = inputError || error;
  const seconds = Math.ceil(lockoutMs / 1000);
  const countdown = `${Math.floor(seconds / 3600).toString().padStart(2, "0")}:${Math.floor(seconds / 60 % 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;

  useEffect(() => {
    setMessageIndex(0);
    if (!busy) return;
    const timer = setInterval(() => setMessageIndex((index) => index + 1), MESSAGE_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [busy]);

  useEffect(() => {
    if (!message) return;
    Animated.sequence([10, -10, 6, -6, 0].map((toValue) =>
      Animated.timing(shake, { toValue, duration: 50, useNativeDriver: true }))).start();
  }, [message, shake]);

  function confirmSetup(value: string) {
    Alert.alert(recoveryVerified ? "Reset your PIN?" : "Protect offline access?",
      recoveryVerified ? "Your old PIN will stop working. Your saved records and unsynced changes will be preserved."
        : "Budgie will encrypt local financial data and replace its unencrypted copy after checking the encrypted copy. Records and unsynced changes will be preserved. Keep this PIN private.",
      [{ text: "Cancel", style: "cancel" },
        { text: recoveryVerified ? "Reset PIN" : "Enable PIN", onPress: () => { void useAuthStore.getState().setupPin(value); } }]);
  }

  function update(next: string) {
    if (keypadDisabled) return;
    setInputError(null);
    if (error) useAuthStore.setState({ error: null });
    const value = next.replace(/[^0-9]/g, "").slice(0, PIN_LENGTH);
    if (!isValidPin(value)) { setPin(value); return; }
    setPin("");
    if (!setup) { void useAuthStore.getState().submitPin(value); return; }
    if (firstPin === null) { setFirstPin(value); return; }
    setFirstPin(null);
    if (value !== firstPin) { setInputError("PINs didn't match. Try again."); return; }
    confirmSetup(value);
  }

  function press(key: typeof KEYS[number]) {
    if (key) update(key === "delete" ? pin.slice(0, -1) : pin + key);
  }

  const busyMessages = setup ? SETUP_MESSAGES : UNLOCK_MESSAGES;
  const title = verification ? "Verify your account"
    : confirming ? "Confirm your PIN"
      : setup ? recoveryVerified ? "Set a new PIN" : "Create your PIN"
        : "Unlock Budgie";
  const subtitle = verification ? "Connect to the internet to renew offline access for 30 days. Your local records and unsynced changes are safe."
    : confirming ? "Enter the same six digits again."
      : setup ? "Use six digits to protect this account, online and offline."
        : "Enter your six-digit PIN.";

  return (
    <SafeAreaFrame className="flex-1 bg-card">
      <View className="flex-1 w-full max-w-[420px] self-center px-7 pt-6 pb-4">
        <View className="flex-1 items-center justify-center gap-7">
          <Image accessibilityLabel="Budgie mascot waving hi" resizeMode="contain" source={budgieMascot} className="w-[140px] h-[140px]" />
          <View className="items-center gap-2">
            {setup && <Text className="text-xs font-bold tracking-[1.2px] uppercase text-aqua700">Step {confirming ? 2 : 1} of 2</Text>}
            <Text className="text-ink text-[26px] leading-[32px] font-extrabold text-center">{title}</Text>
            <Text className="text-ink2 text-base text-center">{subtitle}</Text>
          </View>

          {verification ? (
            <View className="w-[72px] h-[72px] rounded-full bg-aqua50 items-center justify-center">
              <WifiHigh size={32} color="#0B8A55" weight="bold" />
            </View>
          ) : (
            <View className="items-center gap-5">
              <Animated.View
                accessible
                accessibilityLabel={confirming ? "Confirm six-digit PIN" : setup ? "Create six-digit PIN" : "Six-digit PIN"}
                accessibilityValue={{ text: `${pin.length} of ${PIN_LENGTH} digits entered` }}
                style={{ transform: [{ translateX: shake }] }}
                className="flex-row gap-4 h-6 items-center"
              >
                {Array.from({ length: PIN_LENGTH }, (_, index) => (
                  <View key={index} className={`w-[14px] h-[14px] rounded-full border-2 ${message ? "border-error"
                    : index < pin.length ? "bg-aqua950 border-aqua950" : "border-[#C9CEC8]"}`} />
                ))}
              </Animated.View>
              <View className="min-h-[24px] items-center justify-center">
                {busy ? (
                  <View className="flex-row items-center gap-2">
                    <ActivityIndicator color="#0B8A55" />
                    <Text accessibilityLiveRegion="polite" className="text-sm font-semibold text-ink2">{busyMessages[messageIndex % busyMessages.length]}</Text>
                  </View>
                ) : lockedOut ? (
                  <View className="flex-row items-center gap-2 rounded-full bg-errorSoft px-4 py-2">
                    <LockSimple size={14} color="#D9001F" weight="bold" />
                    <Text accessibilityRole="timer" className="text-sm font-semibold text-error">Try again in {countdown}</Text>
                  </View>
                ) : message ? (
                  <Text accessibilityRole="alert" className="text-sm font-semibold text-error text-center">{message}</Text>
                ) : null}
              </View>
            </View>
          )}
          {verification && message && <Text accessibilityRole="alert" className="text-sm font-semibold text-error text-center">{message}</Text>}
        </View>

        {verification ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Verify online" disabled={busy}
            onPress={() => { void useAuthStore.getState().verifyOnline(); }}
            className={`min-h-[54px] rounded-[14px] bg-aqua950 items-center justify-center ${busy ? "opacity-50" : "active:opacity-90"}`}>
            {busy ? <ActivityIndicator color="white" /> : <Text className="text-white font-bold text-base">Verify online</Text>}
          </Pressable>
        ) : (
          <View className={`flex-row flex-wrap justify-between gap-y-3 ${lockedOut ? "opacity-40" : ""}`}>
            {KEYS.map((key, index) => key ? (
              <Pressable key={key} accessibilityRole="button" accessibilityLabel={key === "delete" ? "Delete digit" : key}
                disabled={keypadDisabled || (key === "delete" && !pin)} onPress={() => press(key)}
                className="w-[30%] h-[64px] rounded-[18px] items-center justify-center active:bg-surface">
                {key === "delete" ? <Backspace size={26} color="#414942" />
                  : <Text className="text-ink text-[28px] font-semibold">{key}</Text>}
              </Pressable>
            ) : <View key={`blank-${index}`} className="w-[30%] h-[64px]" />)}
          </View>
        )}

        {confirming ? (
          <Pressable accessibilityRole="button" onPress={() => { setFirstPin(null); setPin(""); setInputError(null); }} className="p-3 mt-2 items-center">
            <Text className="text-aqua950 font-bold">Start over</Text>
          </Pressable>
        ) : !setup && (
          <Pressable accessibilityRole="button" onPress={() => {
            if (verification) useAuthStore.setState({ phase: "recovery", error: null });
            else void useAuthStore.getState().startRecovery();
          }} className="p-3 mt-2 items-center">
            <Text className="text-aqua950 font-bold">{verification ? "Sign in to verify" : "Forgot PIN? Verify online"}</Text>
          </Pressable>
        )}
      </View>
    </SafeAreaFrame>
  );
}
