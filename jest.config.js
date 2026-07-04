// NOTE: `jest` must stay on ^29. jest-expo@57 bundles jest internals
// (@jest/globals, jest-snapshot, babel-jest, jest-environment-jsdom) pinned to
// ^29.x, which must stay aligned with the top-level jest runner. Do NOT let
// `npm update` bump jest to 30 until jest-expo ships support for it (verify it
// depends on @jest/globals@^30 first) — a mismatch silently breaks the harness.
module.exports = {
  preset: 'jest-expo',
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg|nativewind|moti|@supabase/.*))',
  ],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
};
