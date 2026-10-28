# Politique de confidentialité de Vocourse

> **Modèle à faire relire par un avocat avant publication.** Les passages entre crochets
> `[…]` sont à compléter. Ce texte décrit fidèlement le fonctionnement du code livré
> (version 1.0) ; toute modification du traitement des données doit y être reportée.

**Version 2026-10 — en vigueur le [date]**

[Nom légal de l'entreprise] (« nous ») exploite l'application Vocourse, qui permet à une
personne (la « personne aidée ») de dicter sa liste d'épicerie et de la transmettre à un
proche (l'« aidant »), qui finalise la commande sur Instacart.

## 1. Responsable de la protection des renseignements personnels

[Nom et titre], [adresse postale], [courriel], [téléphone].
Vous pouvez lui écrire pour toute question, demande d'accès, de rectification, de
portabilité ou de suppression, ou pour retirer un consentement.

## 2. Renseignements recueillis et raisons

| Renseignement | Où | Pourquoi | Conservation |
|---|---|---|---|
| Voix | Sur le téléphone seulement* | Transformer la parole en texte | Jamais enregistrée par Vocourse |
| Texte des dictées | Téléphone ; serveur Vocourse le temps de l'analyse | Reconnaître les produits | Non conservé par le serveur (réponse technique gardée 48 h, chiffrée, pour éviter les doublons) |
| Liste en cours | Téléphone (stockage chiffré) | Ne rien perdre | Jusqu'à l'envoi, 12 mois au plus |
| Listes envoyées et confirmations (texte relu, heure des deux confirmations) | Serveur Vocourse (chiffrées) | Preuve du consentement à la commande, droit d'accès | 12 mois, puis suppression automatique |
| Prénom de la personne aidée (facultatif) et de l'aidant, cellulaire de l'aidant, adresse de livraison, épicerie préférée, langue | Téléphone et serveur (chiffrés) | Prévenir l'aidant, préparer la liste Instacart | Jusqu'à la suppression du compte, ou 12 mois sans utilisation |
| Code de l'aidant | Téléphone seulement, sous forme hachée | Protéger l'espace aidant | Jusqu'à son changement |
| Identifiant technique de l'appareil | Téléphone et serveur | Sécuriser les échanges | Jusqu'à la suppression du compte |

\* Si le téléphone ne sait pas reconnaître la voix sans Internet, et **seulement si l'aidant
l'a autorisé** lors de la configuration, l'audio est transmis au service de reconnaissance
vocale d'Apple ou de Google, selon le téléphone, et traité selon leurs propres politiques.

Nous ne recueillons ni localisation, ni contacts, ni identifiant publicitaire. Aucune
publicité, aucun profilage, aucune vente ou location de renseignements.

**Produits sensibles** : certains produits peuvent révéler un état de santé (par exemple des
produits d'incontinence). Vocourse les signale comme sensibles : ils ne figurent jamais
dans les textos et ne reçoivent aucun filtre automatique.

## 3. Communication à des tiers

| Destinataire | Ce qui est communiqué | Pourquoi | Lieu |
|---|---|---|---|
| Instacart (Maplebear Inc.) | Produits de la liste (nom, quantité), titre daté, nom de l'épicerie préférée — **sans** nom, adresse ni numéro | Créer la page de liste où l'aidant choisit le magasin et paie | [États-Unis / Canada — à confirmer] |
| Instacart (Maplebear Inc.) | Code postal de livraison, seul (sans adresse ni identité), lors de la recherche des épiceries proches dans l'espace aidant | Proposer les épiceries qui livrent à cette adresse | [États-Unis / Canada — à confirmer] |
| Twilio Inc. | Cellulaire de l'aidant, texte du texto (prénom de la personne aidée si fourni, nombre de produits, lien Instacart) | Envoyer les textos | États-Unis |
| Hébergeur [nom] | Toutes les données du serveur, chiffrées | Héberger le service | [Montréal, Québec] |
| Apple / Google (facultatif) | Audio de la dictée | Reconnaissance vocale en ligne, si autorisée | [selon le fournisseur] |

Ces communications hors du Québec ont fait l'objet d'une évaluation des facteurs relatifs à
la vie privée et d'ententes écrites [à confirmer], conformément à l'article 17 de la *Loi sur
la protection des renseignements personnels dans le secteur privé*.

Le paiement est fait par l'aidant sur Instacart : Vocourse ne reçoit aucune donnée bancaire.

## 4. Consentement

Le consentement est demandé à la première utilisation, par l'aidant, pour l'ensemble du
service, puis séparément pour les textos et pour la reconnaissance vocale en ligne. Vous
pouvez retirer votre consentement en tout temps :
* textos : répondre **STOP** à un texto de Vocourse (START pour les réactiver) ;
* service entier : *Espace aidant → Confidentialité → Supprimer le compte et les données*.

## 5. Sécurité

Chiffrement des échanges (HTTPS), chiffrement des renseignements au repos sur le serveur
(AES-256-GCM) et sur le téléphone (Keychain / Keystore), espace aidant protégé par un code
à 6 chiffres (blocage après 3 essais, alerte à l'aidant), journaux techniques sans donnée
personnelle, accès au serveur restreint [à compléter : personnes ayant accès].

## 6. Vos droits

Vous pouvez demander l'accès à vos renseignements, leur rectification, leur suppression,
ou leur communication dans un format technologique structuré et couramment utilisé.
L'aidant peut le faire directement dans l'appli (*Exporter mes données*, *Supprimer le
compte*) ou en écrivant au responsable (section 1). Réponse dans les 30 jours.

Vous pouvez porter plainte auprès de la Commission d'accès à l'information du Québec
(www.cai.gouv.qc.ca) ou, hors Québec, du Commissariat à la protection de la vie privée
du Canada (www.priv.gc.ca) ou de l'organisme de votre province.

## 7. Incidents de confidentialité

Nous tenons un registre des incidents. En cas de risque de préjudice sérieux, nous
avisons la Commission d'accès à l'information et les personnes concernées.

## 8. Enfants

Vocourse n'est pas destinée aux personnes de moins de 14 ans.

## 9. Modifications

Toute modification importante sera annoncée dans l'appli et nécessitera, au besoin, un
nouveau consentement. Version en vigueur : 2026-10.
