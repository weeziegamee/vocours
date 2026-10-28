# Vocourse — lancer l'appli

## 1. Installation (une fois)

```bash
./scripts/setup.sh
```
Prérequis : Node.js 22.13 ou plus. Pour un émulateur Android : Android Studio. Pour le
simulateur iPhone : un Mac avec Xcode. **Pour compiler pour les boutiques, aucun Mac n'est
nécessaire** (EAS Build, voir docs/DEPLOIEMENT.md).

## 2. Mode démonstration (sans serveur)

La dictée et la voix utilisent les modules natifs du téléphone : il faut une **version de
développement** (pas Expo Go).

```bash
npx eas build --profile development --platform android   # ou ios ; installer l'appli obtenue
npm start                                                 # puis ouvrir l'appli de développement
# ou, avec Android Studio / Xcode installés :
npx expo run:android      # npx expo run:ios
```

En mode démonstration, le serveur est simulé sur le téléphone : **le code reçu « par
texto » est toujours 123456** et le lien Instacart est fictif.

Simulateur sans micro : `VOCOURSE_SIMULATED_SPEECH=true npm start` rejoue des phrases
préenregistrées (« Euh deux cartons de lait 2 % pis une douzaine d’œufs »…).

## 3. Avec le serveur local

```bash
cd server && npm run dev            # http://localhost:8080 ; textos écrits dans le terminal
```
Puis compiler l'appli avec `VOCOURSE_MODE=live` et `VOCOURSE_API_URL=http://10.0.2.2:8080`
(émulateur Android) ou `http://localhost:8080` (simulateur iOS) : le profil `development`
autorise le http local. Le code de vérification apparaît dans le terminal du serveur.

## 4. Parcours à essayer

| Étape | Action | Résultat attendu |
|---|---|---|
| Premier lancement | Choisir la langue, accepter, créer un code, remplir les réglages | Code par texto, « Tout est prêt » |
| Dictée | « Deux cartons de lait 2 % pis du beur et du pâté chinois » | Lait ajouté, question « beurre ? », pâté chinois gardé tel quel |
| Question | Dire « le premier » ou toucher la carte | « Beurre, c’est noté » |
| Hors ligne | Couper le Wi-Fi, dicter | Dictée gardée (si reconnaissance sur l'appareil), envoyée au retour |
| Fermer l'appli | La rouvrir | La liste est toujours là |
| Panier | « C’est bon » → gamme → « Continuer » → « Oui, c’est ça » → garder 2 s « Je commande » | Texto à l'aidant (lien Instacart) |
| Voix sur l'écran B | Bouton « Parler » : « oui », « répète », « oui, je commande » | Mêmes actions qu'au toucher |
| Espace aidant | Bouton « Aidant » → code | Réglages, export, suppression |
| Code oublié | « Code oublié ? » | Code par texto, puis nouveau code |
| 3 codes faux | — | Blocage 15 min, texto d'alerte à l'aidant |
| Anglais | Réglages → Langue → English | Toute l'appli et la voix en anglais |

## 5. Accessibilité

| Vérification | iOS | Android |
|---|---|---|
| Lecteur d'écran | VoiceOver (téléphone réel) | TalkBack |
| Texte à 200 % | Réglages › Accessibilité › Affichage et taille du texte | Paramètres › Affichage › Taille de police |
| Réduction des animations | Réglages › Accessibilité › Mouvement | Paramètres › Accessibilité › Supprimer les animations |

## 6. Tests

```bash
npm run typecheck && npm test
cd server && npm run typecheck && npm test
```
