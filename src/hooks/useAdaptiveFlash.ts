import { useState, useEffect, useRef, useMemo } from 'react';

export interface AdaptiveFlashResult {
  disableFlash: boolean;
  fps: number;
}

/**
 * Hook for adaptive flash control - automatically disables flash highlights
 * when FPS drops to maintain smooth performance, and re-enables when recovered.
 *
 * Uses hysteresis to prevent rapid toggling:
 * - Disable: FPS < 55 for 2 consecutive seconds
 * - Re-enable: FPS >= 58 for 3 consecutive seconds
 *
 * @param enabled - When false, skips FPS monitoring (no rAF loop, no setState).
 *                  Returns a stable { disableFlash: false, fps: 0 } with zero overhead.
 *                  Default: true
 * @returns {AdaptiveFlashResult} { disableFlash, fps }
 */
export function useAdaptiveFlash(enabled: boolean = true): AdaptiveFlashResult {
  const [disableFlash, setDisableFlash] = useState(false);
  const [fps, setFps] = useState(60);
  const frameCountRef = useRef(0);
  const lastFrameTimeRef = useRef(performance.now());
  const consecutiveCountRef = useRef(0);
  const rafRef = useRef<number>();

  // Stable memoized result when disabled (zero overhead)
  const disabledResult = useMemo(() => ({ disableFlash: false, fps: 0 }), []);

  useEffect(() => {
    // Early return when disabled - no rAF loop, no overhead
    if (!enabled) return;
    const measureFps = () => {
      frameCountRef.current++;
      const now = performance.now();
      const elapsed = now - lastFrameTimeRef.current;

      if (elapsed >= 1000) {
        const currentFps = Math.round((frameCountRef.current * 1000) / elapsed);
        setFps(currentFps);
        frameCountRef.current = 0;
        lastFrameTimeRef.current = now;

        // Adaptive flash control with hysteresis
        // Disable: FPS < 55 for 2 consecutive seconds
        // Re-enable: FPS >= 58 for 3 consecutive seconds
        if (currentFps < 55 && !disableFlash) {
          consecutiveCountRef.current++;
          if (consecutiveCountRef.current >= 2) {
            setDisableFlash(true);
            consecutiveCountRef.current = 0;
          }
        } else if (currentFps >= 58 && disableFlash) {
          consecutiveCountRef.current++;
          if (consecutiveCountRef.current >= 3) {
            setDisableFlash(false);
            consecutiveCountRef.current = 0;
          }
        } else if (currentFps >= 55 && !disableFlash) {
          consecutiveCountRef.current = 0;
        }
      }

      rafRef.current = requestAnimationFrame(measureFps);
    };

    rafRef.current = requestAnimationFrame(measureFps);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]); // Removed disableFlash from deps - the rAF loop should survive state transitions

  // Return stable memoized result when disabled
  if (!enabled) return disabledResult;

  return { disableFlash, fps };
}
