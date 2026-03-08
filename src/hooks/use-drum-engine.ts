import { useCallback, useEffect, useRef, useState } from 'react';

import type { DrumProject, DrumSection, DrumTrack } from '@/lib/drum-looper-types';

// Types
interface PlaybackCursor {
  loop: number;
  sectionIndex: number;
  stepIndex: number;
  totalSteps: number;
}

interface UseDrumEngineOptions {
  project: DrumProject;
}

interface UseDrumEngineReturn {
  cursor: PlaybackCursor | null;
  error: string | null;
  isBuffering: boolean;
  isPlaying: boolean;
  play: () => Promise<void>;
  stop: () => void;
  toggle: () => Promise<void>;
}

interface PlaybackState {
  loop: number;
  nextNoteTime: number;
  repeatIndex: number;
  sectionIndex: number;
  stepIndex: number;
}

// Constants
const LOOKAHEAD_SECONDS = 0.12;
const MIN_NOTE_AHEAD_SECONDS = 0.04;
const SCHEDULER_INTERVAL_MS = 25;

// Helper functions
function resolveSampleUrl(samplePath: string): string {
  if (/^https?:\/\//i.test(samplePath)) return samplePath;

  const sampleOrigin = import.meta.env.VITE_DRUM_SAMPLE_ORIGIN;
  if (sampleOrigin && samplePath.startsWith('/drum-looper/')) {
    return `${sampleOrigin.replace(/\/$/, '')}${samplePath}`;
  }

  const origin = window.location.origin;
  const basePath = import.meta.env.BASE_URL ?? '/';
  const normalizedBasePath = basePath.endsWith('/') ? basePath.slice(0, -1) : basePath;

  if (samplePath.startsWith('/')) {
    if (
      normalizedBasePath !== '' &&
      normalizedBasePath !== '/' &&
      samplePath.startsWith(`${normalizedBasePath}/`)
    ) {
      return `${origin}${samplePath}`;
    }

    if (normalizedBasePath === '' || normalizedBasePath === '/') {
      return `${origin}${samplePath}`;
    }

    return `${origin}${normalizedBasePath}${samplePath}`;
  }

  const separator =
    normalizedBasePath === '' || normalizedBasePath === '/' ? '/' : `${normalizedBasePath}/`;

  return `${origin}${separator}${samplePath}`;
}

export function getStepCount(section: DrumSection): number {
  return section.beatsPerBar * section.bars * section.stepsPerBeat;
}

export function isStepActive(track: DrumTrack, section: DrumSection, stepIndex: number): boolean {
  return section.pattern[track.id]?.includes(stepIndex) ?? false;
}

export function shouldPlayTrack(track: DrumTrack, hasSolo: boolean): boolean {
  if (hasSolo) {
    return track.solo && !track.mute;
  }
  return !track.mute;
}

export function getSwingOffsetSeconds(
  section: DrumSection,
  stepIndex: number,
  stepDurationSeconds: number,
): number {
  if (section.swing <= 0) return 0;
  const isOffSubdivision = stepIndex % 2 === 1;
  if (!isOffSubdivision) return 0;

  return stepDurationSeconds * section.swing * 0.5;
}

function warmupAudioContext(audioContext: AudioContext): void {
  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();

  gainNode.gain.setValueAtTime(0, audioContext.currentTime);
  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);
  oscillator.start();
  oscillator.stop(audioContext.currentTime + 0.001);
}

