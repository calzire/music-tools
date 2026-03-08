// Types
interface TempoMarking {
  maxBpm: number;
  minBpm: number;
  name: string;
}

// Constants
const TEMPO_MARKINGS: TempoMarking[] = [
  { maxBpm: 24, minBpm: 20, name: 'Larghissimo' },
  { maxBpm: 40, minBpm: 25, name: 'Grave' },
  { maxBpm: 60, minBpm: 41, name: 'Largo' },
  { maxBpm: 66, minBpm: 61, name: 'Larghetto' },
  { maxBpm: 76, minBpm: 67, name: 'Adagio' },
  { maxBpm: 80, minBpm: 77, name: 'Adagietto' },
  { maxBpm: 108, minBpm: 81, name: 'Andante' },
  { maxBpm: 120, minBpm: 109, name: 'Moderato' },
  { maxBpm: 156, minBpm: 121, name: 'Allegro' },
  { maxBpm: 176, minBpm: 157, name: 'Vivace' },
  { maxBpm: 200, minBpm: 177, name: 'Presto' },
  { maxBpm: 300, minBpm: 201, name: 'Prestissimo' },
];

// Helper functions
export function getTempoName(bpm: number): string {
  const marking = TEMPO_MARKINGS.find(m => bpm >= m.minBpm && bpm <= m.maxBpm);
  return marking?.name ?? '';
}

export function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Time signatures with common subdivisions
// The subdivision array indicates how beats are grouped
// e.g., 6/4 (3,3) means beats 1-3 and 4-6 are grouped, with accents on beats 1 and 4
export const TIME_SIGNATURES = [
  // Simple meters
  { beats: 4, label: '4/4', subdivision: [4] },
  { beats: 4, label: '4/4 (2,2)', subdivision: [2, 2] },
  { beats: 1, label: '1/4', subdivision: [1] },
  { beats: 2, label: '2/4', subdivision: [2] },
  { beats: 2, label: '2/2', subdivision: [2] },
  { beats: 3, label: '3/4', subdivision: [3] },
  { beats: 3, label: '3/8', subdivision: [3] },
  // Compound meters
  { beats: 5, label: '5/4 (2,3)', subdivision: [2, 3] },
  { beats: 5, label: '5/4 (3,2)', subdivision: [3, 2] },
  { beats: 5, label: '5/8 (2,3)', subdivision: [2, 3] },
  { beats: 5, label: '5/8 (3,2)', subdivision: [3, 2] },
  { beats: 6, label: '6/4', subdivision: [6] },
  { beats: 6, label: '6/4 (3,3)', subdivision: [3, 3] },
  { beats: 6, label: '6/4 (2,2,2)', subdivision: [2, 2, 2] },
  { beats: 6, label: '6/8', subdivision: [6] },
  { beats: 6, label: '6/8 (3,3)', subdivision: [3, 3] },
  { beats: 7, label: '7/4 (4,3)', subdivision: [4, 3] },
  { beats: 7, label: '7/4 (3,4)', subdivision: [3, 4] },
  { beats: 7, label: '7/8 (2,2,3)', subdivision: [2, 2, 3] },
  { beats: 7, label: '7/8 (3,2,2)', subdivision: [3, 2, 2] },
  { beats: 7, label: '7/8 (2,3,2)', subdivision: [2, 3, 2] },
  { beats: 8, label: '8/8 (3,3,2)', subdivision: [3, 3, 2] },
  { beats: 8, label: '8/8 (3,2,3)', subdivision: [3, 2, 3] },
  { beats: 8, label: '8/8 (2,3,3)', subdivision: [2, 3, 3] },
  { beats: 9, label: '9/8 (3,3,3)', subdivision: [3, 3, 3] },
  { beats: 9, label: '9/8 (2,2,2,3)', subdivision: [2, 2, 2, 3] },
  { beats: 10, label: '10/8 (3,3,2,2)', subdivision: [3, 3, 2, 2] },
  { beats: 10, label: '10/8 (2,3,2,3)', subdivision: [2, 3, 2, 3] },
  { beats: 11, label: '11/8 (3,3,3,2)', subdivision: [3, 3, 3, 2] },
  { beats: 11, label: '11/8 (2,2,3,2,2)', subdivision: [2, 2, 3, 2, 2] },
  { beats: 12, label: '12/8 (3,3,3,3)', subdivision: [3, 3, 3, 3] },
  { beats: 12, label: '12/8 (4,4,4)', subdivision: [4, 4, 4] },
  { beats: 13, label: '13/8 (3,3,3,2,2)', subdivision: [3, 3, 3, 2, 2] },
  { beats: 15, label: '15/8 (3,3,3,3,3)', subdivision: [3, 3, 3, 3, 3] },
] as const;

export type TimeSignature = (typeof TIME_SIGNATURES)[number];

/**
 * Get the accent beats from a time signature's subdivision.
 * Returns an array of beat indices (0-based) that should be accented.
 * e.g., 6/4 (3,3) -> [0, 3] (beats 1 and 4 are accented)
 */
export function getAccentBeats(subdivision: readonly number[]): number[] {
  const accents: number[] = [];
  let position = 0;
  for (const group of subdivision) {
    accents.push(position);
    position += group;
  }
  return accents;
}

/**
 * Check if a beat is an accent beat based on subdivision.
 */
export function isAccentBeat(beat: number, subdivision: readonly number[]): boolean {
  const accents = getAccentBeats(subdivision);
  return accents.includes(beat);
}

/**
 * Check if a beat is the first beat (downbeat).
 */
export function isDownbeat(beat: number): boolean {
  return beat === 0;
}
