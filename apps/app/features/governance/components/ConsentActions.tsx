import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { styles as ui, v4, v4Font } from "../../../components/BudgieForm";

type Props = {
  readToEnd: boolean;
  submitting: boolean;
  error: string | null;
  onDecline: () => void;
  onAgree: () => void;
};

// Footer of the terms modal: read-to-end hint, Decline / Agree buttons and the submit error.
export function ConsentActions({ readToEnd, submitting, error, onDecline, onAgree }: Props) {
  const canAccept = readToEnd && !submitting;
  return (
    <View style={{ paddingHorizontal: 22, paddingTop: 14, paddingBottom: 20, borderTopWidth: 1, borderTopColor: v4.hairline, gap: 10 }}>
      <Text style={{ fontFamily: v4Font, fontWeight: "500", fontSize: 11.5, color: readToEnd ? v4.okInk : v4.mut, textAlign: "center" }}>
        {readToEnd ? "By continuing you agree to these terms." : "Scroll to the end to accept."}
      </Text>
      <View style={{ flexDirection: "row", gap: 10 }}>
        <Pressable
          onPress={onDecline}
          disabled={submitting}
          accessibilityRole="button"
          accessibilityLabel="Decline terms"
          style={[ui.button, ui.buttonGhost, { flex: 1 }]}
        >
          <Text style={[ui.buttonText, ui.buttonGhostText]}>Decline</Text>
        </Pressable>
        <Pressable
          onPress={onAgree}
          disabled={!canAccept}
          accessibilityRole="button"
          accessibilityLabel="Agree and continue"
          accessibilityState={{ disabled: !canAccept, busy: submitting }}
          style={[ui.button, { flex: 2, opacity: readToEnd ? 1 : 0.4 }]}
        >
          {submitting ? <ActivityIndicator color="#FFFFFF" /> : <Text style={ui.buttonText}>Agree & continue</Text>}
        </Pressable>
      </View>
      {error ? (
        <Text style={{ fontFamily: v4Font, fontWeight: "500", fontSize: 11.5, color: v4.error, textAlign: "center" }}>{error}</Text>
      ) : null}
    </View>
  );
}
