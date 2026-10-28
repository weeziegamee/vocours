/**
 * Configuration Expo (iOS et Android), lue à chaque compilation.
 *
 * Variables d'environnement (définies par profil dans eas.json) :
 *   APP_VARIANT        development | preview | production
 *   VOCOURSE_MODE      live (serveur réel) | demo (tout sur le téléphone)
 *   VOCOURSE_API_URL   adresse HTTPS du serveur Vocourse
 *   IOS_BUNDLE_ID / ANDROID_PACKAGE   identifiants de l'appli (à vous)
 *   EAS_PROJECT_ID     identifiant du projet EAS (eas init)
 *   VOCOURSE_TLS_HOST / VOCOURSE_TLS_PINS   épinglage du certificat (facultatif, voir plugin)
 */
const fs = require('fs');
const path = require('path');

const variant = process.env.APP_VARIANT ?? 'development';
const production = variant === 'production';
const suffix = production ? '' : `.${variant}`;
const mode = process.env.VOCOURSE_MODE ?? (production ? 'live' : 'demo');
const apiUrl = process.env.VOCOURSE_API_URL ?? 'https://api.vocourse.ca';

const exists = (p) => fs.existsSync(path.join(__dirname, p));
const fonts = ['assets/fonts/AtkinsonHyperlegible-Regular.ttf', 'assets/fonts/AtkinsonHyperlegible-Bold.ttf'];
const fontsEmbedded = fonts.every(exists);

const pins = (process.env.VOCOURSE_TLS_PINS ?? '').split(',').map((s) => s.trim()).filter(Boolean);

const MIC_FR = 'Vocourse écoute votre liste d’épicerie quand vous touchez le gros bouton vert.';
const SPEECH_FR = 'Vocourse transforme votre voix en texte pour écrire votre liste d’épicerie.';

module.exports = ({ config }) => ({
  ...config,
  name: production ? 'Vocourse' : `Vocourse ${variant}`,
  slug: 'vocourse',
  scheme: 'vocourse',
  version: '1.0.0',
  orientation: 'portrait',
  userInterfaceStyle: 'light',
  icon: './assets/icon.png',
  splash: { image: './assets/splash-icon.png', resizeMode: 'contain', backgroundColor: '#FFF6DA' },
  // Textes des autorisations iOS traduits (le français est la langue par défaut).
  locales: { fr: './locales/fr.json', en: './locales/en.json' },
  ios: {
    bundleIdentifier: (process.env.IOS_BUNDLE_ID ?? 'ca.vocourse.app') + suffix,
    supportsTablet: false,
    config: { usesNonExemptEncryption: false },
    infoPlist: {
      CFBundleDevelopmentRegion: 'fr_CA',
      CFBundleAllowMixedLocalizations: true,
      NSMicrophoneUsageDescription: MIC_FR,
      NSSpeechRecognitionUsageDescription: SPEECH_FR,
    },
  },
  android: {
    package: (process.env.ANDROID_PACKAGE ?? 'ca.vocourse.app') + suffix,
    adaptiveIcon: { foregroundImage: './assets/adaptive-icon.png', backgroundColor: '#0A5E34' },
    permissions: ['android.permission.RECORD_AUDIO'],
    blockedPermissions: ['android.permission.ACCESS_FINE_LOCATION', 'android.permission.ACCESS_COARSE_LOCATION', 'android.permission.READ_CONTACTS'],
    // Pas de sauvegarde Google Drive des données de l'appli (la liste et les réglages restent sur le téléphone).
    allowBackup: false,
  },
  plugins: [
    [
      'expo-build-properties',
      {
        android: { compileSdkVersion: 36, targetSdkVersion: 36 },
        // Cycle de vie par « scènes » : exigé des applis compilées avec le SDK iOS 27.
        ios: { enableSceneSupport: true },
      },
    ],
    [
      'expo-speech-recognition',
      {
        microphonePermission: MIC_FR,
        speechRecognitionPermission: SPEECH_FR,
        androidSpeechServicePackages: ['com.google.android.googlequicksearchbox', 'com.google.android.as'],
      },
    ],
    ['expo-secure-store', { configureAndroidBackup: true }],
    ...(fontsEmbedded ? [['expo-font', { fonts }]] : []),
    ...(pins.length >= 2 && process.env.VOCOURSE_TLS_HOST
      ? [['./plugins/withCertificatePinning', { host: process.env.VOCOURSE_TLS_HOST, pins }]]
      : []),
  ],
  extra: {
    mode,
    apiUrl,
    privacyPolicyUrlFr: process.env.VOCOURSE_PRIVACY_URL_FR ?? 'https://vocourse.ca/confidentialite',
    privacyPolicyUrlEn: process.env.VOCOURSE_PRIVACY_URL_EN ?? 'https://vocourse.ca/en/privacy',
    privacyPolicyVersion: '2026-10',
    allowLocalHttp: variant === 'development',
    simulatedSpeech: process.env.VOCOURSE_SIMULATED_SPEECH === 'true',
    fontsEmbedded,
    ...(process.env.EAS_PROJECT_ID ? { eas: { projectId: process.env.EAS_PROJECT_ID } } : {}),
  },
});
