/**
 * Génère les deux clés secrètes du serveur :  npm run keys
 * À copier dans le gestionnaire de secrets de l'hébergeur (jamais dans le dépôt).
 * Perdre DATA_ENCRYPTION_KEY rend illisibles les données chiffrées : la sauvegarder à part.
 */

import { randomBytes } from 'node:crypto';

process.stdout.write(`DATA_ENCRYPTION_KEY=${randomBytes(32).toString('base64')}\n`);
process.stdout.write(`TOKEN_SIGNING_KEY=${randomBytes(32).toString('base64')}\n`);
