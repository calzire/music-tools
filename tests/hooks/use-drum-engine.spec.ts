import { describe, expect, it } from 'vitest';

import {
  getStepCount,
  getSwingOffsetSeconds,
  isStepActive,
  shouldPlayTrack,
} from '@/hooks/use-drum-engine';

describe('use-drum-engine helpers', () => {
  const section = {
    id: 'section-a',
    name: 'A',
    bars: 2,
    beatsPerBar: 4,
    stepsPerBeat: 4,
    repeats: 1,
    swing: 0.5,
    pattern: {
      'track-a': [0, 3, 7],
    },
  };

  const track = {
    id: 'track-a',
    name: 'Kick',
    samplePath: '/drum-looper/kit/kick.wav',
    mute: false,
    solo: false,
    volume: 0.8,
    pan: 0,
    nudgeMs: 0,
  };

  it('computes total step count for a section', () => {
    expect(getStepCount(section)).toBe(32);
  });

  it('detects active and inactive steps per track', () => {
    expect(isStepActive(track, section, 3)).toBe(true);
    expect(isStepActive(track, section, 2)).toBe(false);
  });

  it('respects mute and solo rules', () => {
    expect(shouldPlayTrack({ ...track, mute: false, solo: false }, false)).toBe(true);
    expect(shouldPlayTrack({ ...track, mute: true, solo: false }, false)).toBe(false);

    expect(shouldPlayTrack({ ...track, mute: false, solo: true }, true)).toBe(true);
    expect(shouldPlayTrack({ ...track, mute: false, solo: false }, true)).toBe(false);
    expect(shouldPlayTrack({ ...track, mute: true, solo: true }, true)).toBe(false);
  });

  it('applies swing only to off-subdivision steps', () => {
    const stepDuration = 0.125;

    expect(getSwingOffsetSeconds({ ...section, swing: 0 }, 1, stepDuration)).toBe(0);
    expect(getSwingOffsetSeconds(section, 0, stepDuration)).toBe(0);
    expect(getSwingOffsetSeconds(section, 1, stepDuration)).toBeCloseTo(stepDuration * 0.5 * 0.5);
  });
});
