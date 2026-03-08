import { z } from 'zod';

// Constants
export const DRUM_LOOPER_VERSION = 1;
export const MAX_BPM = 300;
export const MIN_BPM = 20;

// Schemas
export const drumTrackSchema = z.object({
  id: z.string().min(1),
  mute: z.boolean().default(false),
  name: z.string().min(1),
  nudgeMs: z.number().min(-80).max(80).default(0),
  pan: z.number().min(-1).max(1).default(0),
  samplePath: z.string().min(1),
  solo: z.boolean().default(false),
  volume: z.number().min(0).max(1).default(0.8),
});

export const drumSectionSchema = z.object({
  bars: z.number().int().min(1).max(16).default(1),
  beatsPerBar: z.number().int().min(1).max(32).default(4),
  id: z.string().min(1),
  name: z.string().min(1),
  pattern: z.record(z.string(), z.array(z.number().int().min(0))),
  repeats: z.number().int().min(1).max(32).default(1),
  stepsPerBeat: z.number().int().min(1).max(8).default(4),
  swing: z.number().min(0).max(0.75).default(0),
});

export const drumProjectSchema = z.object({
  bpm: z.number().int().min(MIN_BPM).max(MAX_BPM).default(120),
  masterVolume: z.number().min(0).max(1).default(0.8),
  sections: z.array(drumSectionSchema).min(1),
  tracks: z.array(drumTrackSchema),
  version: z.literal(DRUM_LOOPER_VERSION),
});

// Types
export type DrumProject = z.infer<typeof drumProjectSchema>;
export type DrumSection = z.infer<typeof drumSectionSchema>;
export type DrumTrack = z.infer<typeof drumTrackSchema>;
