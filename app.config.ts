import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'Marketplace',
  slug: 'marketplace-app',
  scheme: 'marketplace', // provisional; change display name/scheme here in one place
  version: '0.1.0',
  orientation: 'portrait',
  userInterfaceStyle: 'automatic',
  plugins: ['expo-router', 'expo-secure-store'],
  ios: { supportsTablet: false },
  android: {},
  experiments: { typedRoutes: true },
  extra: {
    eas: {
      projectId: 'c4a7835d-8bba-402a-8f06-ee2cdd343f1c',
    },
  },
};

export default config;
