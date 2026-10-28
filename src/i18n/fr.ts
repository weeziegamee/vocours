/**
 * Français canadien. Vouvoiement par défaut, tutoiement si l'aidant l'a choisi.
 * Typographie : espace insécable avant « ? », « ! », « : » et « % » ; apostrophe courbe.
 */

import type { BackendErrorKind, BasketTier, ConfirmedItem, DomainUnit, Province, VoiceRegister } from '../types/vocourse';
import type { ChangeKey, Strings } from './types';

const NBSP = ' ';

const UNIT: Readonly<Record<DomainUnit, readonly [string, string]>> = {
  unit: ['', ''],
  carton: ['carton', 'cartons'],
  bag: ['sac', 'sacs'],
  can: ['boîte', 'boîtes'],
  box: ['boîte', 'boîtes'],
  jar: ['pot', 'pots'],
  bottle: ['bouteille', 'bouteilles'],
  package: ['paquet', 'paquets'],
  dozen: ['douzaine', 'douzaines'],
  case: ['caisse', 'caisses'],
  bunch: ['botte', 'bottes'],
  head: ['tête', 'têtes'],
  g: ['gramme', 'grammes'],
  kg: ['kilo', 'kilos'],
  lb: ['livre', 'livres'],
  mL: ['millilitre', 'millilitres'],
  L: ['litre', 'litres'],
};

const PROVINCE: Readonly<Record<Province, string>> = {
  AB: 'Alberta',
  BC: 'Colombie-Britannique',
  MB: 'Manitoba',
  NB: 'Nouveau-Brunswick',
  NL: 'Terre-Neuve-et-Labrador',
  NS: 'Nouvelle-Écosse',
  NT: 'Territoires du Nord-Ouest',
  NU: 'Nunavut',
  ON: 'Ontario',
  PE: 'Île-du-Prince-Édouard',
  QC: 'Québec',
  SK: 'Saskatchewan',
  YT: 'Yukon',
};

const TIER: Readonly<Record<BasketTier, string>> = {
  economy: 'Économique',
  balanced: 'Équilibré',
  premium_organic: 'Bio',
};

const quantity = (q: number): string => (Number.isInteger(q) ? String(q) : String(q).replace('.', ','));

const quantityWithUnit = (q: number, unit: DomainUnit): string => {
  const [one, many] = UNIT[unit];
  const word = q > 1 ? many : one;
  return word === '' ? quantity(q) : `${quantity(q)} ${word}`;
};

/** « Lait 2 %, 2 L » → « lait 2 % » : le format est déjà sur la carte. */
const shortName = (label: string): string => (label.split(',')[0] ?? label).trim().toLocaleLowerCase('fr-CA');

/** Élision devant voyelle et h muet (« d’huile ») ; pas devant h aspiré (« de haricots »). */
const de = (word: string): string => (/^([aeiouyàâäéèêëîïôöùûüœæ]|h(uile|erbe|uître|aricot vert))/iu.test(word) ? 'd’' : 'de ');

const itemSpoken = (item: ConfirmedItem): string => {
  const product = shortName(item.productLabel);
  const [one] = UNIT[item.unit];
  if (one === '') return `${quantity(item.quantity)} ${product}`;
  return `${quantityWithUnit(item.quantity, item.unit)} ${de(product)}${product}`;
};

const joinAnd = (parts: readonly string[]): string =>
  parts.length <= 1 ? (parts[0] ?? '') : `${parts.slice(0, -1).join(', ')} et ${parts[parts.length - 1]}`;

const countProducts = (n: number): string => `${n} produit${n > 1 ? 's' : ''}`;

const CHANGE: Readonly<Record<Exclude<ChangeKey, 'register'>, string>> = {
  seniorFirstName: 'votre prénom',
  caregiverFirstName: 'le prénom de l’aidant',
  caregiverMobile: 'le numéro de l’aidant',
  address: 'l’adresse de livraison',
  preferredRetailer: 'l’épicerie préférée',
  language: 'la langue',
  regionalDictionary: 'les expressions québécoises',
};

