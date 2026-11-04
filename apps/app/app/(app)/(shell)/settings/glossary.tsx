import { useLocalSearchParams } from "expo-router";
import GlossaryScreen from "../../../../features/glossary/GlossaryScreen";
import { parseGlossaryTermId } from "../../../../features/glossary/helpers/glossarySearch";
import { InnerPage } from "../../../../features/shell/components/InnerPage";
import { ROUTES } from "../../../../routes";

// ?term= scrolls to and highlights that term; only known term ids are accepted.
export default function GlossaryRoute() {
  const { term } = useLocalSearchParams<{ term?: string }>();
  return <InnerPage title="Definition of terms" fallbackHref={ROUTES.settings}><GlossaryScreen initialTermId={parseGlossaryTermId(term)} /></InnerPage>;
}
