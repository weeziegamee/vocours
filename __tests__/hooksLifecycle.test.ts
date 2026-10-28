import React from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { useInactivityTimeout } from '../src/hooks/useInactivityTimeout';
import { useNetworkStatus } from '../src/hooks/useNetworkStatus';
import { useSpeaker, type Speaker } from '../src/hooks/useSpeaker';
import { createMockNetwork } from '../src/services/network/mockNetwork';
import type { NetworkPort, TtsPort } from '../src/types/vocourse';

describe('cycle de vie des hooks', () => {
  let root: ReactTestRenderer | undefined;

  afterEach(async () => {
    await act(async () => root?.unmount());
    root = undefined;
    jest.useRealTimers();
  });

  it('utilise le dernier rappel sans redémarrer le délai d’inactivité', async () => {
    jest.useFakeTimers();
    const first = jest.fn();
    const latest = jest.fn();
    const Probe = ({ onTimeout }: { onTimeout: () => void }) => {
      useInactivityTimeout(onTimeout, 1000);
      return null;
    };
    await act(async () => { root = create(React.createElement(Probe, { onTimeout: first })); });
    await act(async () => { jest.advanceTimersByTime(600); });
    await act(async () => { root?.update(React.createElement(Probe, { onTimeout: latest })); });
    await act(async () => { jest.advanceTimersByTime(400); });
    expect(first).not.toHaveBeenCalled();
    expect(latest).toHaveBeenCalledTimes(1);
  });

  it('suit le nouveau port réseau et libère les anciens abonnements', async () => {
    const first = createMockNetwork({ startOnline: true });
    const second = createMockNetwork({ startOnline: false });
    const unsubscribe = jest.fn();
    const originalSubscribe = first.subscribe;
    first.subscribe = (listener) => {
      const remove = originalSubscribe(listener);
      return () => { unsubscribe(); remove(); };
    };
    let online: boolean | undefined;
    const Probe = ({ network }: { network: NetworkPort }) => {
      online = useNetworkStatus(network);
      return null;
    };
    await act(async () => { root = create(React.createElement(Probe, { network: first })); });
    expect(online).toBe(true);
    await act(async () => { root?.update(React.createElement(Probe, { network: second })); });
    expect(online).toBe(false);
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    await act(async () => { second.set(true); });
    expect(online).toBe(true);
  });

  it('interrompt les phrases en attente quand le moteur vocal change', async () => {
    let finishFirst!: (outcome: 'completed') => void;
    const first: TtsPort = {
      speak: jest.fn(() => new Promise((resolve) => { finishFirst = resolve; })),
      stop: jest.fn(),
      setLocale: jest.fn(),
    };
    const second: TtsPort = {
      speak: jest.fn(async () => 'completed' as const),
      stop: jest.fn(),
      setLocale: jest.fn(),
    };
    let speaker!: Speaker;
    const Probe = ({ tts }: { tts: TtsPort }) => {
      speaker = useSpeaker(tts);
      return null;
    };
    await act(async () => { root = create(React.createElement(Probe, { tts: first })); });
    const speaking = speaker.say('Bonjour');
    const pending = speaker.say('Ancienne phrase');
    await act(async () => { await Promise.resolve(); });
    await act(async () => { root?.update(React.createElement(Probe, { tts: second })); });
    expect(first.stop).toHaveBeenCalledTimes(1);
    finishFirst('completed');
    await speaking;
    expect(await pending).toBe('interrupted');
    expect(first.speak).toHaveBeenCalledTimes(1);
    expect(await speaker.say('Nouvelle phrase')).toBe('completed');
    expect(second.speak).toHaveBeenCalledWith('Nouvelle phrase', undefined);
    await act(async () => { root?.unmount(); });
    root = undefined;
    expect(second.stop).toHaveBeenCalledTimes(1);
  });
});
