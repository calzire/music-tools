import { NOTE_STRINGS } from '@/lib/tuner-utils';

// Types
export type Key = (typeof NOTE_STRINGS)[number];
export type Mode = 'major' | 'minor';
export type Variant = 'triad' | 'sus4' | 'add9';
export type ChordQuality = 'maj' | 'min' | 'dim';

export interface Chord {
  degree: number;
  name: string;
  quality: ChordQuality;
  roman: string;
  rootPc: number;
}

// Constants
export { NOTE_STRINGS as KEYS };

export const MODES = ['major', 'minor'] as const;
export const VARIANTS = ['triad', 'sus4', 'add9'] as const;
export const SYNTH_PRESETS = ['pad', 'organ', 'bell'] as const;

export type SynthPreset = (typeof SYNTH_PRESETS)[number];

const MAJOR_STEPS = [0, 2, 4, 5, 7, 9, 11] as const;
const MINOR_STEPS = [0, 2, 3, 5, 7, 8, 10] as const;

const MAJOR_QUALITIES: readonly ChordQuality[] = ['maj', 'min', 'min', 'maj', 'maj', 'min', 'dim'];
const MINOR_QUALITIES: readonly ChordQuality[] = ['min', 'dim', 'maj', 'min', 'min', 'maj', 'maj'];

const ROMAN_MAJOR = ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°'] as const;
const ROMAN_MINOR = ['i', 'ii°', 'III', 'iv', 'v', 'VI', 'VII'] as const;

const QUALITY_INTERVALS: Record<ChordQuality, readonly [number, number]> = {
  maj: [4, 7],
  min: [3, 7],
  dim: [3, 6],
};

const SUS4_INTERVALS: readonly [number, number] = [5, 7];
const ADD9_SEMITONES = 14;

// Helpers
function keyToPc(key: Key): number {
  const idx = NOTE_STRINGS.indexOf(key);
  if (idx === -1) throw new Error(`Unknown key: ${key}`);
  return idx;
}

function qualitySuffix(quality: ChordQuality): string {
  if (quality === 'maj') return '';
  if (quality === 'min') return 'm';
  return 'dim';
}

// Main API
export function getDiatonicChords(key: Key, mode: Mode): Chord[] {
  const tonic = keyToPc(key);
  const steps = mode === 'major' ? MAJOR_STEPS : MINOR_STEPS;
  const qualities = mode === 'major' ? MAJOR_QUALITIES : MINOR_QUALITIES;
  const romans = mode === 'major' ? ROMAN_MAJOR : ROMAN_MINOR;

  return steps.map((step, i) => {
    const rootPc = (tonic + step) % 12;
    const quality = qualities[i];
    return {
      degree: i + 1,
      name: `${NOTE_STRINGS[rootPc]}${qualitySuffix(quality)}`,
      quality,
      roman: romans[i],
      rootPc,
    };
  });
}

export function chordToMidi(
  chord: Chord,
  octave: number,
  variant: Variant,
  subRoot = false,
): number[] {
  const rootMidiNum = chord.rootPc + 12 * (octave + 1);
  let notes: number[];
  if (variant === 'sus4') {
    notes = [rootMidiNum, rootMidiNum + SUS4_INTERVALS[0], rootMidiNum + SUS4_INTERVALS[1]];
  } else {
    const [third, fifth] = QUALITY_INTERVALS[chord.quality];
    notes = [rootMidiNum, rootMidiNum + third, rootMidiNum + fifth];
    if (variant === 'add9') {
      notes.push(rootMidiNum + ADD9_SEMITONES);
    }
  }
  if (subRoot) {
    notes.unshift(rootMidiNum - 12);
  }
  return notes;
}

export function rootMidi(rootPc: number, octave: number): number {
  return rootPc + 12 * (octave + 1);
}
