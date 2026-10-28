/**
 * Journal JSON, une ligne par évènement. Ne jamais y écrire de dictée, de nom, de
 * numéro, d'adresse, de lien Instacart ni de jeton (Loi 25) : seulement des codes,
 * des identifiants techniques et des durées.
 */

export interface Logger {
  info(msg: string, data?: Record<string, unknown>): void;
  warn(msg: string, data?: Record<string, unknown>): void;
  error(msg: string, data?: Record<string, unknown>): void;
}

export const createLogger = (write: (line: string) => void = (l) => process.stdout.write(`${l}\n`), quiet = false): Logger => {
  const emit = (level: string) => (msg: string, data: Record<string, unknown> = {}) => {
    if (quiet && level === 'info') return;
    write(JSON.stringify({ t: new Date().toISOString(), level, msg, ...data }));
  };
  return { info: emit('info'), warn: emit('warn'), error: emit('error') };
};
