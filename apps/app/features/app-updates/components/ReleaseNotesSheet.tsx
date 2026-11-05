import { useMemo } from "react";
import { ScrollView, Text, useWindowDimensions } from "react-native";
import { P } from "../../financial-accounts/helpers/accountsTheme";
import { parseReleaseNotes, type ReleaseNoteLine } from "../helpers/releaseNotes";
import type { AppRelease } from "../services/githubReleases";
import { UpdateSheetFrame } from "./UpdateSheetFrame";

type Props = { release: AppRelease | null; onClose: () => void };

// Long notes scroll inside the sheet instead of pushing the button off screen.
const NOTES_MAX_SCREEN_SHARE = 0.5;

export function ReleaseNotesSheet({ release, onClose }: Props) {
  const { height } = useWindowDimensions();
  const lines = useMemo(() => parseReleaseNotes(release?.notes ?? ""), [release]);

  return (
    <UpdateSheetFrame
      visible={release !== null}
      title="What's new"
      subtitle={`Budgie ${release?.version ?? ""}`}
      onClose={onClose}
      actions={[{ label: "Got it", onPress: onClose, primary: true }]}
    >
      <ScrollView style={{ maxHeight: height * NOTES_MAX_SCREEN_SHARE, marginBottom: 16 }}>
        {lines.map((line, index) => <NoteLine key={index} line={line} />)}
      </ScrollView>
    </UpdateSheetFrame>
  );
}

function NoteLine({ line }: { line: ReleaseNoteLine }) {
  if (line.kind === "heading") {
    return <Text style={{ marginTop: 8, marginBottom: 4, fontFamily: "Manrope", fontSize: 14, fontWeight: "800", color: P.ink }}>{line.text}</Text>;
  }
  const text = line.kind === "bullet" ? `•  ${line.text}` : line.text;
  return <Text style={{ marginBottom: 6, fontFamily: "Manrope", fontSize: 14, lineHeight: 20, color: P.ink2 }}>{text}</Text>;
}
