module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ['babel-preset-expo', { jsxImportSource: 'nativewind' }],
      'nativewind/babel',
    ],
    // NOTE: react-native-reanimated 4.x moved its Babel plugin into the
    // separate `react-native-worklets` package (installed as a peer dep of
    // Reanimated 4). The old 'react-native-reanimated/plugin' entry point is
    // kept only for backwards compatibility; the upstream docs recommend
    // 'react-native-worklets/plugin' directly. MUST be last.
    plugins: ['react-native-worklets/plugin'],
  };
};
