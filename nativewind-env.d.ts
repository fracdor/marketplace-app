/// <reference types="nativewind/types" />

// Declare CSS side-effect imports (e.g. `import './global.css'`) so tsc resolves
// them on a clean checkout. Expo normally provides this via a generated,
// gitignored expo-env.d.ts, which isn't present until `expo start` runs — so we
// declare it here in a committed file instead.
declare module '*.css';
