#!/usr/bin/env bash
# =============================================================================
# Vocourse — installation du poste de développement (une seule fois).
#
#   ./scripts/setup.sh
#
# 1. vérifie Node.js (22.13 ou plus) ;
# 2. installe les dépendances de l'appli et aligne leurs versions sur Expo SDK 57
#    (`npx expo install --fix`) ;
# 3. télécharge la police Atkinson Hyperlegible (licence SIL OFL) ;
# 4. installe les dépendances de développement du serveur ;
# 5. lance le typage et les tests (appli + serveur).
#
# Ensuite : voir LANCEMENT.md (simulateur, téléphone, compilation pour les boutiques).
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

say()  { printf '\n\033[1m▶ %s\033[0m\n' "$*"; }
warn() { printf '\033[33m⚠ %s\033[0m\n' "$*"; }
die()  { printf '\033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

say "Vérification de Node.js"
command -v node >/dev/null || die "Node.js est requis (22.13 ou plus) : https://nodejs.org"
node -e 'const [a,b]=process.versions.node.split(".").map(Number); process.exit(a>22||(a===22&&b>=13)?0:1)' \
  || die "Node.js $(node -v) détecté : il faut la version 22.13 ou plus."

say "Dépendances de l'appli"
npm install
npx --yes expo install --fix
# Bibliothèque de dictée (hors du catalogue Expo) : dernière version compatible.
npx --yes expo install expo-speech-recognition

say "Police Atkinson Hyperlegible"
bash scripts/fetch-fonts.sh || warn "Police non téléchargée : l'appli utilisera la police du système."

say "Dépendances du serveur"
( cd server && npm install )

say "Vérifications"
npm run typecheck
npm test -- --silent
( cd server && npm run typecheck && npm test )

cat <<'EOF'

✅ Prêt.

  Appli en mode démonstration (sans serveur) :  npm start   puis « a » (Android) ou « i » (iOS)
  Serveur local :                                cd server && npm run dev
  Compilation pour les boutiques :               voir docs/DEPLOIEMENT.md
EOF
