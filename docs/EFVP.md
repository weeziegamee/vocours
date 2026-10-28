# Évaluation des facteurs relatifs à la vie privée (EFVP) — Vocourse 1.0

> **Ébauche technique** préparée à partir du code. Elle doit être complétée, datée et
> signée par le responsable de la protection des renseignements personnels, idéalement
> avec un conseiller juridique, **avant la mise en service** (Loi 25 : art. 3.3 pour un
> projet de système d'information, art. 17 pour la communication hors Québec, de la *Loi
> sur la protection des renseignements personnels dans le secteur privé*).

## 1. Le projet

Application mobile d'aide aux courses pour aînés : dictée vocale de la liste, choix d'une
gamme (sans prix), double confirmation, transmission à un aidant par texto avec un lien
Instacart. Personnes concernées : la personne aidée (souvent un aîné, potentiellement
vulnérable) et l'aidant.

## 2. Inventaire des renseignements

| Renseignement | Sensibilité | Source | Lieu de stockage | Durée |
|---|---|---|---|---|
| Voix | Élevée (biométrique potentielle) | Personne aidée | Aucun (traitée sur le téléphone) ; Apple/Google si reconnaissance en ligne autorisée | Aucune chez Vocourse |
| Texte dicté | Moyenne (peut révéler santé, habitudes) | Personne aidée | Mémoire du serveur pendant l'analyse ; réponse chiffrée 48 h | 48 h |
| Liste en cours, file hors ligne | Moyenne | Personne aidée | Téléphone, Keychain/Keystore | Jusqu'à l'envoi ; file 7 jours max |
| Listes envoyées + preuve de confirmation | Moyenne | Personne aidée | Serveur, chiffré AES-256-GCM | 12 mois |
| Prénoms, cellulaire de l'aidant, adresse, épicerie | Moyenne | Aidant | Téléphone + serveur, chiffrés | Compte actif ; 12 mois d'inactivité |
| Code de l'aidant | Élevée (secret) | Aidant | Téléphone, haché PBKDF2 + sel | Jusqu'au changement |
| Empreinte du cellulaire (HMAC) | Faible | Calculée | Serveur | Compte actif |

Aucune empreinte vocale n'est créée : **aucune banque biométrique**, donc pas de
déclaration à la CAI requise à ce titre. À réévaluer si une identification par la voix
est ajoutée (déclaration préalable obligatoire dans ce cas).

## 3. Flux et communications hors Québec

| # | Flux | Données | Destinataire | Hors Québec ? | Mesures |
|---|---|---|---|---|---|
| F1 | Appli → serveur | Texte dicté, réglages, liste confirmée | Vocourse (hébergé à [Montréal]) | Non, si hébergé au Québec | HTTPS, jeton court, chiffrement au repos |
| F2 | Serveur → Instacart | Produits, titre daté, nom de l'épicerie préférée (aucune identité) | Instacart / Maplebear | **Oui** (États-Unis, à confirmer) | Données minimisées, aucune identité, lien expirant en 2 jours |
| F2b | Serveur → Instacart | Code postal seul (recherche des épiceries proches) | Instacart / Maplebear | **Oui** (États-Unis, à confirmer) | Aucun autre champ ; le code postal n'est ni journalisé ni conservé par Vocourse au-delà des réglages chiffrés |
| F3 | Serveur → Twilio | Cellulaire de l'aidant, texto (prénom facultatif, nombre de produits, lien) | Twilio | **Oui** (États-Unis) | Aucun nom de produit, consentement exprès, STOP |
| F4 | Téléphone → Apple/Google (facultatif) | Audio | Apple / Google | **Oui** | Seulement si l'aidant l'autorise ; sinon dictée refusée |

Pour F2, F2b, F3 et F4, l'évaluation doit tenir compte de (art. 17) : la sensibilité du
renseignement, la finalité, les mesures de protection (y compris contractuelles) et le
régime juridique applicable dans l'État de destination. Une **entente écrite** tenant compte
des résultats est requise (conditions de service de Twilio et d'Instacart, accord de
traitement des données — à obtenir et archiver).

## 4. Risques et mesures

| Risque | Mesure en place (code) | Risque résiduel |
|---|---|---|
| Accès non autorisé à l'espace aidant | Code à 6 chiffres haché, refus des codes faibles, blocage 15 min après 3 essais, alerte par texto, fermeture après 3 min d'inactivité ou mise en arrière-plan | Faible |
| Vol du téléphone | Données dans Keychain/Keystore, liées à l'appareil, sans sauvegarde cloud ; jeton d'accès de 15 min | Faible à moyen (dépend du verrouillage du téléphone) |
| Fuite de la base du serveur | Chiffrement AES-256-GCM par champ lié au compte ; clé hors de la base | Faible si la clé est protégée |
| Texto lu par un tiers | Aucun nom de produit ; lien expirant après 2 jours | Faible |
| Mauvais destinataire du texto | Cellulaire confirmé par code avant tout envoi ; nouveau numéro = nouvelle confirmation | Faible |
| Commande non voulue | Relecture complète + deux confirmations distinctes ; empreinte de la liste vérifiée par le serveur ; paiement par l'aidant | Faible |
| Inférence de santé par les produits | Produits sensibles marqués, exclus des textos et des filtres | Faible |
| Conservation excessive | Purge automatique (12 mois) ; suppression immédiate du compte dans l'appli | Faible |
| Journaux contenant des renseignements | Journal sans dictée, nom, numéro, adresse ni lien (testé) | Faible |
| Abus des textos (coût, harcèlement) | Limites par compte, par numéro et par adresse IP ; restriction géographique Twilio | Faible |

## 5. Droits des personnes

Accès et portabilité (*Exporter mes données*, JSON structuré), rectification (réglages),
suppression (*Supprimer le compte*), retrait du consentement aux textos (STOP).

## 6. Décision

[À compléter par le responsable : acceptation des risques résiduels, conditions (ententes
écrites F2/F3, hébergement au Québec), date de revue (au plus tard dans 12 mois ou à tout
changement important).]

Signature : ____________________   Date : ____________
