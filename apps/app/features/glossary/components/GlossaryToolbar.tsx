import { MagnifyingGlass, X } from "phosphor-react-native";
import { Pressable, Text, TextInput, View } from "react-native";
import { v4, v4Font } from "../../../components/BudgieForm";
import { CONTENT_GUTTER } from "../../shell/theme";
import type { GlossaryLanguage } from "../terms";

const LANGUAGES: { key: GlossaryLanguage; short: string; label: string }[] = [
  { key: "english", short: "EN", label: "English" },
  { key: "tagalog", short: "FIL", label: "Filipino" },
];

function LanguageToggle({ value, onChange }: { value: GlossaryLanguage; onChange: (language: GlossaryLanguage) => void }) {
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel="Definition language" style={{ flexDirection: "row", borderWidth: 1, borderColor: v4.border, backgroundColor: v4.surface, borderRadius: 12, padding: 3, gap: 2 }}>
      {LANGUAGES.map((language) => {
        const selected = language.key === value;
        return (
          <Pressable
            key={language.key}
            onPress={() => onChange(language.key)}
            accessibilityRole="radio"
            accessibilityLabel={language.label}
            accessibilityState={{ selected }}
            hitSlop={4}
            style={{ minWidth: 40, height: 36, borderRadius: 9, paddingHorizontal: 8, alignItems: "center", justifyContent: "center", backgroundColor: selected ? v4.brand : "transparent" }}
          >
            <Text style={{ fontFamily: v4Font, fontSize: 12, fontWeight: "700", color: selected ? "#FFFFFF" : v4.ink2 }}>{language.short}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// Pinned under the back header so search and language stay reachable while the list scrolls.
export function GlossaryToolbar({ query, onQuery, language, onLanguage }: { query: string; onQuery: (query: string) => void; language: GlossaryLanguage; onLanguage: (language: GlossaryLanguage) => void }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: CONTENT_GUTTER, paddingTop: 4, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: v4.hairline, backgroundColor: v4.shell }}>
      <View style={{ flex: 1, height: 44, flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderColor: v4.border, backgroundColor: v4.surface, borderRadius: 12, paddingLeft: 12, paddingRight: 6 }}>
        <MagnifyingGlass size={16} color={v4.mut} />
        <TextInput
          accessibilityLabel="Search terms"
          value={query}
          onChangeText={onQuery}
          placeholder="Search terms, e.g. utang"
          placeholderTextColor={v4.placeholder}
          autoCorrect={false}
          returnKeyType="search"
          style={{ flex: 1, fontFamily: v4Font, fontSize: 13.5, color: v4.ink, paddingVertical: 0 }}
        />
        {query ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Clear search" onPress={() => onQuery("")} hitSlop={8} style={{ padding: 4 }}>
            <X size={14} color={v4.mut} weight="bold" />
          </Pressable>
        ) : null}
      </View>
      <LanguageToggle value={language} onChange={onLanguage} />
    </View>
  );
}
