/**
 * Metro (empaqueteur de l'appli).
 * - `shared/` est importé avec l'extension `.ts` explicite (pour que le même fichier
 *   fonctionne aussi sous Node, côté serveur) : l'extension est retirée avant résolution.
 * - Le dossier `server/` n'est jamais empaqueté dans l'appli.
 */
const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

const previous = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const name = moduleName.startsWith('.') && moduleName.endsWith('.ts') ? moduleName.slice(0, -3) : moduleName;
  return previous ? previous(context, name, platform) : context.resolveRequest(context, name, platform);
};

// Seulement le dossier server/ de CE projet (pas un paquet de node_modules nommé « server »).
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
config.resolver.blockList = [new RegExp(`^${escape(path.join(__dirname, 'server'))}[\\\\/].*`)];

module.exports = config;
