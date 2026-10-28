/**
 * Canadian English. Spelling: colour, litre, centre; dates « October 28 ».
 */

import type { BackendErrorKind, BasketTier, ConfirmedItem, DomainUnit, Province } from '../types/vocourse';
import type { ChangeKey, Strings } from './types';

const UNIT: Readonly<Record<DomainUnit, readonly [string, string]>> = {
  unit: ['', ''],
  carton: ['carton', 'cartons'],
  bag: ['bag', 'bags'],
  can: ['can', 'cans'],
  box: ['box', 'boxes'],
  jar: ['jar', 'jars'],
  bottle: ['bottle', 'bottles'],
  package: ['pack', 'packs'],
  dozen: ['dozen', 'dozen'],
  case: ['case', 'cases'],
  bunch: ['bunch', 'bunches'],
  head: ['head', 'heads'],
  g: ['gram', 'grams'],
  kg: ['kilo', 'kilos'],
  lb: ['pound', 'pounds'],
  mL: ['millilitre', 'millilitres'],
  L: ['litre', 'litres'],
};

const PROVINCE: Readonly<Record<Province, string>> = {
  AB: 'Alberta',
  BC: 'British Columbia',
  MB: 'Manitoba',
  NB: 'New Brunswick',
  NL: 'Newfoundland and Labrador',
  NS: 'Nova Scotia',
  NT: 'Northwest Territories',
  NU: 'Nunavut',
  ON: 'Ontario',
  PE: 'Prince Edward Island',
  QC: 'Quebec',
  SK: 'Saskatchewan',
  YT: 'Yukon',
};

const TIER: Readonly<Record<BasketTier, string>> = {
  economy: 'Economy',
  balanced: 'Balanced',
  premium_organic: 'Organic',
};

const quantity = (q: number): string => String(q);

const quantityWithUnit = (q: number, unit: DomainUnit): string => {
  const [one, many] = UNIT[unit];
  const word = q > 1 ? many : one;
  return word === '' ? quantity(q) : `${quantity(q)} ${word}`;
};

const shortName = (label: string): string => (label.split(',')[0] ?? label).trim().toLowerCase();

const itemSpoken = (item: ConfirmedItem): string => {
  const product = shortName(item.productLabel);
  const [one] = UNIT[item.unit];
  if (one === '') return `${quantity(item.quantity)} ${product}`;
  return `${quantityWithUnit(item.quantity, item.unit)} of ${product}`;
};

const joinAnd = (parts: readonly string[]): string =>
  parts.length <= 1 ? (parts[0] ?? '') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;

const countProducts = (n: number): string => `${n} item${n > 1 ? 's' : ''}`;

const CHANGE: Readonly<Record<ChangeKey, string>> = {
  seniorFirstName: 'your first name',
  caregiverFirstName: 'the caregiver’s name',
  caregiverMobile: 'the caregiver’s number',
  address: 'the delivery address',
  preferredRetailer: 'the preferred store',
  language: 'the language',
  register: 'the way I speak to you',
  regionalDictionary: 'the Quebec expressions',
};

const tierPhrase = (t: BasketTier): string => `the ${TIER[t]} basket`;
const tierDescription = (t: BasketTier, store: string | null): string =>
  t === 'economy'
    ? store
      ? `${store}’s own brand, when available.`
      : 'Store brands, when available.'
    : t === 'balanced'
      ? 'Popular brands.'
      : 'Organic products, when available.';

