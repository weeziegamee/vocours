# Vocourse — mise en production au Canada

Ce guide part du code livré (appli Expo + serveur Node) et va jusqu'aux applis publiées
sur l'App Store et Google Play. Les étapes marquées **(vous)** demandent un compte, une
signature ou une décision qui ne peuvent pas être faits à votre place.

---

## 0. Vue d'ensemble

```
 Téléphone du senior                Serveur Vocourse (Canada, région de Montréal)        Tiers
 ┌──────────────────────┐  HTTPS   ┌──────────────────────────────────────────┐
 │ Appli Vocourse        │────────▶│ API /v1 (Node 24, SQLite chiffré)          │──▶ Instacart IDP (lien de liste)
 │ - dictée sur l'appareil│         │ - analyse des dictées (texte seulement)  │──▶ Twilio (textos à l'aidant)
 │ - voix du téléphone    │         │ - réglages chiffrés, preuves 12 mois      │
 │ - liste chiffrée       │         │ - purge automatique (Loi 25)              │
 └──────────────────────┘          └──────────────────────────────────────────┘
```

* L'audio ne quitte jamais le téléphone quand la reconnaissance sur l'appareil est
  disponible (cas de la plupart des iPhone récents et des Android 13+ avec le pack de langue).
* Aucun prix n'est calculé par Vocourse : l'aidant voit le montant exact sur Instacart.

---

## 1. Ce qu'il vous reste à faire (liste de contrôle)

| # | Tâche | Qui | Où |
|---|-------|-----|----|
| 1 | Obtenir l'accès à Instacart Developer Platform (inscriptions parfois fermées) | **vous** | §4 |
| 2 | Créer le compte Twilio, acheter un numéro canadien, limiter l'envoi au Canada | **vous** | §5 |
| 3 | Choisir l'hébergement (région de Montréal) et le nom de domaine `api.…` | **vous** | §3 |
| 4 | Générer les clés du serveur et les ranger dans le gestionnaire de secrets | **vous** (commande fournie) | §3.2 |
| 5 | Comptes Apple Developer (99 $ US/an) et Google Play Console (25 $ US) | **vous** | §6 |
| 6 | Identifiants de l'appli (`ca.votreentreprise.vocourse`) et projet EAS | **vous** | §6.1 |
| 7 | Faire relire par un avocat : politique de confidentialité, conditions d'utilisation, EFVP | **vous** | docs/ |
| 8 | Désigner le responsable de la protection des renseignements personnels et publier son titre et ses coordonnées | **vous** | docs/CONFIDENTIALITE.md |
| 9 | Publier la politique de confidentialité aux adresses configurées dans `app.config.js` | **vous** | §6.2 |
| 10 | Vérifier les filtres de marque maison avec le catalogue Instacart | **vous** + développeur | §4.3 |
| 11 | Bêta avec de vrais aînés et aidants (TestFlight, tests fermés Google Play) | **vous** | §7 |

---

## 2. Poste de travail

```bash
./scripts/setup.sh        # Node 22.13+ ; installe, aligne les versions Expo SDK 57, lance les tests
```

Versionner ensuite `package-lock.json` (et `server/package-lock.json`).

Lancer en mode démonstration (aucun serveur, code de vérification `123456`) :

```bash
npm start                 # puis « a » (Android) ou « i » (iOS) ; nécessite une version de développement :
npx eas build --profile development --platform android   # ou ios ; à installer une fois sur le téléphone
```

> La dictée utilise des modules natifs : elle ne fonctionne pas dans « Expo Go ». Utiliser
> une version de développement (`development`) ou `npx expo run:android` / `run:ios`.

---

## 3. Serveur

### 3.1 Hébergement (vous)

Héberger **au Québec** évite qu'une communication des données vers l'extérieur du Québec
ait lieu à cette étape (Loi 25, art. 17) et simplifie l'EFVP. Régions possibles :

| Fournisseur | Région |
|-------------|--------|
| AWS | ca-central-1 (Montréal) |
| Google Cloud | northamerica-northeast1 (Montréal) |
| Microsoft Azure | Canada Est (Québec) |
| OVHcloud | Beauharnois (Québec) |

Besoins : un conteneur Docker (512 Mo de mémoire suffisent au départ), **un volume
persistant** pour `/data`, un certificat HTTPS (Caddy, répartiteur de charge géré, etc.).
Une seule instance à la fois (SQLite) ; c'est suffisant pour des milliers d'utilisateurs.

