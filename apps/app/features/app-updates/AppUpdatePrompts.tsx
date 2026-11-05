import { ReleaseNotesSheet } from "./components/ReleaseNotesSheet";
import { UpdateAvailableSheet } from "./components/UpdateAvailableSheet";
import { useAppUpdates } from "./hooks/useAppUpdates";
import { installedVersion } from "./services/installedVersion";

/** Shows the new build's notes first; any newer release is offered after they are dismissed. */
export function AppUpdatePrompts() {
  const { availableUpdate, releaseNotes, dismissReleaseNotes, dismissUpdate } = useAppUpdates();
  const current = installedVersion();
  if (!current) return null;

  return <>
    <ReleaseNotesSheet release={releaseNotes} onClose={dismissReleaseNotes} />
    <UpdateAvailableSheet release={releaseNotes ? null : availableUpdate} installedVersion={current} onClose={dismissUpdate} />
  </>;
}
