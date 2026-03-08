import { useCallback, useEffect, useRef, useState } from 'react';

import { frequencyToNote, type DetectedNote } from '@/lib/tuner-utils';

const BUFFER_SIZE = 4096;
const MIN_FREQ = 55; // A1-ish
const MAX_FREQ = 1760; // A6-ish

/**
 * Autocorrelation pitch detection on a buffer. Returns frequency in Hz or 0 if unclear.
 * Uses parabolic interpolation for sub-sample accuracy.
 */
function detectPitchAutocorrelation(buffer: Float32Array, sampleRate: number): number {
  const n = buffer.length;
  const maxLag = Math.floor(sampleRate / MIN_FREQ);
  const minLag = Math.ceil(sampleRate / MAX_FREQ);

  if (maxLag >= n / 2 || minLag < 2) return 0;

  const correlations = new Float32Array(maxLag + 1);

  for (let tau = minLag; tau <= maxLag; tau++) {
    let sum = 0;
    for (let i = 0; i < n - tau; i++) {
      sum += buffer[i] * buffer[i + tau];
    }
    correlations[tau] = sum;
  }

  let bestLag = minLag;
  let bestCorr = correlations[minLag];

  for (let tau = minLag + 1; tau < maxLag; tau++) {
    const c = correlations[tau];
    if (c > bestCorr) {
      bestCorr = c;
      bestLag = tau;
    }
  }

  // Parabolic interpolation for sub-sample accuracy
  const y0 = correlations[bestLag - 1];
  const y1 = correlations[bestLag];
  const y2 = correlations[bestLag + 1];
  if (bestLag - 1 < 0 || bestLag + 1 > maxLag || y1 <= 0) {
    return sampleRate / bestLag;
  }
  const delta = (0.5 * (y0 - y2)) / (y0 - 2 * y1 + y2);
  const period = bestLag + (Number.isFinite(delta) ? delta : 0);
  const frequency = sampleRate / period;

  // Reject if outside range or correlation too weak (silence)
  if (frequency < MIN_FREQ || frequency > MAX_FREQ) return 0;
  const rms = Math.sqrt(buffer.reduce((s, x) => s + x * x, 0) / buffer.length);
  if (rms < 0.001) return 0;

  return frequency;
}

export interface UseTunerOptions {
  middleA: number;
  onNoteDetected?: (note: DetectedNote) => void;
}

export interface UseTunerResult {
  error: string | null;
  isListening: boolean;
  note: DetectedNote | null;
  start: () => Promise<void>;
  stop: () => void;
  playReference: (frequency: number) => void;
  stopReference: () => void;
}

export function useTuner(options: UseTunerOptions): UseTunerResult {
  const { middleA, onNoteDetected } = options;
  const [note, setNote] = useState<DetectedNote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isListening, setIsListening] = useState(false);

  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const oscillatorRef = useRef<OscillatorNode | null>(null);
  const lastNoteNameRef = useRef<string | null>(null);

  const cleanup = useCallback(() => {
    try {
      streamRef.current?.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    } catch {
      // ignore
    }
    scriptProcessorRef.current?.disconnect();
    scriptProcessorRef.current = null;
    audioContextRef.current?.close().catch(() => {});
    audioContextRef.current = null;
    setIsListening(false);
    setNote(null);
  }, []);

  const stop = useCallback(() => {
    cleanup();
  }, [cleanup]);

  const start = useCallback(async () => {
    setError(null);
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) {
      setError('AudioContext not supported in this browser');
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Microphone access not available');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const audioContext = new AudioContextClass();
      audioContextRef.current = audioContext;

      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      const scriptProcessor = audioContext.createScriptProcessor(BUFFER_SIZE, 1, 1);
      scriptProcessorRef.current = scriptProcessor;

      source.connect(analyser);
      analyser.connect(scriptProcessor);
      scriptProcessor.connect(audioContext.destination);

      scriptProcessor.onaudioprocess = (event: AudioProcessingEvent) => {
        const input = event.inputBuffer.getChannelData(0);
        const buffer = new Float32Array(input.length);
        buffer.set(input);

        const frequency = detectPitchAutocorrelation(buffer, audioContext.sampleRate);

        if (frequency > 0) {
          const detected = frequencyToNote(frequency, middleA);
          if (lastNoteNameRef.current === detected.name) {
            setNote(detected);
            onNoteDetected?.(detected);
          } else {
            lastNoteNameRef.current = detected.name;
          }
        }
      };

      setIsListening(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to access microphone';
      setError(message);
      cleanup();
    }
  }, [middleA, onNoteDetected, cleanup]);

  const playReference = useCallback((frequency: number) => {
    const ctx = audioContextRef.current;
    if (!ctx) return;
    if (oscillatorRef.current) {
      oscillatorRef.current.stop();
      oscillatorRef.current = null;
    }
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = frequency;
    osc.connect(ctx.destination);
    osc.start();
    oscillatorRef.current = osc;
  }, []);

  const stopReference = useCallback(() => {
    if (oscillatorRef.current) {
      oscillatorRef.current.stop();
      oscillatorRef.current = null;
    }
  }, []);

  useEffect(() => {
    lastNoteNameRef.current = null;
    return () => {
      cleanup();
      if (oscillatorRef.current) {
        oscillatorRef.current.stop();
        oscillatorRef.current = null;
      }
    };
  }, [cleanup]);

  return {
    error,
    isListening,
    note,
    start,
    stop,
    playReference,
    stopReference,
  };
}
