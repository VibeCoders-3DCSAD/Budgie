import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";
import { secureStorageOptions } from "../../../lib/helpers/secureStorage";
import { normalizeVersion } from "../helpers/versions";

// Device-wide, not per account: it tracks which build this phone last showed notes for.
const LAST_SEEN_VERSION_KEY = "odin.app.last-seen-version";

export function installedVersion(): string | null {
  const version = Constants.expoConfig?.version;
  return version ? normalizeVersion(version) : null;
}

export const readLastSeenVersion = () => SecureStore.getItemAsync(LAST_SEEN_VERSION_KEY, secureStorageOptions);
export const writeLastSeenVersion = (version: string) => SecureStore.setItemAsync(LAST_SEEN_VERSION_KEY, version, secureStorageOptions);
