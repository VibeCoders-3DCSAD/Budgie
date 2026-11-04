import { MagnifyingGlass } from "phosphor-react-native";
import { useMemo, useRef, useState } from "react";
import { Text, View } from "react-native";
import { TextField, v4, v4Font } from "../../components/BudgieForm";
import { useShellPage } from "../shell/components/PageScroll";
import { searchGlossary } from "./helpers/glossarySearch";
import { GLOSSARY_TERMS, type GlossaryTermId } from "./terms";

const SORTED_TERMS = [...GLOSSARY_TERMS].sort((a, b) => a.term.localeCompare(b.term));
// Leaves a little room above the term an (i) button opened, so it is not flush with the header.
const TARGET_GAP = 12;

type Entry = (typeof GLOSSARY_TERMS)[number];

// Scrolls once to the term an (i) button opened; the list and the card report their positions separately.
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

function TermCard({ entry, highlighted, onLayoutY }: { entry: Entry; highlighted: boolean; onLayoutY: (y: number) => void }) {
  return (
    <View
      onLayout={({ nativeEvent }) => onLayoutY(nativeEvent.layout.y)}
      style={{ borderRadius: 16, borderWidth: highlighted ? 2 : 1, borderColor: highlighted ? v4.brandMid : v4.hairline, backgroundColor: highlighted ? v4.okBg : v4.surface, padding: 16 }}
    >
      <Text accessibilityRole="header" style={{ fontFamily: v4Font, fontWeight: "800", fontSize: 15, color: v4.ink }}>{entry.term}</Text>
      <Text style={{ fontFamily: v4Font, fontSize: 13.5, lineHeight: 20, color: v4.ink2, marginTop: 6 }}>{entry.definition}</Text>
      {"example" in entry ? (
        <Text style={{ fontFamily: v4Font, fontSize: 12.5, lineHeight: 19, color: v4.mut, marginTop: 8 }}>Example: {entry.example}</Text>
      ) : null}
    </View>
  );
}

// Plain-language meanings of the finance words in the app; (i) buttons open it at one term.
export default function GlossaryScreen({ initialTermId }: { initialTermId?: GlossaryTermId }) {
  const [query, setQuery] = useState("");
  const results = useMemo(() => searchGlossary(SORTED_TERMS, query), [query]);
  const { onListLayout, onTermLayout } = useScrollToTerm(initialTermId);

  return (
    <View style={{ gap: 14, paddingTop: 8 }}>
      <TextField
        label="Search terms"
        accessibilityLabel="Search terms"
        value={query}
        onChangeText={setQuery}
        placeholder="e.g. cut-off, amortization, utang"
        autoCorrect={false}
        returnKeyType="search"
        icon={<MagnifyingGlass size={16} color={v4.mut} />}
      />
      <View style={{ gap: 10 }} onLayout={({ nativeEvent }) => onListLayout(nativeEvent.layout.y)}>
        {results.length === 0 ? (
          <Text style={{ fontFamily: v4Font, fontSize: 13.5, color: v4.mut, textAlign: "center", paddingVertical: 24 }}>No terms match "{query.trim()}".</Text>
        ) : results.map((entry) => (
          <TermCard key={entry.id} entry={entry} highlighted={entry.id === initialTermId} onLayoutY={(y) => onTermLayout(entry.id, y)} />
        ))}
      </View>
    </View>
  );
}