// Main hook
export function useDrumEngine({ project }: UseDrumEngineOptions): UseDrumEngineReturn {
  const [cursor, setCursor] = useState<PlaybackCursor | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isBuffering, setIsBuffering] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);

  const projectRef = useRef(project);
  const intervalRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const playbackStateRef = useRef<PlaybackState | null>(null);
  const sampleBufferCacheRef = useRef<Map<string, AudioBuffer>>(new Map());
  const masterGainRef = useRef<GainNode | null>(null);
  const masterCompressorRef = useRef<DynamicsCompressorNode | null>(null);

  useEffect(() => {
    projectRef.current = project;
    if (masterGainRef.current && audioContextRef.current) {
      masterGainRef.current.gain.setValueAtTime(
        project.masterVolume,
        audioContextRef.current.currentTime,
      );
    }
  }, [project]);

  const ensureAudioContext = useCallback(async (shouldResume = true) => {
    if (!audioContextRef.current) {
      const audioContext = new AudioContext();
      const masterCompressor = audioContext.createDynamicsCompressor();
      const masterGain = audioContext.createGain();

      masterCompressor.threshold.value = -16;
      masterCompressor.knee.value = 24;
      masterCompressor.ratio.value = 4;
      masterCompressor.attack.value = 0.002;
      masterCompressor.release.value = 0.08;

      masterGain.gain.value = projectRef.current.masterVolume;

      masterCompressor.connect(masterGain);
      masterGain.connect(audioContext.destination);

      audioContextRef.current = audioContext;
      masterCompressorRef.current = masterCompressor;
      masterGainRef.current = masterGain;
      warmupAudioContext(audioContext);
    }

    if (shouldResume && audioContextRef.current.state === 'suspended') {
      await audioContextRef.current.resume();
    }

    return audioContextRef.current;
  }, []);

  const preloadBuffers = useCallback(async (audioContext: AudioContext) => {
    const uniquePaths = [...new Set(projectRef.current.tracks.map(track => track.samplePath))];

    const missingPaths = uniquePaths.filter(path => !sampleBufferCacheRef.current.has(path));
    if (missingPaths.length === 0) return;

    setIsBuffering(true);

    try {
      await Promise.all(
        missingPaths.map(async samplePath => {
          const response = await fetch(resolveSampleUrl(samplePath));
          if (!response.ok) {
            throw new Error(`Failed to load sample: ${samplePath}`);
          }

          const arrayBuffer = await response.arrayBuffer();
          const audioBuffer = await audioContext.decodeAudioData(arrayBuffer.slice(0));
          sampleBufferCacheRef.current.set(samplePath, audioBuffer);
        }),
      );
    } finally {
      setIsBuffering(false);
    }
  }, []);

  const stop = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    playbackStateRef.current = null;
    setIsPlaying(false);
    setCursor(null);
  }, []);

  const scheduleStep = useCallback((audioContext: AudioContext, state: PlaybackState) => {
    const currentProject = projectRef.current;
    const section = currentProject.sections[state.sectionIndex];
    const hasSolo = currentProject.tracks.some(track => track.solo);

    const stepDurationSeconds = 60 / currentProject.bpm / section.stepsPerBeat;
    const swingOffsetSeconds = getSwingOffsetSeconds(section, state.stepIndex, stepDurationSeconds);

    const rawTime = state.nextNoteTime + swingOffsetSeconds;

    for (const track of currentProject.tracks) {
      if (!shouldPlayTrack(track, hasSolo)) continue;
      if (!isStepActive(track, section, state.stepIndex)) continue;

      const buffer = sampleBufferCacheRef.current.get(track.samplePath);
      if (!buffer) continue;

      const source = audioContext.createBufferSource();
      source.buffer = buffer;

      const trackGain = audioContext.createGain();
      const trackPanner = audioContext.createStereoPanner();

      trackGain.gain.value = track.volume;
      trackPanner.pan.value = track.pan;

      source.connect(trackPanner);
      trackPanner.connect(trackGain);
      trackGain.connect(masterCompressorRef.current!);

      const adjustedTime = Math.max(
        audioContext.currentTime + 0.001,
        rawTime + track.nudgeMs / 1000,
      );
      source.start(adjustedTime);
    }

    setCursor({
      loop: state.loop,
      sectionIndex: state.sectionIndex,
      stepIndex: state.stepIndex,
      totalSteps: getStepCount(section),
    });
  }, []);

  const advancePlaybackState = useCallback((state: PlaybackState) => {
    const currentProject = projectRef.current;
    const section = currentProject.sections[state.sectionIndex];
    const stepCount = getStepCount(section);

    state.stepIndex += 1;

    if (state.stepIndex >= stepCount) {
      state.stepIndex = 0;
      state.repeatIndex += 1;

      if (state.repeatIndex >= section.repeats) {
        state.repeatIndex = 0;
        state.sectionIndex = (state.sectionIndex + 1) % currentProject.sections.length;
        state.loop += 1;
      }
    }

    state.nextNoteTime += 60 / currentProject.bpm / section.stepsPerBeat;
  }, []);

  const schedulerTick = useCallback(() => {
    if (!audioContextRef.current || !playbackStateRef.current) return;

    const audioContext = audioContextRef.current;
    const playbackState = playbackStateRef.current;

    while (playbackState.nextNoteTime < audioContext.currentTime + LOOKAHEAD_SECONDS) {
      scheduleStep(audioContext, playbackState);
      advancePlaybackState(playbackState);
    }
  }, [advancePlaybackState, scheduleStep]);

  const play = useCallback(async () => {
    if (isPlaying) return;

    const currentProject = projectRef.current;
    if (currentProject.tracks.length === 0) {
      setError('Add at least one sample track before pressing play.');
      return;
    }

    try {
      setError(null);

      const audioContext = await ensureAudioContext();
      await preloadBuffers(audioContext);

      playbackStateRef.current = {
        loop: 1,
        nextNoteTime: audioContext.currentTime + MIN_NOTE_AHEAD_SECONDS,
        repeatIndex: 0,
        sectionIndex: 0,
        stepIndex: 0,
      };

      schedulerTick();

      intervalRef.current = window.setInterval(schedulerTick, SCHEDULER_INTERVAL_MS);
      setIsPlaying(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to start playback.');
      stop();
    }
  }, [ensureAudioContext, isPlaying, preloadBuffers, schedulerTick, stop]);

  const toggle = useCallback(async () => {
    if (isPlaying) {
      stop();
      return;
    }
    await play();
  }, [isPlaying, play, stop]);

  useEffect(
    () => () => {
      stop();
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => undefined);
      }
    },
    [stop],
  );

  return {
    cursor,
    error,
    isBuffering,
    isPlaying,
    play,
    stop,
    toggle,
  };
}
