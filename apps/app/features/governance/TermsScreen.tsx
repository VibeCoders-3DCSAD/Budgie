import { View } from "react-native";
import { ROUTES } from "../../routes";
import { InnerPage } from "../shell/components/InnerPage";
import { TermsBody, TermsVersionCaption } from "./components/TermsBody";
import { CURRENT_TERMS_VERSION } from "./constants";

// Read-only Terms & Conditions, opened from Settings so the user can reread what they accepted.
export default function TermsScreen() {
  return (
    <InnerPage title="Terms & Conditions" fallbackHref={ROUTES.settings}>
      <View style={{ gap: 14, paddingBottom: 24 }}>
        <TermsVersionCaption version={CURRENT_TERMS_VERSION} />
        <TermsBody />
      </View>
    </InnerPage>
  );
}
