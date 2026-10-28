#!/usr/bin/env bash
# Télécharge Atkinson Hyperlegible (Braille Institute, licence SIL Open Font License 1.1)
# dans assets/fonts. app.config.js l'embarque automatiquement quand les deux fichiers
# sont présents ; sinon l'appli utilise la police du système.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST="$ROOT/assets/fonts"
BASE="https://raw.githubusercontent.com/google/fonts/main/ofl/atkinsonhyperlegible"
mkdir -p "$DEST"
for f in AtkinsonHyperlegible-Regular AtkinsonHyperlegible-Bold; do
  curl -fsSL "$BASE/$f.ttf" -o "$DEST/$f.ttf"
done
curl -fsSL "$BASE/OFL.txt" -o "$DEST/OFL.txt" || true
echo "Polices installées dans assets/fonts (recompiler l'appli pour les embarquer)."
