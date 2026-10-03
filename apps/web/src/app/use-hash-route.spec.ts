import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useHashRoute } from './use-hash-route';

const anId = '1f9c2e3a-4b5d-4e6f-8a7b-9c0d1e2f3a4b';

/** What the browser does when the user follows a link or presses back. */
function navigateTo(hash: string): void {
  act(() => {
    window.location.hash = hash;
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
}

describe('useHashRoute', () => {
  afterEach(() => {
    window.location.hash = '';
  });

  it('starts on the route of the fragment the page was opened with', () => {
    window.location.hash = '#/historique';

    const { result } = renderHook(() => useHashRoute());

    expect(result.current).toStrictEqual({ name: 'history' });
  });

  it('follows the fragment as it changes', () => {
    const { result } = renderHook(() => useHashRoute());

    navigateTo(`#/historique/${anId}`);
    expect(result.current).toStrictEqual({ name: 'entry', id: anId });

    navigateTo('#/');
    expect(result.current).toStrictEqual({ name: 'upload' });
  });

  it('keeps the same route object while nothing changes', () => {
    window.location.hash = '#/historique';
    const { result, rerender } = renderHook(() => useHashRoute());
    const first = result.current;

    rerender();

    expect(result.current).toBe(first);
  });

  it('stops listening once unmounted', () => {
    const remove = vi.spyOn(window, 'removeEventListener');
    const { unmount } = renderHook(() => useHashRoute());

    unmount();

    expect(remove).toHaveBeenCalledWith('hashchange', expect.any(Function));
    remove.mockRestore();
  });
});
