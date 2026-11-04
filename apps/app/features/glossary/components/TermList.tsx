import { useRef } from "react";
import { Text, View } from "react-native";
import { v4, v4Font } from "../../../components/BudgieForm";
import { useShellPage } from "../../shell/components/PageScroll";
import type { GLOSSARY_TERMS, GlossaryLanguage, GlossaryTermId } from "../terms";

// Leaves a little room above the term an (i) button opened, so it is not flush with the search bar.
const TARGET_GAP = 8;

type Entry = (typeof GLOSSARY_TERMS)[number];

// Scrolls once to the term an (i) button opened; the list and the row report their positions separately.
function useScrollToTerm(termId: GlossaryTermId | undefined) {
  const { scrollTo } = useShellPage();
  const listY = useRef<number | null>(null);
  const termY = useRef<number | null>(null);
  const done = useRef(false);
  const tryScroll = () => {
    if (done.current || listY.current === null || termY.current === null) return;
    done.current = true;
    scrollTo(Math.max(0, listY.current + termY.current - TARGET_GAP));
  };
  return {
    onListLayout: (y: number) => { listY.current = y; tryScroll(); },
    onTermLayout: (id: GlossaryTermId, y: number) => {
      if (id !== termId) return;
      termY.current = y;
      tryScroll();
    },
  };
}

function TermRow({ entry, language, first, highlighted, onLayoutY }: { entry: Entry; language: GlossaryLanguage; first: boolean; highlighted: boolean; onLayoutY: (y: number) => void }) {
  return (
    <View
      onLayout={({ nativeEvent }) => onLayoutY(nativeEvent.layout.y)}
      style={{ paddingHorizontal: 14, paddingVertical: 11, borderTopWidth: first ? 0 : 1, borderTopColor: v4.hairline, borderLeftWidth: 3, borderLeftColor: highlighted ? v4.brandMid : "transparent", backgroundColor: highlighted ? v4.okBg : "transparent" }}
    >
      <Text accessibilityRole="header" style={{ fontFamily: v4Font, fontWeight: "800", fontSize: 14, color: v4.ink }}>{entry.term}</Text>
      <Text style={{ fontFamily: v4Font, fontSize: 13, lineHeight: 19, color: v4.ink2, marginTop: 3 }}>{entry.definition[language]}</Text>
      {"example" in entry ? (
        <Text style={{ fontFamily: v4Font, fontSize: 12, lineHeight: 17, color: v4.mut, marginTop: 5 }}>
          <Text style={{ fontWeight: "700" }}>{language === "tagalog" ? "Halimbawa: " : "Example: "}</Text>{entry.example}
        </Text>
      ) : null}
    </View>
  );
}

export function TermList({ results, query, language, initialTermId }: { results: Entry[]; query: string; language: GlossaryLanguage; initialTermId?: GlossaryTermId }) {
  const { onListLayout, onTermLayout } = useScrollToTerm(initialTermId);
  if (results.length === 0) {
    return <Text style={{ fontFamily: v4Font, fontSize: 13.5, color: v4.mut, textAlign: "center", paddingVertical: 24 }}>No terms match "{query.trim()}".</Text>;
  }
  return (
    <View
      onLayout={({ nativeEvent }) => onListLayout(nativeEvent.layout.y)}
      style={{ marginTop: 10, borderRadius: 14, borderWidth: 1, borderColor: v4.hairline, backgroundColor: v4.surface, overflow: "hidden" }}
    >
      {results.map((entry, index) => (
        <TermRow
          key={entry.id}
          entry={entry}
          language={language}
          first={index === 0}
          highlighted={entry.id === initialTermId}
          onLayoutY={(y) => onTermLayout(entry.id, y)}
        />
      ))}
    </View>
  );
}
