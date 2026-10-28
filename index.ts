/**
 * Point d'entrée de l'appli. Les compléments cryptographiques sont chargés en tout
 * premier : l'aléa sûr doit exister avant toute création de code ou de clé.
 */
import './src/platform/polyfills';

import { registerRootComponent } from 'expo';

import App from './src/App';

registerRootComponent(App);
