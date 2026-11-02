import React, { useEffect, useState } from "react";
import { Pressable, Text, TextStyle, View } from "react-native";
import {
  CaretRight,
  ClockAfternoon,
  LockKey,
  Trash,
  User,
} from "phosphor-react-native";
import { useConnectivityStore } from "../../services/connectivity";
import { useToast } from "../../components/Toast";
import UserProfileScreen from "./UserProfileScreen";
import PreferencesScreen from "./PreferencesScreen";
import AccountOffboardingScreen from "./AccountOffboardingScreen";

type PrivacySettingsScreenProps = {
  accessToken: string;
  userId: string;
  deviceId: string;
  onBackToLogin?: () => void;
  onDeleted?: (scheduledDate: string) => void;
  onSubPageChange?: (showingSubPage: boolean) => void;
  beforeDangerZone?: React.ReactNode;
};

const MUTED = "#6B7A6F";
const LINE = "#EAEAE6";
const INK = "#1B1C1A";
const AQUA700 = "#0B8A55";
const AQUA600 = "#08B16A";
const CARD = "#FCF8F0";
const MONZA50 = "#FFF0F2";
const MONZA200 = "#FFCDD2";
const MONZA600 = "#D9001F";
const MONZA700 = "#B71C1C";
const MONZA500 = "#E53935";

function SettingsToggle({
  value,
  onToggle,
  accessibilityLabel,
  disabled,
}: {
  value: boolean;
  onToggle: () => void;
  accessibilityLabel: string;
  disabled?: boolean;
}) {
  return (
      <Pressable
        onPress={onToggle}
        disabled={disabled}
        accessibilityRole="switch"
        accessibilityState={{ checked: value, disabled }}
        accessibilityLabel={accessibilityLabel}
      >
      <View
        style={{
          width: 44,
          height: 26,
          borderRadius: 100,
          backgroundColor: value ? AQUA600 : LINE,
          justifyContent: "center",
          paddingHorizontal: 3,
          opacity: disabled ? 0.45 : 1,
        }}
      >
        <View
          style={{
            width: 20,
            height: 20,
            borderRadius: 10,
            backgroundColor: CARD,
            alignSelf: value ? "flex-end" : "flex-start",
          }}
        />
      </View>
    </Pressable>
  );
}

function BorderedGroup({ children }: { children: React.ReactNode }) {
  return (
    <View
      style={{
        borderRadius: 16,
        borderWidth: 1,
        borderColor: LINE,
        overflow: "hidden",
      }}
    >
      {children}
    </View>
  );
}

function SectionHeader({ label }: { label: string }) {
  return (
    <Text
      style={{
        fontSize: 11,
        fontWeight: "700",
        color: MUTED,
        textTransform: "uppercase",
        letterSpacing: 0.55,
        marginBottom: 9,
      }}
    >
      {label}
    </Text>
  );
}

function Divider() {
  return <View style={{ borderTopWidth: 1, borderTopColor: LINE }} />;
}

function NavRow({
  icon,
  label,
  subtitle,
  onPress,
  trailing,
  iconColor = MUTED,
  labelColor = INK,
  labelWeight = "600",
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  subtitle?: string;
  onPress?: () => void;
  trailing?: React.ReactNode;
  iconColor?: string;
  labelColor?: string;
  labelWeight?: TextStyle["fontWeight"];
  disabled?: boolean;
}) {
  const Wrapper = onPress && !disabled ? Pressable : View;
  return (
    <Wrapper
      onPress={onPress}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingHorizontal: 15,
        paddingVertical: 14,
        opacity: disabled ? 0.45 : 1,
      }}
    >
      {icon}
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 13.5, fontWeight: labelWeight, color: labelColor }}>
          {label}
        </Text>
        {subtitle ? (
          <Text style={{ fontSize: 10.5, color: AQUA700, marginTop: 1 }}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing ?? (onPress ? <CaretRight size={15} color={MUTED} weight="bold" /> : null)}
    </Wrapper>
  );
}

export default function PrivacySettingsScreen({ accessToken, userId, deviceId, onBackToLogin, onDeleted, onSubPageChange, beforeDangerZone }: PrivacySettingsScreenProps) {
  const [subPage, setSubPage] = useState<string | null>(null);
  const [exported, setExported] = useState(false);
  const online = useConnectivityStore(state => state.online);
  const { showToast } = useToast();

  useEffect(() => {
    onSubPageChange?.(subPage !== null);
  }, [subPage, onSubPageChange]);

  if (subPage === "preferences") {
    return <PreferencesScreen accessToken={accessToken} userId={userId} deviceId={deviceId} onBack={() => setSubPage(null)} />;
  }

  if (subPage === "export") {
    return (
      <View>
        <Pressable
          onPress={() => setSubPage(null)}
          accessibilityRole="button"
          accessibilityLabel="Back to settings"
          style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 16 }}
        >
          <CaretRight size={18} color={MUTED} weight="bold" style={{ transform: [{ rotate: "180deg" }] }} />
          <Text style={{ fontFamily: "Manrope", fontWeight: "600", fontSize: 13, color: MUTED }}>
            Settings
          </Text>
        </Pressable>
        <Text style={{ fontFamily: "Manrope", fontWeight: "800", fontSize: 20, color: INK, marginBottom: 16 }}>
          Export data
        </Text>
        <UserProfileScreen accessToken={accessToken} alreadyExported={exported} onExported={() => setExported(true)} onDone={() => setSubPage(null)} />
      </View>
    );
  }

  if (subPage === "delete-account") {
    return (
      <AccountOffboardingScreen
        accessToken={accessToken}
        onBack={() => setSubPage(null)}
        onGoToExport={() => setSubPage("export")}
        onDeleted={onDeleted}
      />
    );
  }

  return (
    <View>
      <SectionHeader label="Account" />
      <BorderedGroup>
        <NavRow icon={<User size={18} color={MUTED} />} label="Personal information" />
        <Divider />
        <NavRow icon={<LockKey size={18} color={MUTED} />} label="Change password" />
        <Divider />
        <NavRow icon={<ClockAfternoon size={18} color={MUTED} />} label="Preferences" subtitle="Seasonal preferences and custom events" onPress={() => setSubPage("preferences")} />
      </BorderedGroup>

      <View style={{ height: 20 }} />

      {beforeDangerZone ? <View style={{ marginBottom: 20 }}>{beforeDangerZone}</View> : null}

      <Pressable
        onPress={() => {
          if (!online) { showToast("This action can only be done while online"); return; }
          setSubPage("delete-account");
        }}
        accessibilityRole="button"
        accessibilityLabel="Delete account"
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          padding: 15,
          borderRadius: 14,
          borderWidth: 1.5,
          borderColor: MONZA200,
          backgroundColor: MONZA50,
          opacity: online ? 1 : 0.45,
        }}
      >
        <Trash size={18} color={MONZA600} />
        <Text style={{ flex: 1, fontSize: 13.5, fontWeight: "700", color: MONZA700 }}>
          Delete account
        </Text>
        <CaretRight size={15} color={MONZA500} weight="bold" />
      </Pressable>

      <Text
        style={{
          fontSize: 10.5,
          lineHeight: 15.75,
          color: MUTED,
          textAlign: "center",
          marginTop: 14,
          marginBottom: 8,
        }}
      >
        Budgie provides budgeting tools, not professional financial advice. Decisions are your own.
      </Text>
    </View>
  );
}
