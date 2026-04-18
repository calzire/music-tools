import { describe, expect, it } from 'vitest';

import { chordToMidi, getDiatonicChords, rootMidi } from '@/lib/worship-pad-utils';

describe('getDiatonicChords', () => {
  it('builds major diatonic chords in C', () => {
    const chords = getDiatonicChords('C', 'major');
    expect(chords.map(c => c.name)).toEqual(['C', 'Dm', 'Em', 'F', 'G', 'Am', 'Bdim']);
    expect(chords.map(c => c.roman)).toEqual(['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°']);
    expect(chords.map(c => c.quality)).toEqual([
      'maj',
      'min',
      'min',
      'maj',
      'maj',
      'min',
      'dim',
    ]);
  });

  it('builds natural minor diatonic chords in A', () => {
    const chords = getDiatonicChords('A', 'minor');
    expect(chords.map(c => c.name)).toEqual(['Am', 'Bdim', 'C', 'Dm', 'Em', 'F', 'G']);
    expect(chords.map(c => c.roman)).toEqual(['i', 'ii°', 'III', 'iv', 'v', 'VI', 'VII']);
  });

  it('wraps pitch classes past B', () => {
    const chords = getDiatonicChords('G', 'major');
    expect(chords[3].name).toBe('C');
    expect(chords[4].name).toBe('D');
  });
});

describe('chordToMidi', () => {
  const [c, , , , g] = getDiatonicChords('C', 'major');

  it('returns C major triad in octave 3', () => {
    expect(chordToMidi(c, 3, 'triad')).toEqual([48, 52, 55]);
  });

  it('replaces the 3rd with a 4th for sus4', () => {
    expect(chordToMidi(c, 3, 'sus4')).toEqual([48, 53, 55]);
  });

  it('appends the 9th for add9', () => {
    expect(chordToMidi(c, 3, 'add9')).toEqual([48, 52, 55, 62]);
  });

  it('handles minor triads (Bdim as dim)', () => {
    const bdim = getDiatonicChords('C', 'major')[6];
    expect(chordToMidi(bdim, 3, 'triad')).toEqual([59, 62, 65]);
  });

  it('respects octave placement for V', () => {
    expect(chordToMidi(g, 2, 'triad')).toEqual([43, 47, 50]);
  });

  it('prepends root-12 when subRoot is enabled', () => {
    expect(chordToMidi(c, 3, 'triad', true)).toEqual([36, 48, 52, 55]);
    expect(chordToMidi(c, 3, 'sus4', true)).toEqual([36, 48, 53, 55]);
    expect(chordToMidi(c, 3, 'add9', true)).toEqual([36, 48, 52, 55, 62]);
  });
});

describe('rootMidi', () => {
  it('maps pitch class + octave to MIDI number (C4 = 60)', () => {
    expect(rootMidi(0, 4)).toBe(60);
    expect(rootMidi(9, 4)).toBe(69);
  });
});
