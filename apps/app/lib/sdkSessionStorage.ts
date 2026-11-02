// In-memory storage for the native Supabase client. The SDK holds a session only while the app is
// unlocked and rotating tokens; the auth feature keeps the protected account record itself.
const entries = new Map<string, string>();

export const sdkSessionStorage = {
  getItem: (key: string) => entries.get(key) ?? null,
  setItem: (key: string, value: string) => { entries.set(key, value); },
  removeItem: (key: string) => { entries.delete(key); },
};

/**
 * Drops the SDK's copy of the session without a server call. signOut() would revoke the refresh token
 * the protected record needs for re-verifying online without a new sign-in.
 * A pending sign-in's PKCE code verifier is kept so a browser round trip can still finish.
 */
export function clearSdkSession(): void {
  for (const key of [...entries.keys()]) {
    if (!key.endsWith("-code-verifier")) entries.delete(key);
  }
}
