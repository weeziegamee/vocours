/**
 * Joignabilité du serveur Vocourse (pas seulement « le Wi-Fi est allumé ») :
 * - le système signale un changement de connexion → on sonde /v1/health ;
 * - hors ligne, une sonde toutes les 20 s ; en ligne, toutes les 2 min ;
 * - au retour de l'appli au premier plan, une sonde immédiate.
 * Logique pure : les sources d'évènements et la sonde sont injectées.
 */

import type { NetworkPort } from '../../types/vocourse';

export interface ReachabilityDeps {
  readonly probe: () => Promise<boolean>;
  /** Changement signalé par le système (NetInfo) ; `connected` faux : inutile de sonder. */
  readonly onConnectivityChange: (cb: (connected: boolean) => void) => () => void;
  readonly onForeground: (cb: () => void) => () => void;
  readonly setInterval?: (fn: () => void, ms: number) => unknown;
  readonly clearInterval?: (t: unknown) => void;
  readonly offlineEveryMs?: number;
  readonly onlineEveryMs?: number;
}

export interface Reachability extends NetworkPort {
  /** Sonde immédiate (après une erreur réseau, par exemple). */
  check(): Promise<boolean>;
  dispose(): void;
}

export const createReachability = (deps: ReachabilityDeps): Reachability => {
  const every = deps.setInterval ?? ((fn: () => void, ms: number) => setInterval(fn, ms));
  const cancel = deps.clearInterval ?? ((t: unknown) => clearInterval(t as ReturnType<typeof setInterval>));
  const offlineMs = deps.offlineEveryMs ?? 20_000;
  const onlineMs = deps.onlineEveryMs ?? 120_000;

  let online = true;
  let probing: Promise<boolean> | null = null;
  let timer: unknown = null;
  const listeners = new Set<(online: boolean) => void>();

  const set = (value: boolean): void => {
    if (value === online) return;
    online = value;
    listeners.forEach((l) => l(online));
    schedule();
  };

  const check = (): Promise<boolean> => {
    if (!probing) {
      probing = deps
        .probe()
        .catch(() => false)
        .then((ok) => {
          set(ok);
          return ok;
        })
        .finally(() => {
          probing = null;
        });
    }
    return probing;
  };

  const schedule = (): void => {
    if (timer !== null) cancel(timer);
    timer = every(() => void check(), online ? onlineMs : offlineMs);
  };

  const unsubConn = deps.onConnectivityChange((connected) => {
    if (!connected) set(false);
    else void check();
  });
  const unsubFg = deps.onForeground(() => void check());
  schedule();
  void check();

  return {
    isOnline: () => online,
    subscribe(l) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    check,
    dispose() {
      unsubConn();
      unsubFg();
      if (timer !== null) cancel(timer);
    },
  };
};
