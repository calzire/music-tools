import { useCallback, useEffect, useRef, useState } from 'react';
import * as Tone from 'tone';

import {
  type Chord,
  type SynthPreset,
  type Variant,
  chordToMidi,
  rootMidi as computeRootMidi,
} from '@/lib/worship-pad-utils';

// Types
export interface PadSettings {
  attack: number;
  preset: SynthPreset;
  release: number;
  reverbWet: number;
  shimmerReverbAmount: number;
  volume: number;
}

type SynthOscType = 'fatsawtooth' | 'fattriangle' | 'fatsine' | 'fatsquare';
type FMOscType = 'sine' | 'triangle' | 'square' | 'sawtooth';

interface EnvelopeShape {
  attack: number;
  decay: number;
  sustain: number;
  release: number;
}

type PresetConfig = {
  lowpassHz: number;
  autoFilterOctaves: number;
  autoFilterWet: number;
  envelope?: EnvelopeShape;
} & (
  | {
      synthClass: 'Synth';
      oscillatorType: SynthOscType;
      oscillatorCount: number;
      oscillatorSpread: number;
    }
  | {
      synthClass: 'FMSynth';
      harmonicity: number;
      modulationIndex: number;
      carrierType: FMOscType;
      modulatorType: FMOscType;
      modulationEnvelope?: EnvelopeShape;
    }
);

const PRESETS: Record<SynthPreset, PresetConfig> = {
  pad: {
    synthClass: 'Synth',
    oscillatorType: 'fatsawtooth',
    oscillatorCount: 3,
    oscillatorSpread: 25,
    lowpassHz: 2200,
    autoFilterOctaves: 3,
    autoFilterWet: 0.6,
  },
  organ: {
    synthClass: 'Synth',
    oscillatorType: 'fattriangle',
    oscillatorCount: 3,
    oscillatorSpread: 25,
    lowpassHz: 2200,
    autoFilterOctaves: 2,
    autoFilterWet: 0.4,
  },
  bell: {
    synthClass: 'FMSynth',
    harmonicity: 5,
    modulationIndex: 8,
    carrierType: 'sine',
    modulatorType: 'sine',
    // Sustain close to peak (0.8) so the held note stays level with the strike.
    // Softer attack (0.08) + short decay (0.6) gives "bell color" without the stark volume dip.
    envelope: { attack: 0.08, decay: 0.6, sustain: 0.8, release: 4 },
    // Keep FM present through the sustain (0.35) so the bell character doesn't evaporate after strike.
    modulationEnvelope: { attack: 0.02, decay: 0.6, sustain: 0.35, release: 1.5 },
    lowpassHz: 3200,
    autoFilterOctaves: 1,
    autoFilterWet: 0.15,
  },
};

interface UseWorshipPadOptions {
  settings: PadSettings;
}

interface UseWorshipPadReturn {
  activeChord: Chord | null;
  ducked: boolean;
  droneActive: boolean;
  isReady: boolean;
  latched: boolean;
  playChord: (
    chord: Chord,
    variant: Variant,
    octave: number,
    subRoot: boolean,
    shimmer: boolean,
  ) => Promise<void>;
  refreshVoicing: (
    chord: Chord,
    variant: Variant,
    octave: number,
    subRoot: boolean,
    shimmer: boolean,
  ) => void;
  releaseChord: () => void;
  retuneDrone: (rootPc: number, octave: number) => void;
  setDrone: (on: boolean, rootPc: number, octave: number) => void;
  setDucked: (on: boolean) => void;
  setShimmerFeedback: (on: boolean) => void;
  toggleLatch: () => void;
}

