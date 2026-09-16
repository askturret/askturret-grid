import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
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

  it('rAF loop survives disableFlash transitions without restarting (regression test for #34)', () => {
    // Mock performance.now() and requestAnimationFrame to control timing
    let mockTime = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => mockTime);

    let rafCallback: FrameRequestCallback | null = null;
    const rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      rafCallback = cb;
      return 1; // Return a fake ID
    });

    const cancelSpy = vi.spyOn(window, 'cancelAnimationFrame');

    // Mount the hook
    const { result } = renderHook(() => useAdaptiveFlash());

    // Initially: disableFlash = false, fps = 60
    expect(result.current.disableFlash).toBe(false);
    expect(result.current.fps).toBe(60);

    const initialRafCallCount = rafSpy.mock.calls.length;

    // Simulate low FPS (< 55) for 2 consecutive seconds to trigger disable
    // Each measurement window is 1000ms, ~50 fps = ~20ms per frame
    act(() => {
      for (let i = 0; i < 2; i++) {
        // Simulate ~50 frames over 1 second (low FPS ~50)
        for (let f = 0; f < 50; f++) {
          mockTime += 20; // 20ms per frame = 50 fps
          rafCallback?.(mockTime);
        }
      }
    });

    // After 2 consecutive seconds of low FPS, disableFlash should be true
    expect(result.current.disableFlash).toBe(true);

    // The rAF loop should NOT have been cancelled/restarted
    expect(cancelSpy).not.toHaveBeenCalled();

    // Now simulate recovery: high FPS (>= 58) for 3 consecutive seconds to re-enable
    act(() => {
      for (let i = 0; i < 3; i++) {
        // Simulate ~60 frames over 1 second (high FPS ~60)
        for (let f = 0; f < 60; f++) {
          mockTime += 16.67; // ~16.67ms per frame = 60 fps
          rafCallback?.(mockTime);
        }
      }
    });

    // After 3 consecutive seconds of high FPS, disableFlash should be false again
    expect(result.current.disableFlash).toBe(false);

    // The rAF loop should STILL not have been cancelled/restarted
    // This is the key test: the loop survived BOTH transitions
    expect(cancelSpy).not.toHaveBeenCalled();

    // Only the initial rAF call should have been made (no restarts)
    // (Plus one per measureFps recursion, but no cleanup/re-setup)
    expect(cancelSpy.mock.calls.length).toBe(0);
  });
});