### 3.2 Clés et variables

```bash
cd server && npm run keys        # affiche DATA_ENCRYPTION_KEY et TOKEN_SIGNING_KEY
```

Copier `server/.env.example` dans le gestionnaire de secrets de l'hébergeur et le remplir.
**Garder une copie hors ligne de `DATA_ENCRYPTION_KEY`** : sans elle, la base est illisible.

Le serveur refuse de démarrer en production s'il manque une clé, la clé Instacart ou Twilio.

### 3.3 Construire et lancer

```bash
docker build -f server/Dockerfile -t vocourse-server .
docker run -d --name vocourse -p 8080:8080 --env-file .env -v vocourse-data:/data vocourse-server
curl https://api.votre-domaine.ca/v1/health      # {"status":"ok",...}
```

Derrière le proxy TLS, mettre `TRUST_PROXY=true`. Ne jamais exposer le port 8080 sans HTTPS.

### 3.4 Sauvegardes et exploitation

* Sauvegarde quotidienne chiffrée du volume `/data` (instantané du disque, ou
  `sqlite3 /data/vocourse.sqlite ".backup /backup/vocourse-$(date +%F).sqlite"`), gardée
  au Canada, conservée 30 jours, **restauration testée** une fois avant le lancement.
* Surveillance : sonde `GET /v1/health` toutes les minutes ; alerte sur les lignes
  `"level":"error"` du journal. Le journal ne contient aucune donnée personnelle.
* Tâches intégrées : nouvel essai des textos en échec (5 min), purge de conservation (1 h) :
  listes transmises et comptes inactifs après `RETENTION_DAYS` (365 par défaut).
* Mise à jour : `docker build` puis remplacer le conteneur ; arrêt propre sur SIGTERM.

---

## 4. Instacart Developer Platform (vous)

### 4.1 Accès
1. Demander l'accès sur la page développeurs d'Instacart (Canada). Les inscriptions ont
   été fermées par moments : vérifier régulièrement, ou contacter Instacart directement.
2. Créer une clé **Development** dans dashboard.instacart.com → API Keys ; la mettre dans
   `INSTACART_API_KEY` avec `INSTACART_ENV=development` sur un serveur de préproduction.
3. Tester un envoi complet (une liste réelle, vérifier la page Instacart reçue par texto).
4. Créer la clé **Production** et passer `INSTACART_ENV=production`.

### 4.2 Ce que Vocourse envoie
Titre « Épicerie du 28 octobre », produits (nom de recherche, libellé, quantités), filtres de
gamme, nom de l'épicerie préférée, durée du lien (2 jours). **Jamais** de nom, d'adresse ni de
numéro. Pour la liste des épiceries proches (espace aidant), seul le **code postal** est envoyé ;
ces deux flux sont déclarés dans la politique de confidentialité et l'EFVP (F2, F2b).

### 4.3 À valider avant le lancement
* `server/src/services/instacart.ts`, tableau `STORE_BRANDS` : orthographe exacte des marques
  maison (« no name », « Sélection », « Compliments », « Great Value », « Kirkland Signature »,
  « Western Family »…) dans le catalogue Instacart. Le filtre est sensible à la casse.
* `GET /v1/retailers` : vérifier que l'API renvoie bien des épiceries pour des codes postaux
  canadiens (Montréal, Toronto, Vancouver, Halifax, région éloignée).

---

## 5. Twilio — textos (vous)

1. Créer un compte Twilio, acheter un **numéro canadien** capable d'envoyer des textos
   (ou créer un « Messaging Service » et y rattacher le numéro).
2. *Messaging → Settings → Geo permissions* : n'autoriser que le **Canada**
   (et les États-Unis seulement si des aidants y résident). Protège contre la fraude aux textos.
3. Garder la gestion automatique de STOP / ARRÊT / START activée (réglage par défaut).
   Vocourse détecte un refus (code 21610) et l'affiche dans l'espace aidant.
4. Renseigner `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` (`+1…` ou `MG…`).
5. Suivre les exigences de Twilio pour l'envoi de textos d'application au Canada
   (enregistrement ou vérification du numéro selon le type de numéro choisi).

---

## 6. Applis iOS et Android

