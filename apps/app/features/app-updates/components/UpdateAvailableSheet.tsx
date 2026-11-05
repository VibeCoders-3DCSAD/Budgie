import { Linking } from "react-native";
import type { AppRelease } from "../services/githubReleases";
import { UpdateSheetFrame } from "./UpdateSheetFrame";

type Props = { release: AppRelease | null; installedVersion: string; onClose: () => void };

export function UpdateAvailableSheet({ release, installedVersion, onClose }: Props) {
  const openRelease = () => {
    if (release) void Linking.openURL(release.url).catch((error: unknown) => console.warn("Opening release page failed", error));
    onClose();
  };

  return (
    <UpdateSheetFrame
      visible={release !== null}
      title="A new version of Budgie is out"
      subtitle={`Version ${release?.version ?? ""} is available. You have ${installedVersion}.`}
      onClose={onClose}
      actions={[{ label: "Get the update", onPress: openRelease, primary: true }, { label: "Later", onPress: onClose }]}
    />
  );
}
