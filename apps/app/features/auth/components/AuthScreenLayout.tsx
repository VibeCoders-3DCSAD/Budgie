import type { ReactNode } from "react";
import { Image, KeyboardAvoidingView, ScrollView, Text, View } from "react-native";
import { SafeAreaFrame } from "../../../components/SafeAreaFrame";
import { Notice, type NoticeProps } from "./AuthControls";

const budgieLogo = require("../../../assets/budgie-logo.png");

type Props = { title: string; subtitle: string; notice: NoticeProps | null; children: ReactNode; overlay?: ReactNode };

// Logo, heading and notice shared by every signed-out screen.
export function AuthScreenLayout({ title, subtitle, notice, children, overlay }: Props) {
  return (
    <View className="flex-1 bg-card">
      <SafeAreaFrame className="flex-1">
        <KeyboardAvoidingView behavior="height" style={{ flex: 1 }}>
          <ScrollView contentContainerClassName="flex-grow px-7 py-10" keyboardShouldPersistTaps="handled">
            <View className="w-full max-w-[420px] self-center gap-8 pt-8">
              <View className="items-center gap-5">
                <View className="w-[64px] h-[64px] rounded-[32px] border-[3px] border-aqua950 items-center justify-center">
                  <Image accessibilityLabel="Budgie logo" resizeMode="contain" source={budgieLogo} className="w-[48px] h-[48px]" />
                </View>
                <View className="items-center gap-1">
                  <Text className="text-ink text-[26px] leading-[32px] font-extrabold text-center">{title}</Text>
                  <Text className="text-ink2 text-base text-center">{subtitle}</Text>
                </View>
              </View>
              <View className="gap-6">
                {notice ? <Notice message={notice.message} tone={notice.tone} /> : null}
                {children}
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaFrame>
      {overlay}
    </View>
  );
}
