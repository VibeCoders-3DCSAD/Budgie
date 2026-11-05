const googleIosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
const googleIosUrlScheme = process.env.EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME
  ?? (googleIosClientId
    ? `com.googleusercontent.apps.${googleIosClientId.replace(".apps.googleusercontent.com", "")}`
    : null);
const processWithArgv = process as typeof process & { argv?: string[] };
const expoCommand = processWithArgv.argv?.slice(2).join(" ").toLowerCase() ?? "";
const isPrebuildCommand = /\bprebuild\b/.test(expoCommand);
const isAndroidOnlyPrebuild = isPrebuildCommand
  && /(?:--platform|-p)(?:=|\s+)android\b/.test(expoCommand);
const requiresIosGoogleConfig = (Boolean(process.env.EAS_BUILD) && process.env.EXPO_OS === "ios")
  || process.env.EXPO_OS === "ios"
  || (isPrebuildCommand && !isAndroidOnlyPrebuild)
  || /\b(run:ios)\b/.test(expoCommand);

if (requiresIosGoogleConfig && !googleIosUrlScheme) {
  throw new Error(
    "EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID or EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME is required for iOS builds with Google Sign-In.",
  );
}

const plugins: (string | [string, Record<string, unknown>])[] = googleIosUrlScheme
  ? [["@react-native-google-signin/google-signin", { iosUrlScheme: googleIosUrlScheme }], "expo-secure-store"]
  : ["expo-secure-store"];
plugins.push(["expo-sqlite", { useSQLCipher: true }], "./plugins/withOfflineDataProtection", "expo-router");

const config = {
  name: "Budgie",
  slug: "app",
  version: "1.0.1",
  scheme: "odin",
  orientation: "portrait",
  icon: "./assets/icon.png",
  userInterfaceStyle: "light",
  newArchEnabled: true,
  splash: {
    image: "./assets/splash-icon.png",
    resizeMode: "contain",
    backgroundColor: "#ffffff",
  },
  ios: {
    supportsTablet: true,
    bundleIdentifier: "com.odin.finances",

  },
  android: {
    allowBackup: false,
    package: "com.odin.finances",
    versionCode: 2,
    adaptiveIcon: {
      foregroundImage: "./assets/adaptive-icon.png",
      backgroundColor: "#ffffff",
    },
    // Reserve Android's navigation area for legacy screens outside inset-aware sheets.
    edgeToEdgeEnabled: false,
    predictiveBackGestureEnabled: false,
  },
  web: {
    bundler: "metro",
    favicon: "./assets/favicon.png",
  },
  plugins,
  // Generates Href types from app/, so ROUTES and router calls are checked against real screens.
  experiments: { typedRoutes: true },
};

export default config;
