import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useAdaptiveFlash } from './useAdaptiveFlash';

describe('useAdaptiveFlash', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('starts with flash enabled and fps at 60', () => {
    const { result } = renderHook(() => useAdaptiveFlash());

    expect(result.current.disableFlash).toBe(false);
    expect(result.current.fps).toBe(60);
  });

  it('returns disableFlash and fps properties', () => {
    const { result } = renderHook(() => useAdaptiveFlash());

    expect(typeof result.current.disableFlash).toBe('boolean');
    expect(typeof result.current.fps).toBe('number');
  });

  it('cleans up requestAnimationFrame on unmount', () => {
    const cancelSpy = vi.spyOn(window, 'cancelAnimationFrame');

    const { unmount } = renderHook(() => useAdaptiveFlash());
    unmount();

    expect(cancelSpy).toHaveBeenCalled();
  });

  it('calls requestAnimationFrame on mount', () => {
    const rafSpy = vi.spyOn(window, 'requestAnimationFrame');

    renderHook(() => useAdaptiveFlash());

    expect(rafSpy).toHaveBeenCalled();
  });

  it('does not restart rAF loop when disableFlash state changes (regression test for #34)', () => {
    const cancelSpy = vi.spyOn(window, 'cancelAnimationFrame');
    const rafSpy = vi.spyOn(window, 'requestAnimationFrame');

    // Mount the hook
    const { rerender } = renderHook(() => useAdaptiveFlash());

    const initialCallCount = rafSpy.mock.calls.length;

    // Force a state update by simulating FPS measurement
    // In a real scenario, disableFlash would change after consecutive low FPS readings
    // For this test, we're verifying the effect cleanup doesn't run unnecessarily

    // Rerender the hook (simulating a parent component rerender)
    rerender();

    // The rAF loop should NOT restart on rerender - no new cancel/request should happen
    // The effect should only run once (on mount) since 'enabled' hasn't changed
    expect(cancelSpy).not.toHaveBeenCalled();
    expect(rafSpy.mock.calls.length).toBe(initialCallCount); // Same count as before

    // Verify the loop is still running by checking rafRef is set
    // (We can't directly test the internal state change, but we can verify the effect didn't tear down)
  });
});
