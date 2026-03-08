import { useCallback, useEffect, useRef, useState } from 'react';

// Types
interface SpeedTrainerConfig {
  bpmIncrement: number;
  enabled: boolean;
  loops: number;
  repeatsPerLoop: number;
}

interface SpeedTrainerState {
  currentBpm: number;
  currentLoop: number;
  currentRepeat: number;
}

interface TimerConfig {
  durationSeconds: number;
  enabled: boolean;
}

interface UseMetronomeOptions {
  accentBeats?: number[];
  beatsPerMeasure?: number;
  bpm?: number;
  countIn?: number;
  onBeatChange?: (beat: number) => void;
  onBpmChange?: (bpm: number) => void;
  onComplete?: () => void;
  onCountInChange?: (count: number) => void;
  speedTrainer?: SpeedTrainerConfig;
  timer?: TimerConfig;
}

interface UseMetronomeReturn {
  bpm: number;
  countInRemaining: number;
  currentBeat: number;
  elapsedSeconds: number;
  isCountingIn: boolean;
  isPlaying: boolean;
  pause: () => void;
  play: () => void;
  setBpm: (bpm: number) => void;
  speedTrainerState: SpeedTrainerState | null;
  toggle: () => void;
}

// Constants
const DEFAULT_BPM = 120;
const MAX_BPM = 300;
const MIN_BPM = 20;

// Helper functions
function clampBpm(value: number): number {
  return Math.max(MIN_BPM, Math.min(MAX_BPM, value));
}

type ClickType = 'accent' | 'downbeat' | 'normal' | 'countIn';

function createClickSound(audioContext: AudioContext, clickType: ClickType): void {
  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();

  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);

  // Different sounds for different beat types
  switch (clickType) {
    case 'downbeat':
      oscillator.frequency.value = 1000;
      oscillator.type = 'sine';
      break;
    case 'accent':
      oscillator.frequency.value = 900;
      oscillator.type = 'sine';
      break;
    case 'countIn':
      oscillator.frequency.value = 1200;
      oscillator.type = 'triangle';
      break;
    default:
      oscillator.frequency.value = 800;
      oscillator.type = 'sine';
  }

  const now = audioContext.currentTime;
  const volume = clickType === 'downbeat' ? 0.35 : clickType === 'accent' ? 0.28 : 0.2;
  gainNode.gain.setValueAtTime(volume, now);
  gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

  oscillator.start(now);
  oscillator.stop(now + 0.1);
}

// Warm up audio context with a silent sound to eliminate first-play latency
function warmupAudioContext(audioContext: AudioContext): void {
  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();

  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);

  // Silent sound - volume at 0
  gainNode.gain.setValueAtTime(0, audioContext.currentTime);

  oscillator.start();
  oscillator.stop(audioContext.currentTime + 0.001);
}