// Constants
// Tone's PolySynth drops notes (does not steal voices) when maxPolyphony is
// reached, so these must cover the attack+release overlap of several rapid
// chord presses. ~4 notes/chord × ~4 overlapping presses = 16 for the pad.
const PAD_MAX_POLYPHONY = 16;
const SHIMMER_MAX_POLYPHONY = 12;
const DRONE_MAX_POLYPHONY = 4;
const DUCK_DB = -18;
const DUCK_RAMP_SECONDS = 0.4;
const VOLUME_RAMP_SECONDS = 0.1;
const REVERB_RAMP_SECONDS = 0.2;
const DRONE_BASELINE_DB = -3;
const DRONE_DUCK_DB = -12;
const DRONE_DUCK_ATTACK_SECONDS = 0.3;
const DRONE_DUCK_RELEASE_SECONDS = 1.5;
const SHIMMER_VOICE_DB = -14;
const SHIMMER_SEMITONES = 24;
const SHIMMER_REVERB_RAMP_SECONDS = 0.3;
const SHIMMER_REVERB_DELAY_SECONDS = 0.12;

// Helpers for synth construction
function createPadSynth(
  preset: PresetConfig,
  attack: number,
  release: number,
): Tone.PolySynth {
  const envelope: EnvelopeShape = preset.envelope ?? {
    attack,
    decay: 0.5,
    sustain: 0.7,
    release,
  };
  if (preset.synthClass === 'Synth') {
    const synth = new Tone.PolySynth(Tone.Synth, {
      oscillator: {
        type: preset.oscillatorType,
        count: preset.oscillatorCount,
        spread: preset.oscillatorSpread,
      },
      envelope,
    });
    synth.maxPolyphony = PAD_MAX_POLYPHONY;
    return synth;
  }
  const modulationEnvelope: EnvelopeShape = preset.modulationEnvelope ?? {
    attack: Math.max(attack * 0.5, 0.5),
    decay: 0.8,
    sustain: 0.3,
    release,
  };
  const synth = new Tone.PolySynth(Tone.FMSynth, {
    harmonicity: preset.harmonicity,
    modulationIndex: preset.modulationIndex,
    oscillator: { type: preset.carrierType },
    modulation: { type: preset.modulatorType },
    envelope,
    modulationEnvelope,
  });
  synth.maxPolyphony = PAD_MAX_POLYPHONY;
  return synth;
}

function applyPresetParams(synth: Tone.PolySynth, preset: PresetConfig): void {
  if (preset.synthClass === 'Synth') {
    (synth as Tone.PolySynth<Tone.Synth>).set({
      oscillator: {
        type: preset.oscillatorType,
        count: preset.oscillatorCount,
        spread: preset.oscillatorSpread,
      },
    });
  } else {
    (synth as Tone.PolySynth<Tone.FMSynth>).set({
      harmonicity: preset.harmonicity,
      modulationIndex: preset.modulationIndex,
      oscillator: { type: preset.carrierType },
      modulation: { type: preset.modulatorType },
    });
  }
}

// Helpers for envelope shaping
function shimmerEnvelope(settings: PadSettings) {
  return {
    attack: Math.max(settings.attack * 1.3, 2.5),
    decay: 0.6,
    sustain: 0.5,
    release: Math.max(settings.release * 1.5, 3.5),
  };
}

function droneEnvelope(settings: PadSettings) {
  return {
    attack: Math.max(settings.attack * 1.5, 1.5),
    decay: 0.4,
    sustain: 1,
    release: Math.max(settings.release * 1.5, 2),
  };
}

// Helpers
function midiToFreq(midi: number): number {
  return Tone.Frequency(midi, 'midi').toFrequency();
}

