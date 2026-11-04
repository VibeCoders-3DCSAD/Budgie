import { router } from "expo-router";
import { Info } from "phosphor-react-native";
import type { ReactNode } from "react";
import { Pressable, View, type StyleProp, type ViewStyle } from "react-native";
import { glossaryTermName } from "../features/glossary/helpers/glossarySearch";
import type { GlossaryTermId } from "../features/glossary/terms";
import { ROUTES } from "../routes";

const INFO_COLOR = "#0E6D46";

// The (i) beside a finance word: opens Definition of terms scrolled to that word.
export function TermInfo({ term, color = INFO_COLOR }: { term: GlossaryTermId; color?: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`What is ${glossaryTermName(term)}?`}
      hitSlop={10}
      onPress={() => router.push({ pathname: ROUTES.glossary, params: { term } })}
    >
      <Info size={15} color={color} weight="bold" />
    </Pressable>
  );
}

// Puts a label and its (i) on one row; without a term the label renders unchanged.
export function WithTermInfo({ term, style, children }: { term?: GlossaryTermId; style?: StyleProp<ViewStyle>; children: ReactNode }) {
  if (!term) return children;
  return (
    <View style={[{ flexDirection: "row", alignItems: "center", gap: 5, flexShrink: 1 }, style]}>
      {children}
      <TermInfo term={term} />
    </View>
  );
}
