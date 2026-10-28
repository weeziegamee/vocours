/**
 * Dictée : micro → texte reconnu sur le téléphone → analyse par le serveur → produits.
 *
 * Hors ligne (reconnaissance sur l'appareil) : chaque prise est gardée, chiffrée, dans
 * une file persistante (30 au plus, 7 jours au plus), puis analysée au retour du réseau,
 * dans l'ordre, sans doublon (clé d'idempotence = identifiant de la prise).
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import type {
  AppLocale,
  IdempotencyKey,
  InterpretRequest,
  InterpretResponse,
  IsoDateTime,
  MicState,
  SecureStorePort,
  SpeechErrorReason,
  SpeechPort,
  UtteranceId,
  VoiceRegister,
} from '../types/vocourse';
import type { VocourseBackend } from '../services/api/vocourseBackend';
import type { Strings } from '../i18n';
import type { Speaker } from './useSpeaker';
import { QUEUE_MAX, loadQueue, pruneQueue, saveQueue, type QueuedUtterance } from '../services/storage/persistence';
import { nowIso } from '../utils/ids';

export interface DictationOptions {
  readonly speech: SpeechPort;
  readonly backend: Pick<VocourseBackend, 'interpretUtterance'>;
  readonly speaker: Speaker;
  readonly store: SecureStorePort;
  readonly isOnline: boolean;
  readonly locale: AppLocale;
  readonly register: VoiceRegister;
  /** Expressions québécoises, réglées par l'aidant. */
  readonly regionalDictionary: boolean;
  readonly strings: Strings;
  readonly onInterpreted: (response: InterpretResponse) => void;
  readonly onQueueChanged: (count: number) => void;
  /** Réponse à une question en cours (« le deuxième ») : vrai si elle a été traitée. */
  readonly interceptFinal?: (text: string) => boolean;
  /** Vrai pendant l'écran panier : la file attend pour ne pas modifier la liste relue. */
  readonly paused?: boolean;
}

export interface DictationApi {
  readonly micState: MicState;
  /** Transcription partielle de la prise en cours. */
  readonly partialText: string;
  onMicPress(): void;
  /** Relance l'écoute (après « Aucun, je répète »). */
  startListening(): void;
  /** Vide la file (réinitialisation du téléphone) et arrête l'écoute. */
  reset(): Promise<void>;
}

type Outcome = 'ok' | 'retry' | 'drop';

/** Délai avant de réessayer l'analyse d'une prise gardée en file. */
const RETRY_DELAY_MS = 15_000;

let utteranceSeq = 0;
const newUtteranceId = (): UtteranceId =>
  `utt_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}_${(utteranceSeq += 1)}` as UtteranceId;

const phraseFor = (S: Strings, reason: SpeechErrorReason): string => {
  switch (reason) {
    case 'permission_denied':
      return S.voice.micPermission;
    case 'no_speech':
      return S.voice.nothingHeard;
    case 'needs_network':
      return S.voice.needsNetwork;
    case 'cloud_not_allowed':
      return S.voice.cloudNotAllowed;
    case 'unavailable':
      return S.voice.speechUnavailable;
    case 'cancelled':
      return '';
  }
};

