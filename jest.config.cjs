// Le contrat HTTP doit utiliser le fetch de Node, sans le module natif Expo simulé.
// Ce réglage reste limité au processus Jest.
process.env.EXPO_PUBLIC_USE_RN_FETCH = '1';

module.exports = {
  "preset": "jest-expo",
  "testEnvironment": "node",
  "testMatch": [
    "<rootDir>/__tests__/**/*.test.ts"
  ],
  "moduleNameMapper": {
    "^(\\.{1,2}/.*)\\.ts$": "$1"
  }
};
