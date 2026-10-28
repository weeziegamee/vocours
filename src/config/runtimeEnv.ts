import Constants from 'expo-constants';

import { envFromExtra, type AppEnv } from './env';

/** Environnement de cette version de l'appli (fixé à la compilation par app.config.js). */
export const RUNTIME_ENV: AppEnv = envFromExtra(Constants.expoConfig?.extra as Record<string, unknown> | undefined);
