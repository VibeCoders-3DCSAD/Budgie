import { Text, View } from "react-native";
import { v4, v4Font } from "../../../components/BudgieForm";
import { TERMS_DRAFT_LABEL, TERMS_INTRO, TERMS_SECTIONS } from "../termsContent";

const paragraphStyle = { fontFamily: v4Font, fontSize: 13, lineHeight: 20.8, color: v4.ink2 } as const;

// The Terms & Conditions text, shared by the sign-in consent modal and the Settings page.
export function TermsBody() {
  return (
    <View style={{ gap: 16 }}>
      <Text style={paragraphStyle}>{TERMS_INTRO}</Text>
      {TERMS_SECTIONS.map((section) => (
        <View key={section.heading} style={{ gap: 6 }}>
          <Text accessibilityRole="header" style={{ fontFamily: v4Font, fontWeight: "700", fontSize: 14, color: v4.ink }}>
            {section.heading}
          </Text>
          {section.paragraphs.map((paragraph) => (
            <Text key={paragraph} style={paragraphStyle}>{paragraph}</Text>
          ))}
        </View>
      ))}
    </View>
  );
}

// "Draft v1 · Policy v2026-06" caption shown above the terms.
export function TermsVersionCaption({ version }: { version: string }) {
  return (
    <Text style={{ fontFamily: v4Font, fontWeight: "500", fontSize: 11, color: v4.mut }}>
      {TERMS_DRAFT_LABEL} · Policy v{version}
    </Text>
  );
}
