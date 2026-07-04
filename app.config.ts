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
};

export default config;
