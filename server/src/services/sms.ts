/**
 * Envoi des textos à l'aidant.
 *  - Twilio (production) : API REST, numéro canadien ou service de messagerie (MG…).
 *    Twilio gère lui-même les mots-clés STOP / ARRÊT pour les numéros nord-américains ;
 *    un envoi refusé pour cette raison (code 21610) est signalé `opted_out`.
 *  - Console (développement) : le texto est écrit dans le journal. Interdit en production.
 */

export type SmsOutcome = 'sent' | 'opted_out' | 'failed';

export interface SmsSender {
  send(to: string, body: string): Promise<SmsOutcome>;
}

export interface TwilioOptions {
  readonly accountSid: string;
  readonly authToken: string;
  /** Numéro E.164 (« +15145550100 ») ou identifiant de service de messagerie (« MG… »). */
  readonly from: string;
  readonly fetchImpl?: typeof fetch;
  readonly log?: (event: string, data: Record<string, unknown>) => void;
}

export const createTwilioSender = (o: TwilioOptions): SmsSender => {
  const doFetch = o.fetchImpl ?? fetch;
  const log = o.log ?? (() => undefined);
  const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(o.accountSid)}/Messages.json`;
  const auth = `Basic ${Buffer.from(`${o.accountSid}:${o.authToken}`).toString('base64')}`;

  return {
    async send(to, body) {
      const form = new URLSearchParams({ To: to, Body: body });
      if (o.from.startsWith('MG')) form.set('MessagingServiceSid', o.from);
      else form.set('From', o.from);
      for (let attempt = 1; attempt <= 2; attempt += 1) {
        try {
          const res = await doFetch(url, {
            method: 'POST',
            headers: { Authorization: auth, 'Content-Type': 'application/x-www-form-urlencoded' },
            body: form.toString(),
            signal: AbortSignal.timeout(10_000),
          });
          if (res.ok) return 'sent';
          const err = (await res.json().catch(() => ({}))) as { code?: number };
          log('sms_error', { status: res.status, code: err.code ?? null });
          if (err.code === 21610) return 'opted_out';
          if (res.status < 500 && res.status !== 429) return 'failed';
        } catch (e) {
          log('sms_network', { error: e instanceof Error ? e.name : 'unknown' });
        }
      }
      return 'failed';
    },
  };
};

export const createConsoleSender = (write: (line: string) => void): SmsSender => ({
  async send(to, body) {
    write(`[texto simulé → ${to.slice(0, -4).replace(/\d/g, '•')}${to.slice(-4)}] ${body}`);
    return 'sent';
  },
});
