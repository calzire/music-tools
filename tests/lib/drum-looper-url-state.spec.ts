import { compressToEncodedURIComponent } from 'lz-string';
import { describe, expect, it } from 'vitest';

import { decodeProjectFromState, encodeProjectToState } from '@/lib/drum-looper-url-state';
import type { DrumProject } from '@/lib/drum-looper-types';

const sampleProject: DrumProject = {
  version: 1,
  bpm: 96,
  masterVolume: 0.72,
  tracks: [
    {
      id: 'kick-track',
      name: 'Kick',
      samplePath: '/drum-looper/kit-a/kicks/kick-1.wav',
      volume: 0.85,
      pan: 0,
      nudgeMs: -4,
      mute: false,
      solo: false,
    },
  ],
  sections: [
    {
      id: 'section-a',
      name: 'Verse',
      bars: 2,
      beatsPerBar: 4,
      stepsPerBeat: 4,
      repeats: 2,
      swing: 0.15,
      pattern: {
        'kick-track': [0, 4, 8, 12],
      },
    },
  ],
};

describe('drum-looper URL state', () => {
  it('round-trips a valid project', () => {
    const encoded = encodeProjectToState(sampleProject);
    const decoded = decodeProjectFromState(encoded);

    expect(decoded).toEqual(sampleProject);
  });

  it('returns null for undefined state', () => {
    expect(decodeProjectFromState(undefined)).toBeNull();
  });

  it('returns null for non-compressed garbage state', () => {
    expect(decodeProjectFromState('not-a-valid-state')).toBeNull();
  });

  it('returns null when decompressed payload is not valid JSON', () => {
    const encodedInvalidJson = 'N4Igxg9gJgpiBcIB0BtEBfIA';
    expect(decodeProjectFromState(encodedInvalidJson)).toBeNull();
  });

  it('returns null when JSON shape fails schema validation', () => {
    const wrongShape = {
      ...sampleProject,
      bpm: 1000,
    };

    const encodedWrongShape = encodeProjectToState(wrongShape as DrumProject);
    expect(decodeProjectFromState(encodedWrongShape)).toBeNull();
  });

  it('applies schema defaults when decoding a minimal valid payload', () => {
    const minimalPayload = {
      version: 1,
      bpm: 120,
      masterVolume: 0.8,
      tracks: [
        {
          id: 'track-a',
          name: 'Kick',
          samplePath: '/drum-looper/kit-a/kicks/kick-1.wav',
        },
      ],
      sections: [
        {
          id: 'section-a',
          name: 'A',
          pattern: {
            'track-a': [0],
          },
        },
      ],
    };

    const encoded = compressToEncodedURIComponent(JSON.stringify(minimalPayload));
    const decoded = decodeProjectFromState(encoded);

    expect(decoded).not.toBeNull();
    expect(decoded?.tracks[0]).toMatchObject({
      mute: false,
      solo: false,
      nudgeMs: 0,
      pan: 0,
      volume: 0.8,
    });
    expect(decoded?.sections[0]).toMatchObject({
      bars: 1,
      beatsPerBar: 4,
      repeats: 1,
      stepsPerBeat: 4,
      swing: 0,
    });
  });
});
