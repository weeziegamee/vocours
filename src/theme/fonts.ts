import Constants from 'expo-constants';

/** Vrai si app.config.js a trouvé les polices dans assets/fonts et les a embarquées. */
export const FONTS_EMBEDDED: boolean = (Constants.expoConfig?.extra as { fontsEmbedded?: unknown } | undefined)?.fontsEmbedded === true;
