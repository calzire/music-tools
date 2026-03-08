import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';

import { drumProjectSchema, type DrumProject } from '@/lib/drum-looper-types';

// Main functions
export function decodeProjectFromState(state: string | undefined): DrumProject | null {
  if (!state) return null;

  const decompressed = decompressFromEncodedURIComponent(state);
  if (!decompressed) return null;

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(decompressed);
  } catch {
    return null;
  }

  const parsed = drumProjectSchema.safeParse(parsedJson);
  return parsed.success ? parsed.data : null;
}

export function encodeProjectToState(project: DrumProject): string {
  return compressToEncodedURIComponent(JSON.stringify(project));
}