export const fr = (register: VoiceRegister): Strings => {
  const v = (vous: string, tu: string): string => (register === 'tu' ? tu : vous);
  const your = v('votre', 'ton');
  const Your = v('Votre', 'Ton');
  const yourList = v('votre liste', 'ta liste');
  const YourList = v('Votre liste', 'Ta liste');
  const you = v('vous', 'te');

  const tierPhrase = (t: BasketTier): string => `le panier ${TIER[t]}`;
  const tierDescription = (t: BasketTier, store: string | null): string =>
    t === 'economy'
      ? store
        ? `Marque maison de ${store}, quand elle existe.`
        : 'Marques maison, quand l’épicerie en propose.'
      : t === 'balanced'
        ? 'Marques courantes.'
        : 'Produits biologiques, quand ils existent.';

  return {
    locale: 'fr-CA',

    common: {
      back: 'Retour',
      close: 'Fermer',
      cancel: 'Annuler',
      save: 'Enregistrer',
      saving: 'Enregistrement…',
      retry: 'Réessayer',
      repeat: 'Répète',
      repeatHint: 'Relit la dernière phrase',
      yes: 'Oui',
      no: 'Non',
      continue: 'Continuer',
      optional: 'facultatif',
      errorPrefix: 'À corriger',
      ofN: (i, n) => `${i} sur ${n}`,
    },

    format: {
      quantity,
      quantityWithUnit,
      itemSpoken,
      countProducts,
      tierLabel: (t) => TIER[t],
      tierPhrase,
      tierDescription,
      province: (p) => PROVINCE[p],
      joinAnd,
      countdown: (ms) => {
        const total = Math.max(0, Math.ceil(ms / 1000));
        const m = Math.floor(total / 60);
        const s = total % 60;
        const minutes = Math.max(1, Math.ceil(total / 60));
        return { visual: `${m}${NBSP}min ${s.toString().padStart(2, '0')}${NBSP}s`, spoken: `environ ${minutes} minute${minutes > 1 ? 's' : ''}` };
      },
      shortName,
    },

    voice: {
      welcome: (name) =>
        `Bonjour${name ? ` ${name}` : ''}. ` +
        v('Appuyez sur le gros bouton vert et dites-moi ce dont vous avez besoin.', 'Appuie sur le gros bouton vert et dis-moi ce dont tu as besoin.'),
      noting: 'Je note…',
      noted: (items) => (items.length === 0 ? '' : `J’ai noté : ${joinAnd(items.map(itemSpoken))}.`),
      doubtResolved: (label) => `${label.split(',')[0] ?? label}, c’est noté.`,
      redictate: v('D’accord. Redites-moi seulement ce produit.', 'D’accord. Redis-moi seulement ce produit.'),
      removed: (label) => `J’ai retiré ${shortName(label)}.`,
      restored: (label) => `${label.split(',')[0] ?? label} est de retour dans la liste.`,
      quantityChanged: (item) => `C’est noté : ${itemSpoken(item)}.`,
      listReady: `${YourList} est prête. Je prépare ${your} panier.`,
      nothingHeard: v(
        'Je n’ai pas bien entendu. Approchez le téléphone et redites-moi doucement.',
        'Je n’ai pas bien entendu. Approche le téléphone et redis-moi doucement.',
      ),
      micPermission: v(
        'J’ai besoin du micro pour vous écouter. Votre proche peut l’autoriser dans les réglages du téléphone.',
        'J’ai besoin du micro pour t’écouter. Ton proche peut l’autoriser dans les réglages du téléphone.',
      ),
      needsNetwork: v(
        'Internet est coupé et ce téléphone ne peut pas m’écouter sans lui. Réessayez quand Internet revient.',
        'Internet est coupé et ce téléphone ne peut pas m’écouter sans lui. Réessaie quand Internet revient.',
      ),
      cloudNotAllowed: v(
        'Ce téléphone ne sait pas reconnaître la voix tout seul. Votre proche peut l’autoriser dans l’espace aidant.',
        'Ce téléphone ne sait pas reconnaître la voix tout seul. Ton proche peut l’autoriser dans l’espace aidant.',
      ),
      speechUnavailable: v(
        'Je n’arrive pas à utiliser le micro pour l’instant. Réessayez dans un moment.',
        'Je n’arrive pas à utiliser le micro pour l’instant. Réessaie dans un moment.',
      ),
      offlineListening: v('Internet est coupé, mais je vous écoute quand même. Je garde tout.', 'Internet est coupé, mais je t’écoute quand même. Je garde tout.'),
      offlineSaved: 'J’ai bien tout enregistré. Je l’écrirai dès qu’Internet revient.',
      queueFull: v(
        'J’ai déjà beaucoup de messages en attente. Attendons qu’Internet revienne avant d’en ajouter.',
        'J’ai déjà beaucoup de messages en attente. Attendons qu’Internet revienne avant d’en ajouter.',
      ),
      backOnline: `Internet est revenu. J’écris ${yourList}.`,
      interpretFailed: 'Je n’ai pas réussi à écrire ce message. Il est gardé, je réessaierai tout seul.',
      interpretDropped: v(
        'Je n’ai pas pu écrire un de vos messages. Pouvez-vous me le redire ?',
        'Je n’ai pas pu écrire un de tes messages. Peux-tu me le redire ?',
      ),
      newList: v('Nouvelle liste. Dites-moi ce dont vous avez besoin.', 'Nouvelle liste. Dis-moi ce dont tu as besoin.'),
      settingsChanged: (caregiver, changes) => {
        if (changes.length === 0) return '';
        const words = changes.map((c) => (c === 'register' ? v('la façon de vous parler', 'la façon de te parler') : CHANGE[c]));
        return `${caregiver} a changé ${joinAnd(words)}. ${v('Vous pouvez lui en parler.', 'Tu peux lui en parler.')}`;
      },
      notUnderstood: v('Je n’ai pas compris. Vous pouvez aussi toucher les boutons.', 'Je n’ai pas compris. Tu peux aussi toucher les boutons.'),
    },

    home: {
      brand: 'Vocourse',
      greeting: (hour, name, hasItems) => ({
        title: `${hour >= 18 || hour < 4 ? 'Bonsoir' : 'Bonjour'}${name ? ` ${name}` : ''}${NBSP}!`,
        subtitle: hasItems
          ? `Autre chose pour ${your} épicerie${NBSP}?`
          : v(`Que souhaitez-vous ajouter à votre épicerie aujourd’hui${NBSP}?`, `Qu’est-ce que tu veux ajouter à ton épicerie aujourd’hui${NBSP}?`),
      }),
      caregiverButton: 'Aidant',
      caregiverA11y: 'Espace aidant',
      caregiverHint: v('Réservé à votre proche. Un code est demandé.', 'Réservé à ton proche. Un code est demandé.'),
      myList: (n) => `Ma liste (${countProducts(n)})`,
      exampleTitle: 'Dites par exemple :',
      example: '« Deux cartons de lait et une douzaine d’œufs »',
      severalTimes: v('Vous pouvez parler en plusieurs fois.', 'Tu peux parler en plusieurs fois.'),
      removedBanner: (label) => `${label.split(',')[0] ?? label} retiré.`,
      undo: 'Annuler',
      undoA11y: (label) => `Annuler le retrait de ${label.split(',')[0] ?? label}`,
      undoHint: 'Remet le produit dans la liste',
      micSpeak: 'Parler',
      micStop: 'Arrêter l’écoute',
      micCompactHint: 'Remonte en haut de l’écran, près du grand micro',
      validate: 'C’est bon',
      validateHintDoubt: v('Répondez d’abord à la question sur un produit', 'Réponds d’abord à la question sur un produit'),
      validateHintEmpty: 'Dites d’abord au moins un produit',
      validateHintReady: 'Je prépare le panier à envoyer',
      noPricesNote: (caregiver) =>
        `Pas de prix ici : ${caregiver ?? v('votre proche', 'ton proche')} verra le montant exact sur Instacart avant de payer.`,
      status: {
        listening: 'Écoute en cours…',
        listeningDetail: (offline) =>
          offline
            ? v('Hors ligne, mais je vous écoute. Je garde tout.', 'Hors ligne, mais je t’écoute. Je garde tout.')
            : v('Parlez normalement. Touchez le micro quand vous avez fini.', 'Parle normalement. Touche le micro quand tu as fini.'),
        processing: 'Je note…',
        processingDetail: 'Un petit instant.',
        added: (n) => (n === 1 ? 'Produit ajouté !' : `${n} produits ajoutés !`),
        doubt: 'Une petite question',
        doubtDetail: v('Touchez la bonne carte ci-dessous, ou dites-la.', 'Touche la bonne carte ci-dessous, ou dis-la.'),
        offline: 'Hors ligne',
        offlineDetail: v('Vous pouvez parler quand même : je garde tout.', 'Tu peux parler quand même : je garde tout.'),
        queued: (n) => `${n} message${n > 1 ? 's' : ''} en attente. Rien n’est perdu.`,
        writing: v('J’écris vos messages', 'J’écris tes messages'),
        idle: 'En attente',
        idleEmpty: v('Touchez le micro et dites ce qu’il vous faut.', 'Touche le micro et dis ce qu’il te faut.'),
        idleMore: v('Touchez le micro pour ajouter autre chose.', 'Touche le micro pour ajouter autre chose.'),
      },
      mic: {
        idle: { label: 'Parler', hint: `Démarre l’écoute de ${yourList}` },
        listening: { label: 'Arrêter l’écoute', hint: 'J’écris ce que j’ai entendu' },
        offline_recording: { label: 'Arrêter l’écoute', hint: 'Je garde ce que j’ai entendu' },
        processing: { label: 'Je note', hint: 'Un petit instant' },
      },
    },

    item: {
      less: (name) => `Un de moins : ${name}`,
      more: (name) => `Un de plus : ${name}`,
      minHint: v('Quantité minimale. Pour enlever ce produit, touchez Retirer.', 'Quantité minimale. Pour enlever ce produit, touche Retirer.'),
      maxHint: (max) => `Quantité maximale : ${max}.`,
      currentHint: (q) => `Quantité actuelle : ${q}`,
      remove: '✕ Retirer',
      removeA11y: (name) => `Retirer ${name}`,
      removeHint: v('Vous pourrez annuler pendant 10 secondes', 'Tu pourras annuler pendant 10 secondes'),
    },

    doubt: {
      choiceA11y: (rank, count, label) => `Choix ${rank} sur ${count} : ${label}`,
      choiceHint: 'Ajoute ce produit à la liste',
      none: 'Aucun, je répète',
      noneHint: 'Relance l’écoute pour ce produit seulement',
      speakHint: v('Ou dites « le premier », « le deuxième »…', 'Ou dis « le premier », « le deuxième »…'),
    },

    preparing: {
      title: `Je prépare ${your} panier…`,
      subtitle: 'Trois choix arrivent : économique, équilibré ou bio.',
    },

    basket: {
      title: 'Mon panier',
      backHint: `Revient à ${yourList}`,
      preferredStore: (store, caregiver) => `Épicerie préférée : ${store}. ${caregiver} choisira le magasin sur Instacart.`,
      noPrices: (caregiver) => `Vocourse n’affiche pas de prix : ${caregiver} verra le montant exact sur Instacart avant de payer.`,
      choiceGroup: 'Choix du panier',
      tierA11y: (i, n, t, d, selected) => `Panier ${TIER[t]}, ${i} sur ${n}. ${d}${selected ? ' Sélectionné.' : ''}`,
      tierHint: 'Choisit ce panier',
      selected: '✓ Choisi',
      continueWith: (t) => `Continuer avec le panier ${TIER[t]}`,
      chooseFirst: v('Choisissez un panier', 'Choisis un panier'),
      continueHint: `Je ${you} relis le panier avant de l’envoyer`,
      readbackTitle: 'Récapitulatif',
      stopReading: 'Arrêter la lecture',
      stopReadingHint: 'Arrête la relecture et revient au choix du panier',
      change: 'Non, changer',
      changeHint: 'Revient au choix du panier',
      confirmYes: 'Oui, c’est ça',
      confirmYesHint: 'Première confirmation du panier',
      order: 'Je commande',
      orderSub: (c) => `${c} finalisera le paiement`,
      orderHint: v(
        'Gardez le doigt deux secondes pour envoyer votre panier. Avec un lecteur d’écran, touchez deux fois.',
        'Garde le doigt deux secondes pour envoyer ton panier. Avec un lecteur d’écran, touche deux fois.',
      ),
      cancelOrder: 'Annuler',
      cancelOrderHint: 'N’envoie rien et revient au choix du panier',
      sendingLabel: (c) => `J’envoie ${your} panier à ${c}…`,
      backToList: 'Retour à ma liste',
      backToListHint: `${Your} panier reste gardé`,
      keptHint: `${Your} panier reste gardé`,
      retryHint: 'Renvoie le même panier, sans doublon',
      sentTitle: 'C’est noté',
      speak: 'Parler',
      speakHint: v('Répondez à voix haute : « oui », « non », « répète »…', 'Réponds à voix haute : « oui », « non », « répète »…'),
      listening: v('Je vous écoute…', 'Je t’écoute…'),
      why: 'Pourquoi pas de prix ?',
      whyHint: 'Explique qui voit le montant',
      v: {
        announce: (c, store) =>
          `J’ai préparé trois paniers. Économique : ${tierDescription('economy', store)} Équilibré : marques courantes. Bio : produits biologiques. ` +
          `${c} verra les prix exacts sur Instacart. Lequel ${v('voulez-vous', 'veux-tu')} ?`,
        tierSelected: (t, store) => `${TIER[t]} : ${tierDescription(t, store)}`,
        readback: (t, items, c, store) =>
          `${v('Vous choisissez', 'Tu choisis')} ${tierPhrase(t)}, ${countProducts(items.length)} : ${joinAnd(items.map(itemSpoken))}. ` +
          `${c} choisira le magasin${store ? `, de préférence ${store},` : ''} et verra le prix exact avant de payer sur Instacart. C’est bien ça ?`,
        armLongPress: v(
          'Pour confirmer, gardez le doigt sur le bouton vert « Je commande » pendant deux secondes. Ou dites : oui, je commande.',
          'Pour confirmer, garde le doigt sur le bouton vert « Je commande » pendant deux secondes. Ou dis : oui, je commande.',
        ),
        holdReleasedTooEarly: v(
          'Vous avez lâché un peu tôt. Rien n’est envoyé. Recommencez quand vous voulez.',
          'Tu as lâché un peu tôt. Rien n’est envoyé. Recommence quand tu veux.',
        ),
        sending: (c) => `J’envoie ${your} panier à ${c}.`,
        sent: (c) => `C’est noté. ${c} a reçu ${your} panier par texto et va choisir le magasin pour passer la commande.`,
        sentPending: (c) => `${Your} panier est bien gardé. Je n’ai pas encore pu prévenir ${c}. Je réessaie pour ${v('vous', 'toi')}.`,
        sentOptedOut: (c) =>
          `${Your} panier est gardé, mais ${c} a demandé à ne plus recevoir les textos de Vocourse. ${v('Parlez-lui-en', 'Parle-lui-en')} : il peut répondre START pour les réactiver.`,
        cancelled: v('D’accord, je n’envoie rien. Vous pouvez choisir un autre panier.', 'D’accord, je n’envoie rien. Tu peux choisir un autre panier.'),
        whyNoPrice: (c) =>
          `Les prix changent d’un magasin à l’autre. ${c} choisit le magasin sur Instacart et voit le montant exact, taxes comprises, avant de payer.`,
        failure: (kind: BackendErrorKind, code, c) => {
          if (code === 'caregiver_unverified') return `Le numéro de ${c} doit d’abord être confirmé dans l’espace aidant. ${Your} panier est gardé.`;
          if (code === 'caregiver_opted_out') return `${c} ne reçoit plus les textos de Vocourse. ${Your} panier est gardé.`;
          if (code === 'setup_incomplete') return `L’espace aidant n’est pas encore rempli. ${Your} panier est gardé.`;
          switch (kind) {
            case 'offline':
              return `Internet est coupé. ${Your} panier est gardé. On réessaie dès qu’Internet revient.`;
            case 'timeout':
            case 'server':
            case 'rate_limited':
              return `Le service met du temps à répondre. ${Your} panier est gardé. On peut réessayer dans un instant.`;
            case 'conflict':
            case 'rejected':
            case 'bad_response':
              return `Je n’ai pas pu envoyer ce panier. Il est gardé, et ${c} pourra regarder avec ${v('vous', 'toi')}.`;
            case 'unauthorized':
              return `Je dois vérifier ce téléphone. ${Your} panier est gardé ; ${c} pourra le reconfigurer.`;
          }
        },
      },
    },

    longPress: {
      hold: 'Gardez le doigt 2 secondes',
      holding: 'Continuez d’appuyer…',
      unavailable: 'Pas encore disponible',
    },

    pin: {
      title: 'Espace aidant',
      blocked: 'Accès bloqué pour le moment',
      choose: 'Choisissez un code à 6 chiffres',
      confirm: 'Confirmez le code',
      checking: 'Vérification…',
      enter: 'Saisissez le code de l’aidant',
      newCodeIntro: 'Choisissez un nouveau code à 6 chiffres.',
      firstAccessIntro: 'Premier accès : choisissez un code à 6 chiffres.',
      noCodeUseForgot: 'Aucun code n’est enregistré sur ce téléphone. Touchez « Code oublié ? » : un texto sera envoyé au cellulaire de l’aidant.',
      sameAgain: 'Saisissez le même code une seconde fois.',
      mismatch: 'Les deux codes sont différents. Recommencez depuis le début.',
      wrong: (left) => `Code incorrect. Il reste ${left} essai${left > 1 ? 's' : ''}.`,
      lockedAnnounce: 'Trop de codes erronés. L’espace aidant est bloqué pendant 15 minutes.',
      lockedBanner: '⚠ Trop de codes erronés. L’aidant principal a été prévenu par texto.',
      retryIn: (t) => `Réessayez dans ${t}`,
      lockedA11y: (s) => `Trop de codes erronés. L’aidant principal a été prévenu. Réessayez dans ${s}.`,
      unlockedAgain: 'Vous pouvez de nouveau saisir le code.',
      codeOk: 'Code correct.',
      codeSaved: 'Code enregistré.',
      digitEntered: (n, total) => `Chiffre saisi, ${n} sur ${total}`,
      digitEnteredLast: 'Chiffre saisi. Vérification.',
      digitErased: (n, total) => `Chiffre effacé, ${n} sur ${total}`,
      digitsA11y: (n, total) => `${n} chiffre${n > 1 ? 's' : ''} saisi${n > 1 ? 's' : ''} sur ${total}`,
      erase: 'Effacer',
      cancelHint: 'Ferme l’espace aidant sans rien changer',
      eraseHint: 'Efface le dernier chiffre saisi',
      forgot: 'Code oublié ?',
      forgotHint: 'Un code de vérification est envoyé par texto au cellulaire de l’aidant',
      weakness: (w) =>
        ({
          length: 'Le code doit compter exactement 6 chiffres.',
          same_digit: 'Ce code répète le même chiffre. Choisissez-en un plus difficile à deviner.',
          sequence: 'Ce code est une suite de chiffres. Choisissez-en un plus difficile à deviner.',
          repeated_block: 'Ce code répète un motif. Choisissez-en un plus difficile à deviner.',
          common: 'Ce code est trop courant. Choisissez-en un plus difficile à deviner.',
        })[w],
    },

    verify: {
      titleMobile: 'Confirmer le cellulaire de l’aidant',
      titlePin: 'Code oublié',
      sending: 'Envoi du code par texto…',
      sent: (to) => `Un code à 6 chiffres a été envoyé par texto au ${to}. Il est valide 10 minutes.`,
      codeLabel: 'Code reçu par texto',
      codeHint: '6 chiffres',
      submit: 'Valider le code',
      checking: 'Vérification…',
      resend: 'Renvoyer un code',
      invalid: (left) => (left > 0 ? `Code incorrect. Il reste ${left} essai${left > 1 ? 's' : ''}.` : 'Code incorrect. Demandez un nouveau code.'),
      expired: 'Ce code a expiré. Demandez-en un nouveau.',
      sendFailed: 'Le texto n’a pas pu être envoyé. Vérifiez le numéro dans les réglages, puis réessayez.',
      optedOut: 'Ce numéro a refusé les textos de Vocourse. Répondez START à un ancien message de Vocourse pour les réactiver.',
      offline: 'Pas d’Internet : impossible d’envoyer le code pour l’instant.',
      rateLimited: 'Trop de codes demandés. Réessayez dans une heure.',
      verified: 'Numéro confirmé.',
      later: 'Plus tard',
      laterHint: 'Les paniers ne pourront pas être envoyés tant que le numéro n’est pas confirmé',
    },

    onboarding: {
      welcomeTitle: 'Bienvenue dans Vocourse',
      welcomeBody:
        'Vocourse permet à votre proche de dicter sa liste d’épicerie. Vous la recevez par texto, avec un lien Instacart pour choisir le magasin et payer.',
      whoSetsUp: 'Cette configuration est faite par l’aidant (environ 5 minutes).',
      privacyTitle: 'Vos renseignements personnels',
      privacyPoints: [
        'La voix est reconnue sur le téléphone : l’enregistrement audio n’est jamais envoyé à Vocourse.',
        'Le texte de la liste est analysé par le serveur de Vocourse, hébergé au Canada.',
        'Les listes envoyées sont conservées 12 mois au plus, puis supprimées.',
        'Aucune publicité, aucune revente de données. Vous pouvez exporter ou supprimer toutes les données dans l’espace aidant.',
      ],
      privacyLink: 'Lire la politique de confidentialité',
      privacyLinkHint: 'Ouvre la politique complète dans le navigateur',
      cloudSpeechLabel: 'Autoriser la reconnaissance vocale en ligne si nécessaire',
      cloudSpeechDescription: (p) =>
        p === 'ios'
          ? 'Si cet iPhone ne peut pas reconnaître le français ou l’anglais sur l’appareil, l’audio est envoyé au service de reconnaissance d’Apple. Sans cette autorisation, la dictée ne fonctionnera pas sur ce téléphone.'
          : 'Si ce téléphone ne peut pas reconnaître la voix sur l’appareil, l’audio est envoyé au service de reconnaissance de Google. Sans cette autorisation, la dictée ne fonctionnera pas sur ce téléphone.',
      acceptLabel: 'J’ai lu la politique de confidentialité et j’accepte',
      acceptDescription: 'Ce consentement peut être retiré en supprimant le compte, dans l’espace aidant.',
      accept: 'Accepter et continuer',
      acceptRequired: 'Cochez la case pour continuer.',
      registering: 'Création du compte…',
      needsInternet: 'Une connexion Internet est nécessaire pour la configuration.',
      registerFailed: 'La création du compte n’a pas abouti. Réessayez dans un instant.',
      stepPin: 'Étape 1 sur 3 : le code de l’aidant',
      stepSettings: 'Étape 2 sur 3 : les réglages',
      stepVerify: 'Étape 3 sur 3 : confirmer le cellulaire',
      done: 'Tout est prêt',
      doneBody: (senior) =>
        `${senior ? `${senior} peut` : 'Votre proche peut'} maintenant toucher le gros bouton vert et dicter sa liste. L’espace aidant reste accessible par le bouton « Aidant » en haut de l’écran.`,
      start: 'Commencer',
      sessionLost: 'Ce téléphone doit être reconfiguré',
      sessionLostBody: 'Le compte Vocourse de ce téléphone n’est plus reconnu (il a peut-être été supprimé). L’aidant doit refaire la configuration.',
      restart: 'Refaire la configuration',
    },

    settings: {
      title: 'Réglages de l’aidant',
      setupTitle: 'Réglages',
      sectionSenior: 'La personne aidée',
      sectionCaregiver: 'L’aidant',
      sectionAddress: 'Adresse de livraison',
      sectionStore: 'Épicerie préférée',
      sectionVoice: 'Langue et voix',
      sectionSecurity: 'Sécurité',
      sectionPrivacy: 'Confidentialité',
      fields: {
        seniorFirstName: 'Prénom de la personne aidée',
        caregiverFirstName: 'Prénom de l’aidant',
        caregiverMobile: 'Cellulaire de l’aidant',
        smsConsent: 'Consentement aux textos',
        civicNumber: 'Numéro civique',
        street: 'Rue',
        apartment: 'Appartement',
        city: 'Ville',
        postalCode: 'Code postal',
        preferredRetailer: 'Épicerie préférée',
        language: 'Langue de l’application',
        register: 'Façon de parler à votre proche',
        regionalDictionary: 'Expressions québécoises',
      },
      hints: {
        seniorFirstName: 'Utilisé pour la salutation et dans les textos (« Jeanne vous envoie sa liste »).',
        caregiverFirstName: 'Prononcé par l’application : « Paul a reçu votre panier ».',
        caregiverMobile: 'Reçoit le lien de la liste Instacart et les alertes. Aucun nom de produit dans les textos.',
        street: 'Par exemple : rue Saint-Denis',
        postalCode: 'Format A1A 1A1',
      },
      smsConsentLabel: 'J’accepte de recevoir les textos de Vocourse',
      smsConsentDescription: 'Listes à finaliser, codes de vérification et alertes. Répondez STOP à tout moment pour arrêter.',
      provinceLine: (p) => (p ? `Province ou territoire : ${p}` : 'Province ou territoire : déduit du code postal'),
      errors: {
        firstName: 'Indiquez un prénom (lettres, trait d’union ou apostrophe).',
        seniorFirstName: 'Le prénom ne peut contenir que des lettres, un trait d’union ou une apostrophe.',
        mobile: 'Indiquez un numéro à 10 chiffres, par exemple 514 555-0123.',
        smsConsent: 'Ce consentement est nécessaire pour vous envoyer les listes par texto.',
        civicNumber: 'Indiquez le numéro civique, par exemple 1234 ou 12B.',
        street: 'Indiquez la rue, par exemple rue Saint-Denis.',
        apartment: 'L’appartement compte au plus 10 lettres ou chiffres.',
        city: 'Indiquez la ville.',
        postalFormat: 'Indiquez un code postal canadien au format A1A 1A1.',
        preferredRetailer: 'Choisissez une épicerie, ou « Pas de préférence ».',
      },
      retailersLoading: 'Recherche des épiceries Instacart près de l’adresse…',
      retailersFailed: 'La liste des épiceries n’a pas pu être chargée. Vous pourrez la choisir plus tard.',
      retailersNone: 'Aucune épicerie Instacart trouvée pour ce code postal.',
      retailersNeedAddress: 'Enregistrez d’abord l’adresse : les épiceries proches apparaîtront ici.',
      noPreference: 'Pas de préférence',
      storeNote: 'Le magasin est choisi par l’aidant sur Instacart ; cette préférence lui est rappelée dans le texto.',
      languages: { 'fr-CA': 'Français', 'en-CA': 'English' },
      registerVous: 'Vouvoiement',
      registerVousHint: '« Dites-moi ce dont vous avez besoin. »',
      registerTu: 'Tutoiement',
      registerTuHint: '« Dis-moi ce dont tu as besoin. »',
      registerGroup: 'Façon de parler à votre proche',
      regionalDescription: 'Comprend « des bines », « de la liqueur », « une pinte de lait »… À désactiver pour une personne qui ne parle pas le français québécois.',
      changePin: 'Changer le code de l’aidant',
      changePinHint: 'Choisir un nouveau code à 6 chiffres',
      mobileVerified: '✓ Cellulaire confirmé',
      mobileUnverified: '⚠ Cellulaire à confirmer : les listes ne peuvent pas être envoyées.',
      mobileOptedOut: '⚠ Ce numéro a répondu STOP : les textos sont bloqués. Répondez START pour les réactiver.',
      verifyNow: 'Confirmer le cellulaire',
      privacyPolicy: 'Politique de confidentialité',
      exportData: 'Exporter mes données',
      exportHint: 'Prépare un fichier de toutes les données du compte, à partager ou à garder',
      exportFailed: 'L’export n’a pas pu être préparé. Vérifiez la connexion et réessayez.',
      deleteAccount: 'Supprimer le compte et les données',
      deleteHint: 'Supprime définitivement le compte, les réglages et l’historique',
      deleteTitle: 'Supprimer définitivement ?',
      deleteBody: 'Le compte, les réglages, les listes envoyées et le code de l’aidant seront effacés. Cette action est irréversible.',
      deleteConfirm: 'Supprimer',
      deleteFailed: 'La suppression n’a pas abouti. Vérifiez la connexion et réessayez.',
      discardTitle: 'Fermer sans enregistrer ?',
      discardBody: 'Les modifications seront perdues.',
      keepEditing: 'Continuer à modifier',
      discard: 'Fermer sans enregistrer',
      saved: 'Réglages enregistrés. Votre proche en sera informé à voix haute.',
      savedShort: 'Réglages enregistrés.',
      saveOffline: 'Pas d’Internet : rien n’a été modifié. Réessayez une fois connecté.',
      saveFailed: 'Le service n’a pas pu enregistrer les réglages. Rien n’a été modifié. Réessayez dans un instant.',
      errorsCount: (n) => `⚠ ${n} champ${n > 1 ? 's' : ''} à corriger :`,
      errorsA11y: (n, fields) => `${n} champ${n > 1 ? 's' : ''} à corriger : ${fields.join(', ')}.`,
      closeHint: 'Revient à l’écran Ma liste',
      saveHint: 'Vérifie et enregistre les réglages',
      next: 'Enregistrer et continuer',
    },
  };
};

