import { useCallback, useEffect, useRef } from 'react';

/**
 * Appelle `onTimeout` après `ms` sans activité. Brancher `reset` sur
 * `onTouchStart` de la vue racine (V3.0 §6.1 : fermeture après 3 min d'inactivité).
 */
export const useInactivityTimeout = (onTimeout: () => void, ms: number): (() => void) => {
  const cb = useRef(onTimeout);
  cb.current = onTimeout;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reset = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => cb.current(), ms);
  }, [ms]);

  useEffect(() => {
    reset();
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [reset]);

  return reset;
};
