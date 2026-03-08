import { useCallback, useRef, useState } from 'react';

// Types
interface UseTapTempoOptions {
  maxTaps?: number;
  onTempoChange?: (bpm: number) => void;
  resetAfterMs?: number;
}

interface UseTapTempoReturn {
  bpm: number | null;
  reset: () => void;
  tap: () => void;
  tapCount: number;
}

// Constants
const DEFAULT_MAX_TAPS = 8;
const DEFAULT_RESET_AFTER_MS = 2000;

// Main hook
export function useTapTempo(options: UseTapTempoOptions = {}): UseTapTempoReturn {
  const {
    maxTaps = DEFAULT_MAX_TAPS,
    onTempoChange,
    resetAfterMs = DEFAULT_RESET_AFTER_MS,
  } = options;

  const [bpm, setBpm] = useState<number | null>(null);
  const [tapCount, setTapCount] = useState(0);

  const tapsRef = useRef<number[]>([]);
  const resetTimeoutRef = useRef<number | null>(null);

  const reset = useCallback(() => {
    tapsRef.current = [];
    setTapCount(0);
    setBpm(null);
    if (resetTimeoutRef.current) {
      clearTimeout(resetTimeoutRef.current);
      resetTimeoutRef.current = null;
    }
  }, []);

  const tap = useCallback(() => {
    const now = performance.now();

    // Clear previous reset timeout
    if (resetTimeoutRef.current) {
      clearTimeout(resetTimeoutRef.current);
    }

    // Set new reset timeout
    resetTimeoutRef.current = window.setTimeout(reset, resetAfterMs);

    // Add tap
    tapsRef.current.push(now);
    if (tapsRef.current.length > maxTaps) {
      tapsRef.current.shift();
    }

    setTapCount(tapsRef.current.length);

    // Calculate BPM if we have at least 2 taps
    if (tapsRef.current.length >= 2) {
      const intervals: number[] = [];
      for (let i = 1; i < tapsRef.current.length; i++) {
        intervals.push(tapsRef.current[i] - tapsRef.current[i - 1]);
      }

      const averageInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      const calculatedBpm = Math.round(60000 / averageInterval);

      // Clamp to reasonable range
      const clampedBpm = Math.max(20, Math.min(300, calculatedBpm));

      setBpm(clampedBpm);
      onTempoChange?.(clampedBpm);
    }
  }, [maxTaps, onTempoChange, reset, resetAfterMs]);

  return {
    bpm,
    reset,
    tap,
    tapCount,
  };
}
