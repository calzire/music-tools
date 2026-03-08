import { describe, expect, it } from 'vitest';

import {
  MAX_BPM,
  MIN_BPM,
  drumProjectSchema,
  drumSectionSchema,
  drumTrackSchema,
} from '@/lib/drum-looper-types';

describe('drum-looper schemas', () => {
  it('applies track defaults', () => {
    const parsed = drumTrackSchema.parse({
      id: 't1',
      name: 'Kick',
      samplePath: '/drum-looper/kit/kick.wav',
    });

    expect(parsed).toMatchObject({
      mute: false,
      solo: false,
      nudgeMs: 0,
      pan: 0,
      volume: 0.8,
    });
  });

  it('applies section defaults', () => {
    const parsed = drumSectionSchema.parse({
      id: 's1',
      name: 'Verse',
      pattern: {},
    });

    expect(parsed).toMatchObject({
      bars: 1,
      beatsPerBar: 4,
      repeats: 1,
      stepsPerBeat: 4,
      swing: 0,
    });
  });

  it('enforces bpm boundaries', () => {
    const baseProject = {
      version: 1 as const,
      bpm: 120,
      masterVolume: 0.8,
      tracks: [],
      sections: [
        {
          id: 's1',
          name: 'Verse',
          pattern: {},
        },
      ],
    };

    expect(drumProjectSchema.safeParse({ ...baseProject, bpm: MIN_BPM - 1 }).success).toBe(false);
    expect(drumProjectSchema.safeParse({ ...baseProject, bpm: MAX_BPM + 1 }).success).toBe(false);
    expect(drumProjectSchema.safeParse({ ...baseProject, bpm: MIN_BPM }).success).toBe(true);
    expect(drumProjectSchema.safeParse({ ...baseProject, bpm: MAX_BPM }).success).toBe(true);
  });

  it('rejects out-of-range pan and swing', () => {
    expect(
      drumTrackSchema.safeParse({
        id: 't1',
        name: 'Kick',
        samplePath: '/drum-looper/kit/kick.wav',
        pan: 2,
      }).success,
    ).toBe(false);

    expect(
      drumSectionSchema.safeParse({
        id: 's1',
        name: 'Verse',
        pattern: {},
        swing: 1,
      }).success,
    ).toBe(false);
  });
});
