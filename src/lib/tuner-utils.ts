/**
 * Tuner note/frequency math. Reference: https://github.com/qiuxiang/tuner
 */

export const NOTE_STRINGS = [
  'C',
  'C♯',
  'D',
  'D♯',
  'E',
  'F',
  'F♯',
  'G',
  'G♯',
  'A',
  'A♯',
  'B',
] as const;

const SEMITONE_A4 = 69; // MIDI note number for A4

/**
 * Get note index (MIDI-like) from frequency.
 * note = 12 * log2(f / middleA) + 69
 */
export function getNote(frequency: number, middleA: number): number {
  const note = 12 * (Math.log(frequency / middleA) / Math.LN2);
  return Math.round(note) + SEMITONE_A4;
}

/**
 * Get standard frequency in Hz for a note index.
 */
export function getStandardFrequency(note: number, middleA: number): number {
  return middleA * Math.pow(2, (note - SEMITONE_A4) / 12);
}

/**
 * Get cents difference between measured frequency and the note's standard frequency.
 * Positive = sharp, negative = flat.
 */
export function getCents(frequency: number, note: number, middleA: number): number {
  const standard = getStandardFrequency(note, middleA);
  return Math.floor((1200 * Math.log(frequency / standard)) / Math.LN2);
}

export interface DetectedNote {
  name: (typeof NOTE_STRINGS)[number];
  value: number;
  cents: number;
  octave: number;
  frequency: number;
}

export function frequencyToNote(frequency: number, middleA: number): DetectedNote {
  const value = getNote(frequency, middleA);
  const name = NOTE_STRINGS[value % 12];
  const octave = Math.floor(value / 12) - 1;
  const cents = getCents(frequency, value, middleA);
  return { name, value, cents, octave, frequency };
}
