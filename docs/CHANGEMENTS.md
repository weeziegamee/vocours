# Ce qui a été corrigé depuis le prototype (étape 5)

| Problème relevé | Correction |
|---|---|
| Aucun serveur | `server/` : API complète (inscription d'appareil, jetons, analyse, réglages chiffrés, vérification par texto, épiceries proches, transmission Instacart, alertes, export, suppression, purge 12 mois), Dockerfile, 62 tests |
| Accès et jeton : `getAccessToken` renvoyait toujours `null` | Session d'appareil : secret dans le Keychain/Keystore → jetons de 15 min, renouvelés automatiquement ; « appareil inconnu » → écran de reconfiguration |
| Dictée et voix simulées | Reconnaissance vocale du téléphone (sur l'appareil d'abord, en ligne seulement si l'aidant l'autorise), voix du téléphone (meilleure voix fr-CA / en-CA), fin de prise après 4 s de silence |
| Analyse limitée à 25 produits, côté téléphone | Analyseur bilingue partagé (`shared/nlp`) : ~80 produits, expressions québécoises, anglais canadien (« homo milk », « bag of milk », « two-four »), **tout autre produit gardé tel qu'il a été dit**, produits sensibles marqués |
| Prix inventés | Plus aucun prix : 3 gammes (Économique = marque maison de l'épicerie préférée, Équilibré, Bio) ; le prix exact est celui d'Instacart |
| Québec seulement (TPS/TVQ, codes postaux G-H-J, français) | 13 provinces et territoires (province déduite du code postal), anglais complet, épiceries réelles proches de l'adresse (API Instacart) |
| Stockage en mémoire (code PIN et réglages perdus) | expo-secure-store (Keychain/Keystore, appareil seulement, sans sauvegarde cloud), découpage sûr des grandes valeurs |
| Liste et file hors ligne perdues à la fermeture | Liste et file (30 dictées, 7 jours) gardées chiffrées et reprises au démarrage |
| Réseau simulé même en mode « live » | Joignabilité réelle : NetInfo + sonde `/v1/health` |
| Classe `URL` utilisée (incomplète sous React Native) | Adresses vérifiées et assemblées comme du texte |
| Aléa non cryptographique en repli (`Math.random`) | Aléa d'expo-crypto obligatoire ; sans source sûre, refus |
| Premier accès : n'importe qui pouvait créer le code aidant | Configuration initiale guidée par l'aidant (langue → consentement → code → réglages → cellulaire confirmé) |
| Pas de « code oublié » | Code envoyé par texto au cellulaire confirmé de l'aidant, puis nouveau code |
| Pas de suppression de compte (exigée par Apple et Google) | Espace aidant → Confidentialité : exporter les données, supprimer le compte |
| Pas de consentement ni de politique | Écran de consentement (versionné, enregistré côté serveur), politique FR/EN, EFVP, consentement aux textos (STOP/START gérés) |
| Cellulaire de l'aidant jamais vérifié | Code à 6 chiffres par texto avant tout envoi ; nouveau numéro = nouvelle vérification |
| Liste envoyée ≠ liste relue possible | Empreinte SHA-256 de la liste relue, vérifiée par l'appli et par le serveur |
| Commandes vocales de l'écran B non branchées | Bouton « Parler » : « oui », « non », « répète », « équilibré », « oui, je commande » (jamais une phrase négative) ; questions de doute : « le deuxième », « aucun », ou le nom du produit |
| Filtres de marque appliqués quelle que soit l'enseigne | Marque maison selon l'épicerie préférée seulement ; jamais de filtre sur un produit sensible ; Bio réservé aux rayons alimentaires |
| React Native 0.76 (ne respecte plus les exigences des boutiques) | Expo SDK 57 / React Native 0.86 : cible Android 16 (API 36), compilation Xcode 26+, cycle de vie par scènes iOS |
| Projets natifs générés à la main (Mac requis) | Expo + EAS : compilation iOS et Android dans le nuage, signature gérée, envoi aux boutiques |
| Pas d'icône, police téléchargée au démarrage du script | Icône et écran de démarrage fournis ; police embarquée automatiquement si présente |
| Pas de CI ni de linter | GitHub Actions (typage, ESLint, tests appli et serveur, image Docker) |
| Pas d'épinglage du certificat | Plugin prêt, activé quand vous fournissez les empreintes |

## Revue de sécurité et de robustesse (seconde passe)

Une relecture indépendante du code corrigé a relevé les points suivants, tous corrigés :

| Problème | Correction |
|---|---|
| « Code oublié ? » effaçait le code aidant avant le nouveau : abandonner laissait l'espace aidant ouvert à tous | L'ancien code reste jusqu'à l'enregistrement du nouveau ; abandon ou inactivité referment l'espace ; un téléphone sans code n'en laisse plus créer un (passage obligé par le texto) |
| Nouvelle tentative d'une dictée refusée (clé d'idempotence réutilisée avec une requête différente) | Requête figée à la prise ; le serveur ne rejoue plus les conflits (409) |
| Une dictée refusée par le serveur bloquait toute la file pour toujours | Refus définitif : retirée de la file, avec un message vocal demandant de la redire |
| Une nouvelle dictée contenant le nom d'un choix répondait à la question en cours | Seules les réponses courtes (5 mots au plus) répondent à une question |
| Numéros des Caraïbes et sans frais acceptés (fraude aux textos) ; pas de plafond global | Indicatifs refusés (appli et serveur), plafond quotidien `SMS_DAILY_BUDGET` |
| Adresse IP du client lue dans l'en-tête fourni par le client (limites contournables) | `TRUST_PROXY` : seule l'entrée ajoutée par le répartiteur de confiance est lue |
| Code postal envoyé à Instacart non déclaré ; chemin complet des requêtes Instacart journalisé | Déclaré (politique, EFVP F2b) ; journal réduit à la route et au code HTTP |
| Deux appuis rapides sur le micro lançaient deux prises | Démarrage protégé ; un arrêt pendant le démarrage l'annule sans message |
| Analyse arrivée pendant la relecture du panier : liste modifiée en cours d'envoi | Résultats gardés et ajoutés au retour sur « Ma liste » ; la file attend |
| « dix-huit », « vingt-quatre », « twenty four » non compris ; « deux yogourts non trois » mal corrigé ; « un demi-kilo » arrondi à 1 | Nombres composés, correction après le nom, fractions pour les poids, volumes et douzaines ; « 24 canettes de liqueur » ≠ 24 bouteilles de 2 L |
| Réinitialisation du téléphone : file de dictées conservée | File vidée et écoute arrêtée |
| Envoi du panier abandonné après 12 s alors que le serveur attend encore Instacart | Délai de 60 s pour cet appel |
| Libellé libre très long refusé par le serveur | Libellé borné à 100 caractères |
| Partage de l'export ou lecture de la politique : espace aidant refermé en plein milieu | Sortie voulue tolérée 2 minutes |
| `metro.config.js` excluait tout dossier nommé `server` (y compris dans node_modules) | Exclusion limitée au dossier `server/` du projet ; `ascAppId` documenté |

## Ce qui ne peut pas être fait dans le code

Voir la liste de contrôle de `docs/DEPLOIEMENT.md` §1 : accès Instacart, compte Twilio,
hébergement, comptes Apple et Google, identifiants de l'appli, relecture juridique,
responsable de la protection des renseignements personnels, publication de la politique,
validation des marques maison, bêta avec de vrais aînés.
