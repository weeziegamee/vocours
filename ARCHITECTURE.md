# Vocourse — architecture (version 1.0, prête pour le Canada)

Marché : tout le Canada, français canadien par défaut et anglais canadien.
Intégration Instacart : Developer Platform, page de liste (« products_link »).
Aucun prix n'est estimé par Vocourse : l'aidant voit le montant exact sur Instacart.

```
vocourse/
├── index.ts                     point d'entrée (aléa sûr chargé en premier, puis App)
├── app.config.js · eas.json     configuration Expo / EAS (iOS, Android, permissions, profils)
├── metro.config.js              retire l'extension .ts des imports de shared/ ; exclut server/
├── plugins/withCertificatePinning.js   épinglage TLS facultatif (iOS + Android)
├── assets/                      icône, icône adaptative, écran de démarrage, polices (scripts/fetch-fonts.sh)
├── locales/                     textes des autorisations iOS (fr, en)
│
├── shared/nlp/                  ANALYSEUR DE DICTÉE (pur, sans dépendance) : serveur + mode démo
│   ├── interpret.ts             découpage, quantités, unités, formats, doutes, produits libres
│   ├── lexicon.ts               ~80 produits bilingues, expressions québécoises, mots sensibles
│   └── types.ts
│
├── src/
│   ├── App.tsx                  orchestration : premier lancement, écrans A/B, espace aidant
│   ├── types/vocourse.ts        modèle de données et contrat avec le serveur
│   ├── i18n/                    tous les textes et répliques (fr-CA vous/tu, en-CA)
│   ├── config/                  env.ts (modes live/demo), runtimeEnv.ts (lu dans app.config.js)
│   ├── platform/polyfills.ts    crypto.getRandomValues / randomUUID via expo-crypto
│   ├── theme/                   palette AAA mesurée, typographie, cibles tactiles, police
│   ├── state/listReducer.ts     réducteur pur de la liste (+ reprise au démarrage)
│   ├── hooks/                   liste persistante, dictée + file hors ligne, voix en file, réponses vocales
│   ├── screens/
│   │   ├── OnboardingScreen     langue, consentement, « Tout est prêt », reconfiguration
│   │   ├── HomeScreen           écran A « Ma liste »
│   │   ├── BasketScreen         écran B « Mon panier » (gammes sans prix, relecture, 2 confirmations)
│   │   ├── basketMachine.ts     automate pur de l'écran B (empreinte de la liste relue)
│   │   └── caregiver/           code PIN (+ oublié), réglages (Canada), code reçu par texto
│   ├── components/              boutons géants, cartes, formulaire accessible, micro
│   └── services/
│       ├── api/                 client HTTPS du serveur ; serveur simulé (mode démo)
│       ├── auth/session.ts      secret d'appareil → jetons de 15 min
│       ├── storage/             Keychain/Keystore découpé, persistance liste/file/configuration
│       ├── speech/              reconnaissance vocale du téléphone (sur l'appareil d'abord)
│       ├── tts/                 voix du téléphone (choix de la meilleure voix fr-CA / en-CA)
│       ├── network/             joignabilité réelle du serveur (NetInfo + /v1/health)
│       ├── voice/intents.ts     « oui », « répète », « le deuxième », « oui, je commande »
│       ├── handoff/digest.ts    empreinte SHA-256 de la liste relue (même calcul que le serveur)
│       ├── caregiver/settings.ts validation canadienne (code postal → province, cellulaire)
│       └── security/            SHA-256/HMAC/PBKDF2, politique et coffre du code PIN
│
├── __tests__/                   107 tests, dont contract.test.ts (vrai client ↔ vrai serveur)
│
├── server/                      SERVEUR (Node 24, aucune dépendance d'exécution)
│   ├── src/app.ts               routes /v1 (voir l'en-tête du fichier)
│   ├── src/db.ts                SQLite intégré (node:sqlite), purge de conservation
│   ├── src/crypto.ts            AES-256-GCM par champ, HMAC, jetons signés, empreinte de liste
│   ├── src/services/            Instacart (payload, gammes, enseignes), Twilio, textes des textos
│   ├── test/                    62 tests (API complète, chiffrement, Instacart, Twilio, analyseur)
│   └── Dockerfile · .env.example
│
└── docs/                        DEPLOIEMENT, CONFIDENTIALITE / PRIVACY, EFVP, STORES
```

## Règles d'architecture

1. **La clé Instacart ne quitte jamais le serveur.** L'appli envoie la liste confirmée ;
   le serveur crée la page Instacart et l'envoie par texto à l'aidant.
2. **L'audio ne quitte pas le téléphone** quand la reconnaissance sur l'appareil existe ;
   sinon, seulement avec l'autorisation donnée par l'aidant à la configuration.
3. **Ce qui est envoyé est ce qui a été relu** : empreinte de la liste calculée à la
   relecture, vérifiée par l'automate puis par le serveur ; deux confirmations distinctes.
4. **Confidentialité par défaut** (Loi 25) : chiffrement au repos des deux côtés, aucun nom
   de produit dans les textos, produits sensibles jamais filtrés, journaux sans donnée
   personnelle, purge à 12 mois, export et suppression du compte dans l'appli.
5. **Écrans présentationnels** : la logique vit dans `hooks/`, `services/`, `state/` et
   `screens/basketMachine.ts`, testable sans téléphone.
6. **Deux langues complètes** : toute chaîne visible ou prononcée vient de `src/i18n` ;
   un test vérifie que les deux langues ont exactement les mêmes clés.

## Contrat appli ↔ serveur (v1)

| Appel | Corps | Réponse |
|---|---|---|
| `POST /v1/devices` | langue, plateforme, consentement | `deviceId`, `deviceSecret`, jeton |
| `POST /v1/auth/token` | `deviceId`, `deviceSecret` | jeton de 15 min |
| `POST /v1/utterances` (idempotent) | texte reconnu, langue, registre, dictionnaire | produits confirmés / questions |
| `PUT /v1/caregiver/settings` (idempotent) | réglages | `caregiverMobileVerified` |
| `GET /v1/caregiver/status` | — | cellulaire confirmé, STOP |
| `POST /v1/caregiver/verification[/confirm]` | `mobile` ou `pin_reset` (+ code) | numéro masqué / vérifié |
| `GET /v1/retailers` | — | épiceries Instacart près de l'adresse |
| `POST /v1/handoffs` (idempotent) | gamme, produits, empreinte, confirmations | texto envoyé / en attente / refusé |
| `POST /v1/alerts` | `pin_lockout` ou `settings_changed` | aidant prévenu ? |
| `GET /v1/account/export` · `DELETE /v1/account` | — | toutes les données · suppression |