export const en = (): Strings => ({
  locale: 'en-CA',

  common: {
    back: 'Back',
    close: 'Close',
    cancel: 'Cancel',
    save: 'Save',
    saving: 'Saving…',
    retry: 'Try again',
    repeat: 'Repeat',
    repeatHint: 'Reads the last sentence again',
    yes: 'Yes',
    no: 'No',
    continue: 'Continue',
    optional: 'optional',
    errorPrefix: 'To fix',
    ofN: (i, n) => `${i} of ${n}`,
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
      return { visual: `${m} min ${s.toString().padStart(2, '0')} s`, spoken: `about ${minutes} minute${minutes > 1 ? 's' : ''}` };
    },
    shortName,
  },

  voice: {
    welcome: (name) => `Hello${name ? ` ${name}` : ''}. Press the big green button and tell me what you need.`,
    noting: 'Writing it down…',
    noted: (items) => (items.length === 0 ? '' : `I wrote down: ${joinAnd(items.map(itemSpoken))}.`),
    doubtResolved: (label) => `${label.split(',')[0] ?? label}, got it.`,
    redictate: 'All right. Just say that one item again.',
    removed: (label) => `I removed ${shortName(label)}.`,
    restored: (label) => `${label.split(',')[0] ?? label} is back on the list.`,
    quantityChanged: (item) => `Got it: ${itemSpoken(item)}.`,
    listReady: 'Your list is ready. I’m preparing your basket.',
    nothingHeard: 'I didn’t quite hear that. Bring the phone a little closer and say it again slowly.',
    micPermission: 'I need the microphone to listen to you. Your caregiver can allow it in the phone settings.',
    needsNetwork: 'The Internet is down and this phone can’t listen without it. Try again when it’s back.',
    cloudNotAllowed: 'This phone can’t recognize speech on its own. Your caregiver can allow it in the caregiver area.',
    speechUnavailable: 'I can’t use the microphone right now. Please try again in a moment.',
    offlineListening: 'The Internet is down, but I’m still listening. I’ll keep everything.',
    offlineSaved: 'I saved everything. I’ll write it down as soon as the Internet is back.',
    queueFull: 'I already have many messages waiting. Let’s wait for the Internet before adding more.',
    backOnline: 'The Internet is back. I’m writing down your list.',
    interpretFailed: 'I couldn’t write down that message. It’s saved, and I’ll try again on my own.',
    interpretDropped: 'I couldn’t write down one of your messages. Could you say it again?',
    newList: 'New list. Tell me what you need.',
    settingsChanged: (caregiver, changes) =>
      changes.length === 0 ? '' : `${caregiver} changed ${joinAnd(changes.map((c) => CHANGE[c]))}. You can talk to them about it.`,
    notUnderstood: 'I didn’t understand. You can also tap the buttons.',
  },

  home: {
    brand: 'Vocourse',
    greeting: (hour, name, hasItems) => ({
      title: `${hour >= 18 || hour < 4 ? 'Good evening' : hour < 12 ? 'Good morning' : 'Good afternoon'}${name ? `, ${name}` : ''}!`,
      subtitle: hasItems ? 'Anything else for your groceries?' : 'What would you like to add to your groceries today?',
    }),
    caregiverButton: 'Caregiver',
    caregiverA11y: 'Caregiver area',
    caregiverHint: 'For your caregiver only. A code is required.',
    myList: (n) => `My list (${countProducts(n)})`,
    exampleTitle: 'For example, say:',
    example: '“Two cartons of milk and a dozen eggs”',
    severalTimes: 'You can speak a little at a time.',
    removedBanner: (label) => `${label.split(',')[0] ?? label} removed.`,
    undo: 'Undo',
    undoA11y: (label) => `Undo removing ${label.split(',')[0] ?? label}`,
    undoHint: 'Puts the item back on the list',
    micSpeak: 'Speak',
    micStop: 'Stop listening',
    micCompactHint: 'Scrolls back up to the big microphone',
    validate: 'That’s all',
    validateHintDoubt: 'First answer the question about an item',
    validateHintEmpty: 'First say at least one item',
    validateHintReady: 'I’ll prepare the basket to send',
    noPricesNote: (caregiver) => `No prices here: ${caregiver ?? 'your caregiver'} will see the exact amount on Instacart before paying.`,
    status: {
      listening: 'Listening…',
      listeningDetail: (offline) =>
        offline ? 'Offline, but I’m listening. I’ll keep everything.' : 'Speak normally. Tap the microphone when you’re done.',
      processing: 'Writing it down…',
      processingDetail: 'Just a moment.',
      added: (n) => (n === 1 ? 'Item added!' : `${n} items added!`),
      doubt: 'A quick question',
      doubtDetail: 'Tap the right card below, or say it.',
      offline: 'Offline',
      offlineDetail: 'You can still speak: I’ll keep everything.',
      queued: (n) => `${n} message${n > 1 ? 's' : ''} waiting. Nothing is lost.`,
      writing: 'Writing down your messages',
      idle: 'Ready',
      idleEmpty: 'Tap the microphone and say what you need.',
      idleMore: 'Tap the microphone to add something else.',
    },
    mic: {
      idle: { label: 'Speak', hint: 'Starts listening to your list' },
      listening: { label: 'Stop listening', hint: 'I’ll write down what I heard' },
      offline_recording: { label: 'Stop listening', hint: 'I’ll keep what I heard' },
      processing: { label: 'Writing it down', hint: 'Just a moment' },
    },
  },

  item: {
    less: (name) => `One less: ${name}`,
    more: (name) => `One more: ${name}`,
    minHint: 'Minimum quantity. To remove this item, tap Remove.',
    maxHint: (max) => `Maximum quantity: ${max}.`,
    currentHint: (q) => `Current quantity: ${q}`,
    remove: '✕ Remove',
    removeA11y: (name) => `Remove ${name}`,
    removeHint: 'You can undo for 10 seconds',
  },

  doubt: {
    choiceA11y: (rank, count, label) => `Choice ${rank} of ${count}: ${label}`,
    choiceHint: 'Adds this item to the list',
    none: 'None, I’ll say it again',
    noneHint: 'Listens again for this item only',
    speakHint: 'Or say “the first one”, “the second one”…',
  },

  preparing: {
    title: 'Preparing your basket…',
    subtitle: 'Three choices are coming: economy, balanced or organic.',
  },

  basket: {
    title: 'My basket',
    backHint: 'Goes back to your list',
    preferredStore: (store, caregiver) => `Preferred store: ${store}. ${caregiver} will pick the store on Instacart.`,
    noPrices: (caregiver) => `Vocourse doesn’t show prices: ${caregiver} will see the exact amount on Instacart before paying.`,
    choiceGroup: 'Basket choice',
    tierA11y: (i, n, t, d, selected) => `${TIER[t]} basket, ${i} of ${n}. ${d}${selected ? ' Selected.' : ''}`,
    tierHint: 'Chooses this basket',
    selected: '✓ Chosen',
    continueWith: (t) => `Continue with the ${TIER[t]} basket`,
    chooseFirst: 'Choose a basket',
    continueHint: 'I’ll read the basket back before sending it',
    readbackTitle: 'Summary',
    stopReading: 'Stop reading',
    stopReadingHint: 'Stops the summary and goes back to the basket choice',
    change: 'No, change it',
    changeHint: 'Goes back to the basket choice',
    confirmYes: 'Yes, that’s right',
    confirmYesHint: 'First confirmation of the basket',
    order: 'Place order',
    orderSub: (c) => `${c} will complete the payment`,
    orderHint: 'Hold your finger for two seconds to send your basket. With a screen reader, double-tap.',
    cancelOrder: 'Cancel',
    cancelOrderHint: 'Sends nothing and goes back to the basket choice',
    sendingLabel: (c) => `Sending your basket to ${c}…`,
    backToList: 'Back to my list',
    backToListHint: 'Your basket is kept',
    keptHint: 'Your basket is kept',
    retryHint: 'Sends the same basket again, without duplicates',
    sentTitle: 'All set',
    speak: 'Speak',
    speakHint: 'Answer out loud: “yes”, “no”, “repeat”…',
    listening: 'I’m listening…',
    why: 'Why no prices?',
    whyHint: 'Explains who sees the amount',
    v: {
      announce: (c, store) =>
        `I prepared three baskets. Economy: ${tierDescription('economy', store)} Balanced: popular brands. Organic: organic products. ` +
        `${c} will see the exact prices on Instacart. Which one would you like?`,
      tierSelected: (t, store) => `${TIER[t]}: ${tierDescription(t, store)}`,
      readback: (t, items, c, store) =>
        `You chose ${tierPhrase(t)}, ${countProducts(items.length)}: ${joinAnd(items.map(itemSpoken))}. ` +
        `${c} will pick the store${store ? `, preferably ${store},` : ''} and see the exact price before paying on Instacart. Is that right?`,
      armLongPress: 'To confirm, hold your finger on the green “Place order” button for two seconds. Or say: yes, place the order.',
      holdReleasedTooEarly: 'You let go a little early. Nothing was sent. Try again whenever you like.',
      sending: (c) => `I’m sending your basket to ${c}.`,
      sent: (c) => `All set. ${c} got your basket by text and will pick the store to place the order.`,
      sentPending: (c) => `Your basket is saved. I couldn’t reach ${c} yet. I’ll keep trying for you.`,
      sentOptedOut: (c) => `Your basket is saved, but ${c} asked to stop receiving Vocourse texts. Talk to them: they can reply START to turn them back on.`,
      cancelled: 'All right, nothing is sent. You can choose another basket.',
      whyNoPrice: (c) => `Prices vary from store to store. ${c} picks the store on Instacart and sees the exact amount, taxes included, before paying.`,
      failure: (kind: BackendErrorKind, code, c) => {
        if (code === 'caregiver_unverified') return `${c}’s number must first be confirmed in the caregiver area. Your basket is saved.`;
        if (code === 'caregiver_opted_out') return `${c} no longer receives Vocourse texts. Your basket is saved.`;
        if (code === 'setup_incomplete') return 'The caregiver area isn’t filled in yet. Your basket is saved.';
        switch (kind) {
          case 'offline':
            return 'The Internet is down. Your basket is saved. We’ll try again when it’s back.';
          case 'timeout':
          case 'server':
          case 'rate_limited':
            return 'The service is slow to answer. Your basket is saved. We can try again in a moment.';
          case 'conflict':
          case 'rejected':
          case 'bad_response':
            return `I couldn’t send this basket. It’s saved, and ${c} can look at it with you.`;
          case 'unauthorized':
            return `I need to check this phone. Your basket is saved; ${c} can set it up again.`;
        }
      },
    },
  },

  longPress: {
    hold: 'Hold for 2 seconds',
    holding: 'Keep holding…',
    unavailable: 'Not available yet',
  },

  pin: {
    title: 'Caregiver area',
    blocked: 'Access locked for now',
    choose: 'Choose a 6-digit code',
    confirm: 'Confirm the code',
    checking: 'Checking…',
    enter: 'Enter the caregiver code',
    newCodeIntro: 'Choose a new 6-digit code.',
    firstAccessIntro: 'First time: choose a 6-digit code.',
    noCodeUseForgot: 'No code is saved on this phone. Tap “Forgot code?”: a text will be sent to the caregiver’s cell phone.',
    sameAgain: 'Enter the same code a second time.',
    mismatch: 'The two codes are different. Start again.',
    wrong: (left) => `Wrong code. ${left} attempt${left > 1 ? 's' : ''} left.`,
    lockedAnnounce: 'Too many wrong codes. The caregiver area is locked for 15 minutes.',
    lockedBanner: '⚠ Too many wrong codes. The main caregiver was notified by text.',
    retryIn: (t) => `Try again in ${t}`,
    lockedA11y: (s) => `Too many wrong codes. The main caregiver was notified. Try again in ${s}.`,
    unlockedAgain: 'You can enter the code again.',
    codeOk: 'Code accepted.',
    codeSaved: 'Code saved.',
    digitEntered: (n, total) => `Digit entered, ${n} of ${total}`,
    digitEnteredLast: 'Digit entered. Checking.',
    digitErased: (n, total) => `Digit erased, ${n} of ${total}`,
    digitsA11y: (n, total) => `${n} digit${n > 1 ? 's' : ''} entered of ${total}`,
    erase: 'Erase',
    cancelHint: 'Closes the caregiver area without changing anything',
    eraseHint: 'Erases the last digit',
    forgot: 'Forgot the code?',
    forgotHint: 'A verification code is texted to the caregiver’s cell phone',
    weakness: (w) =>
      ({
        length: 'The code must have exactly 6 digits.',
        same_digit: 'This code repeats the same digit. Choose one that’s harder to guess.',
        sequence: 'This code is a sequence. Choose one that’s harder to guess.',
        repeated_block: 'This code repeats a pattern. Choose one that’s harder to guess.',
        common: 'This code is too common. Choose one that’s harder to guess.',
      })[w],
  },

  verify: {
    titleMobile: 'Confirm the caregiver’s cell phone',
    titlePin: 'Forgot the code',
    sending: 'Texting the code…',
    sent: (to) => `A 6-digit code was texted to ${to}. It’s valid for 10 minutes.`,
    codeLabel: 'Code received by text',
    codeHint: '6 digits',
    submit: 'Confirm code',
    checking: 'Checking…',
    resend: 'Send a new code',
    invalid: (left) => (left > 0 ? `Wrong code. ${left} attempt${left > 1 ? 's' : ''} left.` : 'Wrong code. Ask for a new one.'),
    expired: 'This code has expired. Ask for a new one.',
    sendFailed: 'The text couldn’t be sent. Check the number in the settings, then try again.',
    optedOut: 'This number turned off Vocourse texts. Reply START to an earlier Vocourse message to turn them back on.',
    offline: 'No Internet: the code can’t be sent right now.',
    rateLimited: 'Too many codes requested. Try again in an hour.',
    verified: 'Number confirmed.',
    later: 'Later',
    laterHint: 'Baskets can’t be sent until the number is confirmed',
  },

  onboarding: {
    welcomeTitle: 'Welcome to Vocourse',
    welcomeBody:
      'Vocourse lets your loved one dictate their grocery list. You receive it by text, with an Instacart link to pick the store and pay.',
    whoSetsUp: 'This setup is done by the caregiver (about 5 minutes).',
    privacyTitle: 'Your personal information',
    privacyPoints: [
      'Speech is recognized on the phone: the audio recording is never sent to Vocourse.',
      'The text of the list is analyzed by the Vocourse server, hosted in Canada.',
      'Lists that are sent are kept for 12 months at most, then deleted.',
      'No advertising, no data resale. You can export or delete all data in the caregiver area.',
    ],
    privacyLink: 'Read the privacy policy',
    privacyLinkHint: 'Opens the full policy in the browser',
    cloudSpeechLabel: 'Allow online speech recognition if needed',
    cloudSpeechDescription: (p) =>
      p === 'ios'
        ? 'If this iPhone can’t recognize English or French on the device, the audio is sent to Apple’s speech recognition service. Without this permission, dictation won’t work on this phone.'
        : 'If this phone can’t recognize speech on the device, the audio is sent to Google’s speech recognition service. Without this permission, dictation won’t work on this phone.',
    acceptLabel: 'I have read the privacy policy and I agree',
    acceptDescription: 'You can withdraw this consent by deleting the account, in the caregiver area.',
    accept: 'Agree and continue',
    acceptRequired: 'Check the box to continue.',
    registering: 'Creating the account…',
    needsInternet: 'An Internet connection is needed for setup.',
    registerFailed: 'The account couldn’t be created. Please try again in a moment.',
    stepPin: 'Step 1 of 3: caregiver code',
    stepSettings: 'Step 2 of 3: settings',
    stepVerify: 'Step 3 of 3: confirm the cell phone',
    done: 'All set',
    doneBody: (senior) =>
      `${senior ?? 'Your loved one'} can now tap the big green button and dictate their list. The caregiver area is still available with the “Caregiver” button at the top of the screen.`,
    start: 'Start',
    sessionLost: 'This phone needs to be set up again',
    sessionLostBody: 'This phone’s Vocourse account is no longer recognized (it may have been deleted). The caregiver needs to set it up again.',
    restart: 'Set up again',
  },

  settings: {
    title: 'Caregiver settings',
    setupTitle: 'Settings',
    sectionSenior: 'The person you help',
    sectionCaregiver: 'The caregiver',
    sectionAddress: 'Delivery address',
    sectionStore: 'Preferred store',
    sectionVoice: 'Language and voice',
    sectionSecurity: 'Security',
    sectionPrivacy: 'Privacy',
    fields: {
      seniorFirstName: 'First name of the person you help',
      caregiverFirstName: 'Caregiver’s first name',
      caregiverMobile: 'Caregiver’s cell phone',
      smsConsent: 'Consent to texts',
      civicNumber: 'Street number',
      street: 'Street',
      apartment: 'Apartment',
      city: 'City',
      postalCode: 'Postal code',
      preferredRetailer: 'Preferred store',
      language: 'App language',
      register: 'How to speak French to your loved one',
      regionalDictionary: 'Quebec French expressions',
    },
    hints: {
      seniorFirstName: 'Used in the greeting and in texts (“Jean sent you a list”).',
      caregiverFirstName: 'Spoken by the app: “Paul got your basket”.',
      caregiverMobile: 'Receives the Instacart list link and alerts. No product names in texts.',
      street: 'For example: Main Street',
      postalCode: 'Format A1A 1A1',
    },
    smsConsentLabel: 'I agree to receive texts from Vocourse',
    smsConsentDescription: 'Lists to complete, verification codes and alerts. Reply STOP at any time to opt out.',
    provinceLine: (p) => (p ? `Province or territory: ${p}` : 'Province or territory: based on the postal code'),
    errors: {
      firstName: 'Enter a first name (letters, hyphen or apostrophe).',
      seniorFirstName: 'The first name can only contain letters, a hyphen or an apostrophe.',
      mobile: 'Enter a 10-digit number, for example 416 555-0123.',
      smsConsent: 'This consent is needed to text you the lists.',
      civicNumber: 'Enter the street number, for example 1234 or 12B.',
      street: 'Enter the street, for example Main Street.',
      apartment: 'The apartment has 10 letters or digits at most.',
      city: 'Enter the city.',
      postalFormat: 'Enter a Canadian postal code in the format A1A 1A1.',
      preferredRetailer: 'Choose a store, or “No preference”.',
    },
    retailersLoading: 'Looking for Instacart stores near the address…',
    retailersFailed: 'The store list couldn’t be loaded. You can choose it later.',
    retailersNone: 'No Instacart store found for this postal code.',
    retailersNeedAddress: 'Save the address first: nearby stores will appear here.',
    noPreference: 'No preference',
    storeNote: 'The caregiver picks the store on Instacart; this preference is a reminder in the text.',
    languages: { 'fr-CA': 'Français', 'en-CA': 'English' },
    registerVous: 'Formal (vous)',
    registerVousHint: '“Dites-moi ce dont vous avez besoin.”',
    registerTu: 'Informal (tu)',
    registerTuHint: '“Dis-moi ce dont tu as besoin.”',
    registerGroup: 'How to speak French to your loved one',
    regionalDescription: 'Understands Quebec French words like “des bines” or “de la liqueur”. Used only when the app is in French.',
    changePin: 'Change the caregiver code',
    changePinHint: 'Choose a new 6-digit code',
    mobileVerified: '✓ Cell phone confirmed',
    mobileUnverified: '⚠ Cell phone to confirm: lists can’t be sent yet.',
    mobileOptedOut: '⚠ This number replied STOP: texts are blocked. Reply START to turn them back on.',
    verifyNow: 'Confirm the cell phone',
    privacyPolicy: 'Privacy policy',
    exportData: 'Export my data',
    exportHint: 'Prepares a file with all the account data, to share or keep',
    exportFailed: 'The export couldn’t be prepared. Check the connection and try again.',
    deleteAccount: 'Delete the account and data',
    deleteHint: 'Permanently deletes the account, settings and history',
    deleteTitle: 'Delete permanently?',
    deleteBody: 'The account, settings, sent lists and caregiver code will be erased. This can’t be undone.',
    deleteConfirm: 'Delete',
    deleteFailed: 'The deletion didn’t go through. Check the connection and try again.',
    discardTitle: 'Close without saving?',
    discardBody: 'Your changes will be lost.',
    keepEditing: 'Keep editing',
    discard: 'Close without saving',
    saved: 'Settings saved. Your loved one will be told out loud.',
    savedShort: 'Settings saved.',
    saveOffline: 'No Internet: nothing was changed. Try again once connected.',
    saveFailed: 'The service couldn’t save the settings. Nothing was changed. Please try again in a moment.',
    errorsCount: (n) => `⚠ ${n} field${n > 1 ? 's' : ''} to fix:`,
    errorsA11y: (n, fields) => `${n} field${n > 1 ? 's' : ''} to fix: ${fields.join(', ')}.`,
    closeHint: 'Goes back to My list',
    saveHint: 'Checks and saves the settings',
    next: 'Save and continue',
  },
});
