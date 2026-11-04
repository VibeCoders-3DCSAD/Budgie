import { useState } from "react";
import { Modal, ScrollView, Text, View } from "react-native";
import { Check, ShieldCheck } from "phosphor-react-native";
import { v4, v4Font } from "../../components/BudgieForm";
import { submitConsent } from "./api";
import { ConsentActions } from "./components/ConsentActions";
import { TermsBody, TermsVersionCaption } from "./components/TermsBody";
import { CURRENT_TERMS_VERSION, ERRORS, TERMS_CONSENT_KIND } from "./constants";
import { getErrorMessage } from "./helpers";
import { useReadToEnd } from "./hooks/useReadToEnd";

// How long the success check shows before the app continues.
export const CONSENTED_CHECK_MS = 600;

type PrivacyConsentScreenProps = {
  visible: boolean;
  accessToken: string;
  onComplete: () => void;
  onDismiss?: () => void;
  consentVersion?: string;
};

const CONSENT_TIMEOUT_MESSAGE = "The request timed out. Check your connection and try again.";

// Terms & Conditions modal: the user must scroll to the end before they can accept.
export default function PrivacyConsentScreen({
  visible,
  accessToken,
  onComplete,
  onDismiss,
  consentVersion = CURRENT_TERMS_VERSION,
}: PrivacyConsentScreenProps) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [consented, setConsented] = useState(false);
  const { readToEnd, scrollProps } = useReadToEnd();

  function handleDecline() {
    if (submitting) return;
    onDismiss?.();
  }

  async function handleAgree() {
    if (!readToEnd || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const { response } = await submitConsent(accessToken, {
        consent_kind: TERMS_CONSENT_KIND,
        status: "granted",
        version: consentVersion,
      });
      if (!response.ok) {
        setError(ERRORS.CONSENT_UNAVAILABLE);
        setSubmitting(false);
        return;
      }
      setConsented(true);
      setTimeout(onComplete, CONSENTED_CHECK_MS);
    } catch (err) {
      setError(getErrorMessage(err, CONSENT_TIMEOUT_MESSAGE));
      setSubmitting(false);
    }
  }

  return (
    <Modal visible={visible || consented} transparent animationType="fade" onRequestClose={handleDecline}>
      {consented ? <ConsentedCheck /> : (
        <View style={{ flex: 1, justifyContent: "center", padding: 20, backgroundColor: "rgba(1,50,32,0.4)" }}>
          <View
            style={{
              maxHeight: "88%",
              backgroundColor: v4.shell,
              borderRadius: 24,
              shadowColor: v4.brand,
              shadowOffset: { width: 0, height: 16 },
              shadowOpacity: 0.16,
              shadowRadius: 40,
              elevation: 16,
              overflow: "hidden",
            }}
          >
            <View style={{ paddingHorizontal: 22, paddingTop: 22, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: v4.hairline, gap: 6 }}>
              <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
                <ShieldCheck size={22} color={v4.okInk} />
                <Text accessibilityRole="header" style={{ fontFamily: v4Font, fontWeight: "700", fontSize: 17, color: v4.ink }}>
                  Terms & Conditions
                </Text>
              </View>
              <TermsVersionCaption version={consentVersion} />
            </View>
            <ScrollView
              {...scrollProps}
              style={{ flexShrink: 1 }}
              contentContainerStyle={{ paddingHorizontal: 22, paddingVertical: 16 }}
              accessibilityLabel="Terms and conditions text"
            >
              <TermsBody />
            </ScrollView>
            <ConsentActions readToEnd={readToEnd} submitting={submitting} error={error} onDecline={handleDecline} onAgree={handleAgree} />
          </View>
        </View>
      )}
    </Modal>
  );
}

function ConsentedCheck() {
  return (
    <View style={{ flex: 1, backgroundColor: "rgba(1,50,32,0.5)", justifyContent: "center", alignItems: "center" }}>
      <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: v4.okBg, justifyContent: "center", alignItems: "center" }}>
        <Check size={40} color="#08B16A" weight="bold" />
      </View>
    </View>
  );
}
