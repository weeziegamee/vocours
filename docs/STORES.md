# Fiches App Store et Google Play

## Textes

**Nom** : Vocourse — Épicerie à la voix / Vocourse — Grocery by voice

**Sous-titre (iOS, 30 car.)** : Dictez, votre proche commande / Say it, your loved one orders

**Description courte (Google Play, 80 car.)**
* FR : Dictez votre liste d’épicerie ; votre proche la reçoit par texto et commande.
* EN : Dictate your grocery list; your loved one gets it by text and places the order.

**Description**

FR :
> Vocourse est pensée pour les aînés. Touchez le gros bouton vert et dites simplement
> « deux cartons de lait et une douzaine d’œufs ». Vocourse écrit la liste, vous la relit
> et pose une petite question en cas de doute. Choisissez un panier — économique,
> équilibré ou bio — et confirmez deux fois. Votre proche reçoit la liste par texto et
> commande sur Instacart, au magasin de son choix.
>
> • Grands boutons, texte agrandi jusqu’à 200 %, compatible VoiceOver et TalkBack
> • Comprend le français québécois (« des bines », « une pinte de lait ») et l’anglais canadien
> • Fonctionne même sans Internet : la liste est gardée et envoyée au retour du réseau
> • Espace aidant protégé par un code : adresse, épicerie préférée, langue
> • Vos données restent au Canada ; aucune publicité
>
> Vocourse n’affiche pas de prix : votre proche voit le montant exact sur Instacart avant de payer.
> La livraison est offerte par Instacart et les épiceries participantes, selon votre adresse.

EN :
> Vocourse is designed for seniors. Tap the big green button and just say “two cartons of
> milk and a dozen eggs”. Vocourse writes the list, reads it back and asks a quick question
> when unsure. Choose a basket — economy, balanced or organic — and confirm twice. Your loved
> one gets the list by text and orders on Instacart, from the store of their choice.
>
> • Big buttons, text up to 200%, works with VoiceOver and TalkBack
> • Understands Canadian English and Quebec French
> • Works offline: your list is kept and sent when you’re back online
> • Caregiver area protected by a code: address, preferred store, language
> • Your data stays in Canada; no ads
>
> Vocourse doesn’t show prices: your loved one sees the exact amount on Instacart before paying.

**Catégorie** : Achats / Shopping (secondaire : Style de vie)
**Classification** : 4+ (iOS) ; « Tout public » (Google Play, questionnaire IARC)
**Pays** : Canada seulement (au lancement)
**Langues de la fiche** : français (Canada) en premier, anglais (Canada)

## Apple — « App Privacy » (étiquettes de confidentialité)

| Type de donnée Apple | Collectée ? | Liée à l'identité ? | Suivi ? | Finalité |
|---|---|---|---|---|
| Coordonnées → Nom (prénoms) | Oui | Oui | Non | Fonctionnalité de l'appli |
| Coordonnées → Numéro de téléphone (aidant) | Oui | Oui | Non | Fonctionnalité de l'appli |
| Coordonnées → Adresse postale (livraison) | Oui | Oui | Non | Fonctionnalité de l'appli |
| Contenu utilisateur → Autre contenu (listes, texte dicté) | Oui | Oui | Non | Fonctionnalité de l'appli |
| Contenu utilisateur → Données audio | **Non** (reconnaissance sur l'appareil ; Apple traite l'audio en ligne seulement si autorisé, hors Vocourse) | — | — | — |
| Identifiants → Identifiant de l'appareil (technique, propre à Vocourse) | Oui | Oui | Non | Fonctionnalité de l'appli |
| Localisation, contacts, historique, diagnostics, publicité | Non | — | — | — |

« Tracking » (suivi publicitaire) : **Non**. Pas d'App Tracking Transparency.
Chiffrement : seulement le HTTPS standard → `ITSAppUsesNonExemptEncryption = false` (déjà configuré).

## Google Play — « Sécurité des données »

* Données collectées : Renseignements personnels (nom, adresse, numéro de téléphone),
  Messages → Autres messages (listes dictées sous forme de texte), Identifiants d'appareil.
* Données partagées : Oui — avec Instacart (produits de la liste, sans identité) et Twilio
  (numéro de l'aidant et texto) pour fournir le service.
* Chiffrement en transit : Oui. Suppression possible : Oui (dans l'appli + adresse web :
  [page web de demande de suppression, exigée par Google]).
* Collecte facultative : prénom de la personne aidée ; reconnaissance vocale en ligne.
* Finalités : fonctionnalité de l'appli. Aucune publicité, aucune analyse.

## Notes pour l'examinateur (App Review / Google)

FR/EN (à coller dans App Store Connect → « Notes » et dans Play Console) :

> Vocourse is a grocery-list app for seniors. Setup is done once by a caregiver.
> 1. Choose a language, accept the privacy policy, create a 6-digit caregiver code (e.g. 482915).
> 2. In settings, enter any first names, the caregiver cell number **[REVIEW_DEMO_MOBILE, ex. 514 555-0100]**,
>    any Canadian address (e.g. 1234 rue Saint-Denis, Montréal, H2T 1S6) and accept texts.
> 3. On the verification screen, enter the code **[REVIEW_DEMO_CODE]** (no SMS is sent for this demo number).
> 4. Tap the green microphone and say “two cartons of milk and a dozen eggs”.
>    Tap “That’s all”, choose a basket, “Continue”, “Yes, that’s right”, then hold “Place order” 2 seconds.
> Account deletion: “Caregiver” button (top right) → enter the code → Privacy → Delete the account and data.
> Microphone and speech recognition are used only while the green button is active.

Avant l'examen, mettre `REVIEW_DEMO_MOBILE` et `REVIEW_DEMO_CODE` sur le serveur de production ;
les retirer après l'approbation.

## Captures d'écran

À faire sur un vrai téléphone (iPhone 6,9 po et 6,5 po ; Android téléphone) en mode
démonstration : accueil avec une liste, question « Vouliez-vous du beurre ? », choix du
panier, relecture, « C’est noté », espace aidant. Montrer le texte en grand.