export const useDictation = (o: DictationOptions): DictationApi => {
  const [micState, setMicState] = useState<MicState>('idle');
  const [partialText, setPartialText] = useState('');
  const queue = useRef<QueuedUtterance[]>([]);
  const queueLoaded = useRef(false);
  const flushing = useRef(false);
  const wasOffline = useRef(!o.isOnline);
  /** Incrémenté pour relancer l'analyse de la file après un échec serveur. */
  const [retryTick, setRetryTick] = useState(0);

  // Dernières valeurs, lues par les rappels asynchrones.
  const latest = useRef(o);
  latest.current = o;

  const persistQueue = useCallback(() => {
    void saveQueue(latest.current.store, queue.current).catch(() => undefined);
    latest.current.onQueueChanged(queue.current.length);
  }, []);

  /* File gardée lors d'une session précédente. */
  useEffect(() => {
    let active = true;
    void loadQueue(o.store, new Date()).then((saved) => {
      if (!active) return;
      queue.current = pruneQueue([...saved, ...queue.current], new Date());
      queueLoaded.current = true;
      latest.current.onQueueChanged(queue.current.length);
      setRetryTick((t) => t + 1);
    });
    return () => {
      active = false;
    };
  }, [o.store]);

  /** Incrémenté par reset() : les analyses en cours d'une génération passée sont ignorées. */
  const generation = useRef(0);

  const interpret = useCallback(async (u: QueuedUtterance): Promise<Outcome> => {
    const { backend, locale, regionalDictionary, register } = latest.current;
    const gen = generation.current;
    const request: InterpretRequest = {
      utteranceId: u.utteranceId,
      transcript: u.transcript,
      locale,
      capturedAt: u.capturedAt,
      fromOfflineQueue: u.fromOfflineQueue ?? true,
      regionalDictionary,
      register,
      ...(u.sttConfidence !== null ? { sttConfidence: u.sttConfidence } : {}),
    };
    const result = await backend.interpretUtterance(request, `utt-${u.utteranceId}` as IdempotencyKey);
    if (gen !== generation.current) return 'drop';
    if (result.ok) {
      latest.current.onInterpreted(result.value);
      return 'ok';
    }
    // Refus définitif (requête invalide, clé déjà utilisée autrement, réponse illisible) :
    // réessayer bloquerait toute la file pour toujours.
    const k = result.error.kind;
    return k === 'rejected' || k === 'conflict' || k === 'bad_response' ? 'drop' : 'retry';
  }, []);

  const enqueue = useCallback(
    (u: QueuedUtterance) => {
      queue.current = pruneQueue([...queue.current, u], new Date());
      persistQueue();
    },
    [persistQueue],
  );

  const handleFinal = useCallback(
    async (text: string, confidence: number | null) => {
      setPartialText('');
      if (latest.current.interceptFinal?.(text)) {
        setMicState('idle');
        return;
      }
      const { isOnline, speaker, strings: S } = latest.current;
      const u: QueuedUtterance = {
        utteranceId: newUtteranceId(),
        transcript: text,
        capturedAt: nowIso() as IsoDateTime,
        sttConfidence: confidence,
        fromOfflineQueue: !isOnline,
      };
      if (!isOnline || latest.current.paused) {
        enqueue(u);
        setMicState('idle');
        await speaker.say(S.voice.offlineSaved);
        return;
      }
      setMicState('processing');
      void speaker.say(S.voice.noting);
      const outcome = await interpret(u);
      setMicState('idle');
      if (outcome === 'retry') {
        enqueue(u);
        setTimeout(() => setRetryTick((t) => t + 1), RETRY_DELAY_MS);
        await latest.current.speaker.say(S.voice.interpretFailed);
      } else if (outcome === 'drop') {
        await latest.current.speaker.say(latest.current.strings.voice.interpretDropped);
      }
    },
    [enqueue, interpret],
  );

  const startListening = useCallback(() => {
    const { speech, speaker, isOnline, strings: S } = latest.current;
    speaker.stop(); // l'appui coupe la voix de l'appli
    if (!isOnline && queue.current.length >= QUEUE_MAX) {
      void speaker.say(S.voice.queueFull);
      return;
    }
    const begin = (): void => {
      setMicState(isOnline ? 'listening' : 'offline_recording');
      speech.start({
        onPartial: setPartialText,
        onFinal: (text, confidence) => void handleFinal(text, confidence),
        onError: (reason) => {
          setMicState('idle');
          setPartialText('');
          const phrase = phraseFor(latest.current.strings, reason);
          if (phrase !== '') void latest.current.speaker.say(phrase);
        },
      });
    };
    if (isOnline) begin();
    else void speaker.say(S.voice.offlineListening).then(begin);
  }, [handleFinal]);

  const onMicPress = useCallback(() => {
    if (micState === 'listening' || micState === 'offline_recording') latest.current.speech.stop();
    else if (micState === 'idle') startListening();
  }, [micState, startListening]);

  /* Retour du réseau (ou nouvelle tentative) : analyse de la file, dans l'ordre. */
  useEffect(() => {
    if (!o.isOnline) {
      wasOffline.current = true;
      return;
    }
    if (o.paused || !queueLoaded.current || queue.current.length === 0 || flushing.current) return;
    flushing.current = true;
    const gen = generation.current;
    void (async () => {
      if (wasOffline.current) await latest.current.speaker.say(latest.current.strings.voice.backOnline);
      wasOffline.current = false;
      let blocked = false;
      let dropped = false;
      while (queue.current.length > 0 && latest.current.isOnline && !latest.current.paused && gen === generation.current) {
        const head = queue.current[0];
        if (!head) break;
        const outcome = await interpret(head);
        if (gen !== generation.current) break;
        if (outcome === 'retry') {
          blocked = true;
          break;
        }
        if (outcome === 'drop') dropped = true;
        queue.current = queue.current.filter((q) => q.utteranceId !== head.utteranceId);
        persistQueue();
      }
      flushing.current = false;
      if (dropped && gen === generation.current) void latest.current.speaker.say(latest.current.strings.voice.interpretDropped);
      if (blocked) setTimeout(() => setRetryTick((t) => t + 1), RETRY_DELAY_MS);
      // Écran panier quitté ou prise ajoutée pendant l'envoi : on repasse.
      else if (queue.current.length > 0) setRetryTick((t) => t + 1);
    })();
  }, [o.isOnline, o.paused, retryTick, interpret, persistQueue]);

  const reset = useCallback(async () => {
    generation.current += 1;
    latest.current.speech.stop();
    queue.current = [];
    flushing.current = false;
    setMicState('idle');
    setPartialText('');
    latest.current.onQueueChanged(0);
    await saveQueue(latest.current.store, []).catch(() => undefined);
  }, []);

  return { micState, partialText, onMicPress, startListening, reset };
};
