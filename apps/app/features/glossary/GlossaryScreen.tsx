import { useMemo, useState } from "react";
import { ROUTES } from "../../routes";
import { InnerPage } from "../shell/components/InnerPage";
import { GlossaryToolbar } from "./components/GlossaryToolbar";
import { TermList } from "./components/TermList";
import { searchGlossary } from "./helpers/glossarySearch";
import { GLOSSARY_TERMS, type GlossaryLanguage, type GlossaryTermId } from "./terms";

const SORTED_TERMS = [...GLOSSARY_TERMS].sort((a, b) => a.term.localeCompare(b.term));

// Plain-language meanings of the finance words in the app, in English or Filipino; (i) buttons open it at one term.
export default function GlossaryScreen({ initialTermId }: { initialTermId?: GlossaryTermId }) {
  const [query, setQuery] = useState("");
  const [language, setLanguage] = useState<GlossaryLanguage>("english");
  const results = useMemo(() => searchGlossary(SORTED_TERMS, query), [query]);

  return (
    <InnerPage
      title="Definition of terms"
      fallbackHref={ROUTES.settings}
      header={<GlossaryToolbar query={query} onQuery={setQuery} language={language} onLanguage={setLanguage} />}
    >
      <TermList results={results} query={query} language={language} initialTermId={initialTermId} />
    </InnerPage>
  );
}