// Main hook
export function useMetronome(options: UseMetronomeOptions = {}): UseMetronomeReturn {
  const {
    accentBeats = [0],
    beatsPerMeasure = 4,
    bpm: initialBpm = DEFAULT_BPM,
    countIn = 0,
    onBeatChange,
    onBpmChange,
    onComplete,
    onCountInChange,
    speedTrainer,
    timer,
  } = options;

  const [bpm, setBpmState] = useState(() => clampBpm(initialBpm));
  const [currentBeat, setCurrentBeat] = useState(-1); // -1 = not playing, 0+ = current beat
  const [isPlaying, setIsPlaying] = useState(false);
  const [isCountingIn, setIsCountingIn] = useState(false);
  const [countInRemaining, setCountInRemaining] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [speedTrainerState, setSpeedTrainerState] = useState<SpeedTrainerState | null>(null);

  // Use refs for values that need to be accessed in interval callbacks
  const bpmRef = useRef(bpm);
  const beatsPerMeasureRef = useRef(beatsPerMeasure);
  const accentBeatsRef = useRef(accentBeats);
  const audioContextRef = useRef<AudioContext | null>(null);
  const intervalRef = useRef<number | null>(null);
  const timerIntervalRef = useRef<number | null>(null);
  const currentBeatRef = useRef(0);
  const speedTrainerRef = useRef({ currentBpm: bpm, currentLoop: 1, currentRepeat: 1 });
  const audioWarmedUpRef = useRef(false);

  // Keep refs in sync
  useEffect(() => {
    bpmRef.current = bpm;
  }, [bpm]);

  useEffect(() => {
    beatsPerMeasureRef.current = beatsPerMeasure;
    // Reset current beat if it exceeds the new beats per measure
    if (currentBeatRef.current >= beatsPerMeasure) {
      currentBeatRef.current = 0;
    }
  }, [beatsPerMeasure]);

  useEffect(() => {
    accentBeatsRef.current = accentBeats;
  }, [accentBeats]);

  const getAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext();
    }
    return audioContextRef.current;
  }, []);

  // Preload AudioContext on first user interaction to eliminate first-play latency
  useEffect(() => {
    const handleFirstInteraction = () => {
      if (audioWarmedUpRef.current) return;

      const audioContext = getAudioContext();
      if (audioContext.state === 'suspended') {
        audioContext.resume().then(() => {
          warmupAudioContext(audioContext);
          audioWarmedUpRef.current = true;
        });
      } else {
        warmupAudioContext(audioContext);
        audioWarmedUpRef.current = true;
      }

      // Remove listeners after first interaction
      window.removeEventListener('click', handleFirstInteraction);
      window.removeEventListener('touchstart', handleFirstInteraction);
      window.removeEventListener('keydown', handleFirstInteraction);
    };

    window.addEventListener('click', handleFirstInteraction);
    window.addEventListener('touchstart', handleFirstInteraction);
    window.addEventListener('keydown', handleFirstInteraction);

    return () => {
      window.removeEventListener('click', handleFirstInteraction);
      window.removeEventListener('touchstart', handleFirstInteraction);
      window.removeEventListener('keydown', handleFirstInteraction);
    };
  }, [getAudioContext]);

  const stopInterval = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const getClickType = useCallback((beat: number): ClickType => {
    if (beat === 0) return 'downbeat';
    if (accentBeatsRef.current.includes(beat)) return 'accent';
    return 'normal';
  }, []);

  const startInterval = useCallback(
    (intervalBpm: number, audioContext: AudioContext) => {
      stopInterval();

      const tick = () => {
        const beat = currentBeatRef.current;
        const clickType = getClickType(beat);
        createClickSound(audioContext, clickType);

        setCurrentBeat(beat);
        onBeatChange?.(beat);

        // Increment for next beat (use ref to get latest beatsPerMeasure)
        currentBeatRef.current = (beat + 1) % beatsPerMeasureRef.current;

        // Speed trainer logic - check after completing a measure
        if (speedTrainer?.enabled && currentBeatRef.current === 0) {
          const st = speedTrainerRef.current;
          st.currentRepeat++;

          if (st.currentRepeat > speedTrainer.repeatsPerLoop) {
            st.currentRepeat = 1;
            st.currentLoop++;

            // Check for completion (loops > 0 means finite, 0 means infinite)
            if (speedTrainer.loops > 0 && st.currentLoop > speedTrainer.loops) {
              // Complete
              stopInterval();
              if (timerIntervalRef.current) {
                clearInterval(timerIntervalRef.current);
                timerIntervalRef.current = null;
              }
              setIsPlaying(false);
              setCurrentBeat(-1);
              currentBeatRef.current = 0;
              setElapsedSeconds(0);
              setSpeedTrainerState(null);
              onComplete?.();
              return;
            }

            // Increase BPM for next loop
            st.currentBpm = clampBpm(st.currentBpm + speedTrainer.bpmIncrement);

            // Restart interval with new BPM
            startInterval(st.currentBpm, audioContext);
          }

          setSpeedTrainerState({ ...st });
        }
      };

      const interval = 60000 / intervalBpm;
      intervalRef.current = window.setInterval(tick, interval);

      // Execute first tick immediately
      tick();
    },
    [getClickType, onBeatChange, onComplete, speedTrainer, stopInterval],
  );

  const stop = useCallback(() => {
    stopInterval();
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    setIsPlaying(false);
    setIsCountingIn(false);
    setCountInRemaining(0);
    setCurrentBeat(-1);
    currentBeatRef.current = 0;
    setElapsedSeconds(0);
    setSpeedTrainerState(null);
  }, [stopInterval]);

  const startMetronome = useCallback(
    (audioContext: AudioContext) => {
      currentBeatRef.current = 0;
      const startBpm = bpmRef.current;

      if (speedTrainer?.enabled) {
        speedTrainerRef.current = {
          currentBpm: startBpm,
          currentLoop: 1,
          currentRepeat: 1,
        };
        setSpeedTrainerState({ ...speedTrainerRef.current });
      }

      setIsCountingIn(false);
      setCountInRemaining(0);
      startInterval(startBpm, audioContext);

      // Timer logic
      if (timer?.enabled && timer.durationSeconds > 0) {
        timerIntervalRef.current = window.setInterval(() => {
          setElapsedSeconds(prev => {
            const next = prev + 1;
            if (next >= timer.durationSeconds) {
              stop();
              onComplete?.();
              return 0;
            }
            return next;
          });
        }, 1000);
      }
    },
    [onComplete, speedTrainer, startInterval, stop, timer],
  );

  const play = useCallback(() => {
    const audioContext = getAudioContext();
    if (audioContext.state === 'suspended') {
      audioContext.resume();
    }

    // Ensure audio is warmed up before playing
    if (!audioWarmedUpRef.current) {
      warmupAudioContext(audioContext);
      audioWarmedUpRef.current = true;
    }

    setIsPlaying(true);

    // Count-in logic
    if (countIn > 0) {
      setIsCountingIn(true);
      let remaining = countIn;

      const countInTick = () => {
        // Check if count-in is complete
        if (remaining <= 0) {
          stopInterval();
          startMetronome(audioContext);
          return;
        }

        // Display current count and play sound
        setCountInRemaining(remaining);
        onCountInChange?.(remaining);
        createClickSound(audioContext, 'countIn');

        // Decrement for next tick
        remaining--;
      };

      // First count-in tick immediately
      countInTick();

      const interval = 60000 / bpmRef.current;
      intervalRef.current = window.setInterval(countInTick, interval);
    } else {
      startMetronome(audioContext);
    }
  }, [countIn, getAudioContext, onCountInChange, startMetronome, stopInterval]);

  const pause = useCallback(() => {
    stop();
  }, [stop]);

  const toggle = useCallback(() => {
    if (isPlaying) {
      pause();
    } else {
      play();
    }
  }, [isPlaying, pause, play]);

  const setBpm = useCallback(
    (newBpm: number) => {
      const clamped = clampBpm(newBpm);
      setBpmState(clamped);
      bpmRef.current = clamped;
      onBpmChange?.(clamped);

      // If playing (not counting in) and not in speed trainer mode, restart interval with new BPM
      if (isPlaying && !isCountingIn && !speedTrainer?.enabled && audioContextRef.current) {
        startInterval(clamped, audioContextRef.current);
      }
    },
    [isCountingIn, isPlaying, onBpmChange, speedTrainer?.enabled, startInterval],
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
    };
  }, []);

  return {
    bpm,
    countInRemaining,
    currentBeat,
    elapsedSeconds,
    isCountingIn,
    isPlaying,
    pause,
    play,
    setBpm,
    speedTrainerState,
    toggle,
  };
}

export { clampBpm, DEFAULT_BPM, MAX_BPM, MIN_BPM };