// Main hook
export function useWorshipPad({ settings }: UseWorshipPadOptions): UseWorshipPadReturn {
  const synthRef = useRef<Tone.PolySynth | null>(null);
  const droneSynthRef = useRef<Tone.PolySynth | null>(null);
  const droneVolumeRef = useRef<Tone.Volume | null>(null);
  const shimmerSynthRef = useRef<Tone.PolySynth | null>(null);
  const chorusRef = useRef<Tone.Chorus | null>(null);
  const filterRef = useRef<Tone.AutoFilter | null>(null);
  const padLowpassRef = useRef<Tone.Filter | null>(null);
  const reverbRef = useRef<Tone.Reverb | null>(null);
  const shimmerFeedbackGainRef = useRef<Tone.Gain | null>(null);
  const shimmerPitchShiftRef = useRef<Tone.PitchShift | null>(null);
  const shimmerFeedbackConnectedRef = useRef(false);
  const volumeRef = useRef<Tone.Volume | null>(null);
  const limiterRef = useRef<Tone.Limiter | null>(null);

  const currentNotesRef = useRef<number[]>([]);
  const currentShimmerNotesRef = useRef<number[]>([]);
  const activeChordRef = useRef<Chord | null>(null);
  const droneNotesRef = useRef<number[]>([]);
  const droneDesiredRef = useRef(false);
  const droneRootPcRef = useRef(0);
  const droneOctaveRef = useRef(0);
  const latchedRef = useRef(true);
  const duckedRef = useRef(false);
  const settingsRef = useRef(settings);
  const currentSynthClassRef = useRef<PresetConfig['synthClass']>(PRESETS[settings.preset].synthClass);
  const pendingDisposalsRef = useRef<Array<{ timer: number; synth: Tone.PolySynth }>>([]);

  const [isReady, setIsReady] = useState(false);
  const [activeChord, setActiveChord] = useState<Chord | null>(null);
  const [droneActive, setDroneActive] = useState(false);
  const [latched, setLatched] = useState(true);
  const [ducked, setDuckedState] = useState(false);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  // Initialize the Tone graph once
  useEffect(() => {
    const initialPreset = PRESETS[settings.preset];
    const chorus = new Tone.Chorus(0.3, 1.5, 0.35).start();
    const padLowpass = new Tone.Filter({
      type: 'lowpass',
      frequency: initialPreset.lowpassHz,
      Q: 0.5,
      rolloff: -12,
    });
    const filter = new Tone.AutoFilter({
      frequency: 0.12,
      baseFrequency: 300,
      octaves: initialPreset.autoFilterOctaves,
      wet: initialPreset.autoFilterWet,
    }).start();
    const reverb = new Tone.Reverb({
      decay: 4,
      preDelay: 0.05,
      wet: settings.reverbWet,
    });
    const volume = new Tone.Volume(Tone.gainToDb(settings.volume));
    // Brick-wall limiter catches voice-stacking peaks before the destination
    // would hard-clip them into audible distortion on rapid chord presses.
    const limiter = new Tone.Limiter(-1);

    const synth = createPadSynth(initialPreset, settings.attack, settings.release);
    // Drone stays on triangle for a warm, pure sub-bass foundation under the evolving saw pad.
    const drone = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'fattriangle', count: 3, spread: 20 },
      envelope: droneEnvelope(settings),
    });
    drone.maxPolyphony = DRONE_MAX_POLYPHONY;
    const shimmer = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'sine' },
      envelope: shimmerEnvelope(settings),
    });
    shimmer.maxPolyphony = SHIMMER_MAX_POLYPHONY;

    const droneVolume = new Tone.Volume(DRONE_BASELINE_DB);
    const shimmerVolume = new Tone.Volume(SHIMMER_VOICE_DB);

    // Shimmer reverb: pitch-shifted feedback from reverb output back into reverb.
    const shimmerPitchShift = new Tone.PitchShift({ pitch: 12, windowSize: 0.1 });
    const shimmerFeedbackDelay = new Tone.Delay(SHIMMER_REVERB_DELAY_SECONDS);
    const shimmerFeedbackGain = new Tone.Gain(settings.shimmerReverbAmount);

    // Master chain: chorus → padLowpass → autoFilter → reverb → volume → limiter → destination
    chorus.connect(padLowpass);
    padLowpass.connect(filter);
    filter.connect(reverb);
    reverb.connect(volume);
    volume.connect(limiter);
    limiter.toDestination();

    // Sources
    synth.connect(chorus);
    drone.connect(droneVolume);
    droneVolume.connect(chorus);
    // Shimmer voice bypasses chorus/filter to stay clean and airy.
    shimmer.connect(shimmerVolume);
    shimmerVolume.connect(reverb);

    // Shimmer reverb feedback loop: reverb → pitchShift → delay → gain → reverb.
    // The reverb → pitchShift edge is gated by setShimmerFeedback so the granular
    // PitchShift isn't processing audio when shimmer is off.
    shimmerPitchShift.connect(shimmerFeedbackDelay);
    shimmerFeedbackDelay.connect(shimmerFeedbackGain);
    shimmerFeedbackGain.connect(reverb);

    synthRef.current = synth;
    droneSynthRef.current = drone;
    droneVolumeRef.current = droneVolume;
    shimmerSynthRef.current = shimmer;
    chorusRef.current = chorus;
    filterRef.current = filter;
    padLowpassRef.current = padLowpass;
    reverbRef.current = reverb;
    shimmerFeedbackGainRef.current = shimmerFeedbackGain;
    shimmerPitchShiftRef.current = shimmerPitchShift;
    volumeRef.current = volume;
    limiterRef.current = limiter;

    return () => {
      // Cancel and dispose any pending preset-crossfade synths.
      for (const { timer, synth: pendingSynth } of pendingDisposalsRef.current) {
        window.clearTimeout(timer);
        pendingSynth.dispose();
      }
      pendingDisposalsRef.current = [];
      // Dispose the currently active synth (may have been swapped by a preset change).
      const activeSynth = synthRef.current;
      activeSynth?.releaseAll();
      activeSynth?.dispose();
      drone.releaseAll();
      shimmer.releaseAll();
      drone.dispose();
      shimmer.dispose();
      droneVolume.dispose();
      shimmerVolume.dispose();
      chorus.dispose();
      padLowpass.dispose();
      filter.dispose();
      reverb.dispose();
      shimmerPitchShift.dispose();
      shimmerFeedbackDelay.dispose();
      shimmerFeedbackGain.dispose();
      volume.dispose();
      limiter.dispose();
      synthRef.current = null;
      droneSynthRef.current = null;
      droneVolumeRef.current = null;
      shimmerSynthRef.current = null;
      chorusRef.current = null;
      filterRef.current = null;
      padLowpassRef.current = null;
      reverbRef.current = null;
      shimmerFeedbackGainRef.current = null;
      shimmerPitchShiftRef.current = null;
      shimmerFeedbackConnectedRef.current = false;
      volumeRef.current = null;
      limiterRef.current = null;
      currentNotesRef.current = [];
      currentShimmerNotesRef.current = [];
      droneNotesRef.current = [];
    };
    // Deliberately empty deps: graph built once; live updates via separate effects.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Push envelope changes to the synths.
  // Presets with a fixed envelope (e.g. Bell's strike) aren't touched — their character depends on it.
  useEffect(() => {
    const envSource = { attack: settings.attack, release: settings.release } as const;
    if (!PRESETS[settings.preset].envelope) {
      synthRef.current?.set({ envelope: envSource });
    }
    droneSynthRef.current?.set({
      envelope: droneEnvelope({ ...settings, attack: envSource.attack, release: envSource.release }),
    });
    shimmerSynthRef.current?.set({
      envelope: shimmerEnvelope({
        ...settings,
        attack: envSource.attack,
        release: envSource.release,
      }),
    });
    // Envelope helpers only read attack/release from settings.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.attack, settings.release, settings.preset]);

  // Push shimmer reverb amount (feedback gain)
  useEffect(() => {
    shimmerFeedbackGainRef.current?.gain.rampTo(
      settings.shimmerReverbAmount,
      SHIMMER_REVERB_RAMP_SECONDS,
    );
  }, [settings.shimmerReverbAmount]);

  // Apply preset — update filters; swap synth class with crossfade when needed.
  useEffect(() => {
    const p = PRESETS[settings.preset];
    padLowpassRef.current?.frequency.rampTo(p.lowpassHz, 0.3);
    if (filterRef.current) {
      filterRef.current.octaves = p.autoFilterOctaves;
      filterRef.current.wet.rampTo(p.autoFilterWet, 0.3);
    }

    const synth = synthRef.current;
    const chorus = chorusRef.current;
    if (!synth || !chorus) return;

    const classChanged = currentSynthClassRef.current !== p.synthClass;

    if (classChanged) {
      // Crossfade: release old synth over its natural release, attack new synth in parallel.
      const heldNotes = currentNotesRef.current;
      const heldFreqs = heldNotes.map(midiToFreq);
      if (heldFreqs.length > 0) {
        synth.triggerRelease(heldFreqs);
      }

      const releaseMs = (settingsRef.current.release + 1) * 1000;
      const doomedSynth = synth;
      const timer = window.setTimeout(() => {
        doomedSynth.dispose();
        pendingDisposalsRef.current = pendingDisposalsRef.current.filter(e => e.timer !== timer);
      }, releaseMs);
      pendingDisposalsRef.current.push({ timer, synth: doomedSynth });

      const nextSynth = createPadSynth(p, settingsRef.current.attack, settingsRef.current.release);
      nextSynth.connect(chorus);
      synthRef.current = nextSynth;
      currentSynthClassRef.current = p.synthClass;

      if (heldFreqs.length > 0) {
        nextSynth.triggerAttack(heldFreqs);
      }
    } else {
      applyPresetParams(synth, p);
      // Same class — retrigger so the new oscillator shape is heard.
      if (currentNotesRef.current.length > 0) {
        const freqs = currentNotesRef.current.map(midiToFreq);
        synth.triggerRelease(freqs);
        synth.triggerAttack(freqs);
      }
    }
  }, [settings.preset]);

  // Push volume changes (skip while ducked; duck logic owns the ramp)
  useEffect(() => {
    if (volumeRef.current && !duckedRef.current) {
      volumeRef.current.volume.rampTo(Tone.gainToDb(settings.volume), VOLUME_RAMP_SECONDS);
    }
  }, [settings.volume]);

  // Push reverb wet
  useEffect(() => {
    reverbRef.current?.wet.rampTo(settings.reverbWet, REVERB_RAMP_SECONDS);
  }, [settings.reverbWet]);

  const setShimmerFeedback = useCallback((on: boolean) => {
    const pitchShift = shimmerPitchShiftRef.current;
    const reverb = reverbRef.current;
    if (!pitchShift || !reverb) return;
    if (shimmerFeedbackConnectedRef.current === on) return;
    if (on) {
      reverb.connect(pitchShift);
    } else {
      reverb.disconnect(pitchShift);
    }
    shimmerFeedbackConnectedRef.current = on;
  }, []);

  const setDucked = useCallback((on: boolean) => {
    if (!volumeRef.current) return;
    const target = on ? DUCK_DB : Tone.gainToDb(settingsRef.current.volume);
    volumeRef.current.volume.rampTo(target, DUCK_RAMP_SECONDS);
    duckedRef.current = on;
    setDuckedState(on);
  }, []);

  const playChord = useCallback<UseWorshipPadReturn['playChord']>(
    async (chord, variant, octave, subRoot, shimmer) => {
      if (Tone.getContext().state !== 'running') {
        await Tone.start();
      }
      const synth = synthRef.current;
      const shimmerSynth = shimmerSynthRef.current;
      if (!synth) return;

      const previous = currentNotesRef.current;
      const previousShimmer = currentShimmerNotesRef.current;
      const previousChord = activeChordRef.current;

      // When latched, re-pressing the active chord toggles it off.
      if (
        latchedRef.current &&
        previousChord &&
        previousChord.name === chord.name &&
        previous.length > 0
      ) {
        synth.triggerRelease(previous.map(midiToFreq));
        if (shimmerSynth && previousShimmer.length > 0) {
          shimmerSynth.triggerRelease(previousShimmer.map(midiToFreq));
        }
        currentNotesRef.current = [];
        currentShimmerNotesRef.current = [];
        activeChordRef.current = null;
        setActiveChord(null);
        return;
      }

      if (previous.length > 0) {
        synth.triggerRelease(previous.map(midiToFreq));
      }
      if (shimmerSynth && previousShimmer.length > 0) {
        shimmerSynth.triggerRelease(previousShimmer.map(midiToFreq));
      }

      // Drop the sub-root from the chord when the drone is already playing it,
      // so bass level stays the same whether Sub, Drone, or both are on.
      const droneCoversSubRoot = droneNotesRef.current.length > 0;
      const midi = chordToMidi(chord, octave, variant, subRoot && !droneCoversSubRoot);
      synth.triggerAttack(midi.map(midiToFreq));

      const shimmerMidi = shimmer ? midi.map(n => n + SHIMMER_SEMITONES) : [];
      if (shimmerSynth && shimmerMidi.length > 0) {
        shimmerSynth.triggerAttack(shimmerMidi.map(midiToFreq));
      }

      // Sidechain-style duck on the drone so chord attacks punch through.
      const droneVolume = droneVolumeRef.current;
      if (droneVolume && droneNotesRef.current.length > 0) {
        const now = Tone.now();
        const param = droneVolume.volume;
        param.cancelScheduledValues(now);
        param.setValueAtTime(param.value, now);
        param.linearRampToValueAtTime(DRONE_DUCK_DB, now + DRONE_DUCK_ATTACK_SECONDS);
        param.linearRampToValueAtTime(
          DRONE_BASELINE_DB,
          now + DRONE_DUCK_ATTACK_SECONDS + DRONE_DUCK_RELEASE_SECONDS,
        );
      }

      currentNotesRef.current = midi;
      currentShimmerNotesRef.current = shimmerMidi;
      activeChordRef.current = chord;
      setActiveChord(chord);
      setIsReady(true);
    },
    [],
  );

  const refreshVoicing = useCallback<UseWorshipPadReturn['refreshVoicing']>(
    (chord, variant, octave, subRoot, shimmer) => {
      const synth = synthRef.current;
      const shimmerSynth = shimmerSynthRef.current;
      if (!synth || currentNotesRef.current.length === 0) return;

      const droneCoversSubRoot = droneNotesRef.current.length > 0;
      const nextMidi = chordToMidi(chord, octave, variant, subRoot && !droneCoversSubRoot);
      const nextShimmerMidi = shimmer ? nextMidi.map(n => n + SHIMMER_SEMITONES) : [];
      const previous = currentNotesRef.current;
      const previousShimmer = currentShimmerNotesRef.current;

      const sameMain =
        previous.length === nextMidi.length && previous.every((n, i) => n === nextMidi[i]);
      const sameShimmer =
        previousShimmer.length === nextShimmerMidi.length &&
        previousShimmer.every((n, i) => n === nextShimmerMidi[i]);

      if (sameMain && sameShimmer && activeChordRef.current?.name === chord.name) return;

      if (!sameMain) {
        synth.triggerRelease(previous.map(midiToFreq));
        synth.triggerAttack(nextMidi.map(midiToFreq));
        currentNotesRef.current = nextMidi;
      }
      if (!sameShimmer && shimmerSynth) {
        if (previousShimmer.length > 0) {
          shimmerSynth.triggerRelease(previousShimmer.map(midiToFreq));
        }
        if (nextShimmerMidi.length > 0) {
          shimmerSynth.triggerAttack(nextShimmerMidi.map(midiToFreq));
        }
        currentShimmerNotesRef.current = nextShimmerMidi;
      }
      activeChordRef.current = chord;
      setActiveChord(chord);
    },
    [],
  );

  const retuneDrone = useCallback<UseWorshipPadReturn['retuneDrone']>((rootPc, octave) => {
    const drone = droneSynthRef.current;
    if (!drone || droneNotesRef.current.length === 0) return;

    const nextNote = computeRootMidi(rootPc, octave);
    const previous = droneNotesRef.current;
    if (previous.length === 1 && previous[0] === nextNote) return;

    drone.triggerRelease(previous.map(midiToFreq));
    drone.triggerAttack([midiToFreq(nextNote)]);
    droneNotesRef.current = [nextNote];
  }, []);

  const releaseChord = useCallback(() => {
    if (latchedRef.current) return;
    const synth = synthRef.current;
    const shimmerSynth = shimmerSynthRef.current;
    const previous = currentNotesRef.current;
    const previousShimmer = currentShimmerNotesRef.current;
    if (synth && previous.length > 0) {
      synth.triggerRelease(previous.map(midiToFreq));
    }
    if (shimmerSynth && previousShimmer.length > 0) {
      shimmerSynth.triggerRelease(previousShimmer.map(midiToFreq));
    }
    currentNotesRef.current = [];
    currentShimmerNotesRef.current = [];
    activeChordRef.current = null;
    setActiveChord(null);
  }, []);

  const toggleLatch = useCallback(() => {
    const next = !latchedRef.current;
    latchedRef.current = next;
    setLatched(next);
    if (!next) {
      const synth = synthRef.current;
      const shimmerSynth = shimmerSynthRef.current;
      const previous = currentNotesRef.current;
      const previousShimmer = currentShimmerNotesRef.current;
      if (synth && previous.length > 0) {
        synth.triggerRelease(previous.map(midiToFreq));
      }
      if (shimmerSynth && previousShimmer.length > 0) {
        shimmerSynth.triggerRelease(previousShimmer.map(midiToFreq));
      }
      currentNotesRef.current = [];
      currentShimmerNotesRef.current = [];
      activeChordRef.current = null;
      setActiveChord(null);
    }
  }, []);

  const setDrone = useCallback<UseWorshipPadReturn['setDrone']>((on, rootPc, octave) => {
    droneDesiredRef.current = on;
    droneRootPcRef.current = rootPc;
    droneOctaveRef.current = octave;
    setDroneActive(on);

    const drone = droneSynthRef.current;
    if (!drone) return;
    const isPlaying = droneNotesRef.current.length > 0;

    if (on && !isPlaying) {
      void (async () => {
        if (Tone.getContext().state !== 'running') {
          await Tone.start();
        }
        // Intent may have flipped while waiting for the user gesture.
        if (!droneDesiredRef.current) return;
        if (droneNotesRef.current.length > 0) return;
        const droneVolume = droneVolumeRef.current;
        if (droneVolume) {
          const now = Tone.now();
          droneVolume.volume.cancelScheduledValues(now);
          droneVolume.volume.setValueAtTime(DRONE_BASELINE_DB, now);
        }
        const note = computeRootMidi(droneRootPcRef.current, droneOctaveRef.current);
        drone.triggerAttack([midiToFreq(note)]);
        droneNotesRef.current = [note];
        setIsReady(true);
      })();
    } else if (!on && isPlaying) {
      drone.triggerRelease(droneNotesRef.current.map(midiToFreq));
      droneNotesRef.current = [];
    }
  }, []);

  return {
    activeChord,
    ducked,
    droneActive,
    isReady,
    latched,
    playChord,
    refreshVoicing,
    releaseChord,
    retuneDrone,
    setDrone,
    setDucked,
    setShimmerFeedback,
    toggleLatch,
  };
}
