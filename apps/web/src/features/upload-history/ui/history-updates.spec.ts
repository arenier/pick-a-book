import { describe, expect, it, vi } from 'vitest';

import type { HistoryOutcome } from '../model/history-entry';
import { createHistoryUpdates } from './history-updates';

const books = (count: number): HistoryOutcome => ({ kind: 'books', count });

// The detail and the list are two screens of one slice that must not know each other: what ties
// them is this channel, which the slice's entry point hands to both.
describe('createHistoryUpdates', () => {
  it('tells a listener what an upload became', () => {
    const updates = createHistoryUpdates();
    const listener = vi.fn<(id: string, outcome: HistoryOutcome) => void>();
    updates.subscribe(listener);

    updates.publish('abc', books(3));

    expect(listener).toHaveBeenCalledExactlyOnceWith('abc', books(3));
  });

  it('tells every listener', () => {
    const updates = createHistoryUpdates();
    const first = vi.fn<(id: string, outcome: HistoryOutcome) => void>();
    const second = vi.fn<(id: string, outcome: HistoryOutcome) => void>();
    updates.subscribe(first);
    updates.subscribe(second);

    updates.publish('abc', books(1));

    expect(first).toHaveBeenCalledOnce();
    expect(second).toHaveBeenCalledOnce();
  });

  it('stops telling a listener once it has unsubscribed', () => {
    const updates = createHistoryUpdates();
    const listener = vi.fn<(id: string, outcome: HistoryOutcome) => void>();
    const unsubscribe = updates.subscribe(listener);

    unsubscribe();
    updates.publish('abc', books(1));

    expect(listener).not.toHaveBeenCalled();
  });

  it('says nothing, and breaks nothing, when nobody listens', () => {
    expect(() => {
      createHistoryUpdates().publish('abc', books(1));
    }).not.toThrow();
  });
});
