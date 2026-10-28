# Serveur Vocourse

Node 24 (ou 22.18+), TypeScript exécuté directement par Node (aucune compilation),
**aucune dépendance d'exécution** : HTTP, SQLite (`node:sqlite`) et chiffrement (`node:crypto`)
sont intégrés à Node.

```bash
npm install          # outils de développement seulement (TypeScript, types Node)
npm run dev          # http://localhost:8080 — clés éphémères, liens Instacart factices, textos dans le terminal
npm test             # 62 tests
npm run typecheck
npm run keys         # génère DATA_ENCRYPTION_KEY et TOKEN_SIGNING_KEY
```

Production : `Dockerfile` (à construire depuis la racine du dépôt), variables dans
`.env.example`, procédure complète dans `../docs/DEPLOIEMENT.md`.

Routes : voir l'en-tête de `src/app.ts`. Données : `src/db.ts` (tout renseignement personnel
chiffré par champ). Analyse des dictées : `../shared/nlp`.