### 6.1 Identifiants (vous)
* Choisir les identifiants définitifs, par exemple `ca.votreentreprise.vocourse`, et les
  mettre dans les variables `IOS_BUNDLE_ID` et `ANDROID_PACKAGE` (profil `production` d'`eas.json`),
  ou directement dans `app.config.js`.
* `npx eas init` (crée le projet EAS ; mettre l'identifiant dans `EAS_PROJECT_ID`).
* Adresse du serveur : `VOCOURSE_API_URL` dans `eas.json`.

### 6.2 Politique de confidentialité en ligne (vous)
Publier `docs/CONFIDENTIALITE.md` et `docs/PRIVACY.md` (après relecture juridique) aux
adresses `VOCOURSE_PRIVACY_URL_FR` / `_EN` (par défaut `https://vocourse.ca/confidentialite`
et `/en/privacy`). Les boutiques exigent cette adresse ; l'appli l'ouvre au consentement.

### 6.3 Compiler et envoyer
```bash
npx eas build --profile preview --platform all        # préproduction, serveur de test
npx eas build --profile production --platform all     # versions des boutiques
npx eas submit --profile production --platform all    # envoi à App Store Connect et Google Play
```
Avant le premier `eas submit`, remplir dans `eas.json` (profil `submit.production`) :
* iOS : `ascAppId` = identifiant numérique de l'appli dans App Store Connect (*Informations
  sur l'app → Identifiant Apple*), après avoir créé la fiche de l'appli.
* Android : clé JSON d'un compte de service Google Play, déposée dans `secrets/` (dossier
  ignoré par git) ; le tout premier envoi doit être fait à la main dans la Play Console.

EAS compile iOS dans le nuage : **aucun Mac n'est nécessaire**. Les certificats et clés de
signature sont créés et gardés par EAS (`npx eas credentials`).

Exigences des boutiques couvertes par la configuration :
* Google Play : cible Android 16 (API 36), obligatoire depuis le 31 août 2026.
* Apple : compilation avec Xcode 26+ / SDK iOS 26+ (images EAS à jour) ; cycle de vie par
  scènes activé pour le SDK iOS 27.
* Suppression du compte dans l'appli (Apple 5.1.1(v), Google Play) : *Espace aidant →
  Confidentialité → Supprimer le compte et les données*.

### 6.4 Fiches des boutiques
Voir `docs/STORES.md` (textes FR/EN, réponses « App Privacy » et « Sécurité des données »,
notes pour l'examinateur avec le numéro de démonstration).

### 6.5 Épinglage du certificat (facultatif, après stabilisation)
Fournir `VOCOURSE_TLS_HOST` et au moins deux empreintes `VOCOURSE_TLS_PINS` (voir
`plugins/withCertificatePinning.js`). À faire seulement quand l'autorité de certification
du serveur est stable ; une erreur couperait l'appli du serveur jusqu'à la prochaine version.

---

## 7. Bêta et lancement

1. **Préproduction** : serveur de test + `eas build --profile preview`. Parcours complet
   avec un vrai numéro d'aidant et la clé Instacart de développement.
2. **Bêta fermée** : TestFlight (iOS) et test fermé Google Play. Un compte Google Play
   *personnel* créé après le 13 novembre 2023 doit faire tester l'appli par **au moins 12
   testeurs pendant 14 jours consécutifs** avant de demander l'accès à la production ;
   un compte d'*organisation* évite cette contrainte.
3. Tester avec de vrais aînés : accent québécois et anglais canadien, texte agrandi à 200 %,
   VoiceOver / TalkBack, téléphone d'entrée de gamme, Wi-Fi coupé en pleine dictée.
4. Compte d'examen : `REVIEW_DEMO_MOBILE` + `REVIEW_DEMO_CODE` sur le serveur de production
   pendant l'examen (aucun texto réel), puis les retirer.
5. Lancement : publier, surveiller `/v1/health` et le journal, garder la clé de données hors ligne.

---

## 8. Tests automatisés

```bash
npm run typecheck && npm test               # appli : 107 tests, dont un test de bout en bout appli ↔ serveur
cd server && npm run typecheck && npm test  # serveur : 62 tests (API, chiffrement, Instacart, Twilio, analyse)
```
La CI GitHub (`.github/workflows/ci.yml`) les lance à chaque modification, avec la
construction de l'image Docker.
