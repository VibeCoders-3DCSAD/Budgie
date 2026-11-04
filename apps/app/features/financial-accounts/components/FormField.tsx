import React from "react";
import { Text, View } from "react-native";
import { P } from "../helpers/accountsTheme";
import { TermInfo } from "../../../components/TermInfo";
import type { GlossaryTermId } from "../../glossary/terms";
import { InfoButton } from "./InfoButton";

type Props = { label: string; required?: boolean; error?: string; hint?: string; info?: string; term?: GlossaryTermId; children: React.ReactNode };

export function FormField({ label, required, error, hint, info, term, children }: Props) {
  return (
    <View>
      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 6 }}>
        <Text style={{ fontFamily: "Manrope", fontWeight: "600", fontSize: 12, color: P.ink2, flexShrink: 1 }}>
          {label} {required ? <Text style={{ color: P.error }}>*</Text> : null}
        </Text>
        {info ? <InfoButton label={label} text={info} /> : null}
        {term ? <View style={{ marginLeft: 6 }}><TermInfo term={term} /></View> : null}
      </View>
      {hint ? <Text style={{ fontFamily: "Manrope", fontSize: 11.5, color: P.muted, marginBottom: 6 }}>{hint}</Text> : null}
      {children}
      {error ? (
        <Text style={{ fontFamily: "Manrope", fontSize: 11.5, color: P.error, marginTop: 4 }}>{error}</Text>
      ) : null}
    </View>
  );
}
