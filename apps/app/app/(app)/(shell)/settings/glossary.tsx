import { useLocalSearchParams } from "expo-router";
import GlossaryScreen from "../../../../features/glossary/GlossaryScreen";
import { parseGlossaryTermId } from "../../../../features/glossary/helpers/glossarySearch";

// ?term= scrolls to and highlights that term; only known term ids are accepted.
export default function GlossaryRoute() {
  const { term } = useLocalSearchParams<{ term?: string }>();
  return <GlossaryScreen initialTermId={parseGlossaryTermId(term)} />;
}
