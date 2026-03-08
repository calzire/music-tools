import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { zodValidator } from '@tanstack/zod-adapter';
import { ChevronDown, ChevronUp, Copy, Pause, Play, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { z } from 'zod';

import { drumKits, type DrumKitManifestItem } from '@/drumLooper.gen';
import { Button } from '@/components/ui/button';
import { useDrumEngine } from '@/hooks/use-drum-engine';
import { useRegisterShortcuts } from '@/hooks/use-keyboard-shortcuts';
import { useTapTempo } from '@/hooks/use-tap-tempo';
import {
  MAX_BPM,
  MIN_BPM,
  type DrumProject,
  type DrumSection,
  type DrumTrack,
  drumProjectSchema,
} from '@/lib/drum-looper-types';
import { decodeProjectFromState, encodeProjectToState } from '@/lib/drum-looper-url-state';
import { cn } from '@/lib/utils';

// Constants
const DEFAULT_BEATS_PER_BAR = 4;
const DEFAULT_BARS = 1;
const DEFAULT_BPM = 120;
const DEFAULT_MASTER_VOLUME = 0.8;
const DEFAULT_REPEATS = 2;
const DEFAULT_STEPS_PER_BEAT = 4;

const searchSchema = z.object({
  state: z.string().optional(),
});

// Helper functions
function getStepCount(section: DrumSection): number {
  return section.beatsPerBar * section.bars * section.stepsPerBeat;
}

function generateId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeStepIndexes(stepIndexes: number[], maxSteps: number): number[] {
  return [...new Set(stepIndexes.filter(step => step >= 0 && step < maxSteps))].sort(
    (a, b) => a - b,
  );
}

function normalizeSection(section: DrumSection): DrumSection {
  const stepCount = getStepCount(section);

  return {
    ...section,
    pattern: Object.fromEntries(
      Object.entries(section.pattern).map(([trackId, steps]) => [
        trackId,
        normalizeStepIndexes(steps, stepCount),
      ]),
    ),
  };
}

function createTrackFromSample(sample: DrumKitManifestItem): DrumTrack {
  return {
    id: generateId('track'),
    mute: false,
    name: sample.name,
    nudgeMs: 0,
    pan: 0,
    samplePath: sample.path,
    solo: false,
    volume: 0.8,
  };
}

function detectTrackRole(track: DrumTrack): 'hat' | 'kick' | 'other' | 'perc' | 'snare' {
  const text = `${track.name} ${track.samplePath}`.toLowerCase();

  if (text.includes('kick') || text.includes('bass drum') || /\bbd\b/.test(text)) return 'kick';
  if (text.includes('snare') || text.includes('clap') || text.includes('rim')) return 'snare';
  if (
    text.includes('hat') ||
    text.includes('hihat') ||
    text.includes('hh') ||
    text.includes('cymbal')
  )
    return 'hat';
  if (
    text.includes('perc') ||
    text.includes('percussion') ||
    text.includes('tom') ||
    text.includes('toms') ||
    text.includes('shaker')
  )
    return 'perc';

  return 'other';
}

function createStarterPattern(track: DrumTrack, stepsPerBar: number): number[] {
  const role = detectTrackRole(track);

  if (role === 'kick') return [0, Math.floor(stepsPerBar / 2)];
  if (role === 'snare') return [Math.floor(stepsPerBar / 4), Math.floor((stepsPerBar * 3) / 4)];
  if (role === 'hat') return Array.from({ length: Math.ceil(stepsPerBar / 2) }, (_, i) => i * 2);
  if (role === 'perc') return [Math.floor(stepsPerBar / 2), Math.max(0, stepsPerBar - 2)];

  return [];
}

function createStarterPatternMap(
  tracks: DrumTrack[],
  stepsPerBar: number,
): Record<string, number[]> {
  const usedRoles = new Set<'hat' | 'kick' | 'perc' | 'snare'>();
  const patternByTrack: Record<string, number[]> = {};

  for (const track of tracks) {
    const role = detectTrackRole(track);

    if (role === 'other') {
      patternByTrack[track.id] = [];
      continue;
    }

    if (usedRoles.has(role)) {
      patternByTrack[track.id] = [];
      continue;
    }

    usedRoles.add(role);
    patternByTrack[track.id] = createStarterPattern(track, stepsPerBar);
  }

  return patternByTrack;
}

function createSection(name: string, tracks: DrumTrack[], withStarterPattern = false): DrumSection {
  const stepsPerBar = DEFAULT_BEATS_PER_BAR * DEFAULT_STEPS_PER_BEAT;
  const starterPattern = withStarterPattern
    ? createStarterPatternMap(tracks, stepsPerBar)
    : Object.fromEntries(tracks.map(track => [track.id, []]));

  return {
    bars: DEFAULT_BARS,
    beatsPerBar: DEFAULT_BEATS_PER_BAR,
    id: generateId('section'),
    name,
    pattern: starterPattern,
    repeats: DEFAULT_REPEATS,
    stepsPerBeat: DEFAULT_STEPS_PER_BEAT,
    swing: 0,
  };
}

function syncPatternTracks(section: DrumSection, tracks: DrumTrack[]): DrumSection {
  const trackIds = new Set(tracks.map(track => track.id));
  const nextPattern: Record<string, number[]> = {};

  for (const track of tracks) {
    nextPattern[track.id] = section.pattern[track.id] ?? [];
  }

  for (const [trackId, steps] of Object.entries(nextPattern)) {
    if (!trackIds.has(trackId)) {
      delete nextPattern[trackId];
      continue;
    }
    nextPattern[trackId] = steps;
  }

  return {
    ...section,
    pattern: nextPattern,
  };
}

function createDefaultProject(): DrumProject {
  const firstKit = drumKits[0];
  const initialSamples =
    firstKit && firstKit.starterSamples.length > 0 ? firstKit.starterSamples : firstKit?.samples;
  const tracks =
    initialSamples
      ?.map(createTrackFromSample)
      .filter(track => detectTrackRole(track) !== 'other') ?? [];
  const section = createSection('Verse', tracks, true);

  return {
    bpm: DEFAULT_BPM,
    masterVolume: DEFAULT_MASTER_VOLUME,
    sections: [section],
    tracks,
    version: 1,
  };
}

function useInitialProject(): { error: string | null; project: DrumProject } {
  const search = Route.useSearch();

  return useMemo(() => {
    const decoded = decodeProjectFromState(search.state);
    if (!decoded) {
      return {
        error: search.state ? 'Could not parse shared URL state.' : null,
        project: createDefaultProject(),
      };
    }

    const parsed = drumProjectSchema.safeParse(decoded);
    if (!parsed.success) {
      return { error: 'Shared URL state is invalid.', project: createDefaultProject() };
    }

    const normalizedProject = {
      ...parsed.data,
      sections: parsed.data.sections.map(normalizeSection),
    };

    return { error: null, project: normalizedProject };
  }, [search.state]);
}

// Main component
function DrumLooperPage() {
  const navigate = useNavigate({ from: '/drum-looper' });
  const search = Route.useSearch();
  const initialProject = useInitialProject();

  const [project, setProject] = useState<DrumProject>(initialProject.project);
  const [pageError, setPageError] = useState<string | null>(initialProject.error);
  const [selectedKitId, setSelectedKitId] = useState<string>(drumKits[0]?.id ?? '');
  const [selectedSamplePath, setSelectedSamplePath] = useState<string>('');
  const [showTrackControls, setShowTrackControls] = useState(false);
  const [activeSectionId, setActiveSectionId] = useState<string>(
    initialProject.project.sections[0].id,
  );

  const serializedStateRef = useRef(search.state ?? '');
  const dragActionRef = useRef<'off' | 'on' | null>(null);
  const isPointerDownRef = useRef(false);
  const touchedStepsRef = useRef<Set<string>>(new Set());

  const {
    bpm: tappedBpm,
    tap,
    tapCount,
  } = useTapTempo({
    onTempoChange: bpm => {
      setProject(prev => ({ ...prev, bpm }));
    },
  });

  const {
    cursor,
    error: playbackError,
    isBuffering,
    isPlaying,
    toggle,
  } = useDrumEngine({ project });

  useRegisterShortcuts([
    { key: 'Space', label: 'Play / Stop' },
    { key: 'T', label: 'Tap tempo' },
  ]);

  const selectedKit = useMemo(
    () => drumKits.find(kit => kit.id === selectedKitId) ?? drumKits[0] ?? null,
    [selectedKitId],
  );

  const availableSamples = useMemo(() => selectedKit?.samples ?? [], [selectedKit]);

  const effectiveSelectedSamplePath = useMemo(() => {
    if (selectedSamplePath && availableSamples.some(sample => sample.path === selectedSamplePath)) {
      return selectedSamplePath;
    }
    return availableSamples[0]?.path ?? '';
  }, [availableSamples, selectedSamplePath]);

  const activeSectionIndex = useMemo(() => {
    const foundIndex = project.sections.findIndex(section => section.id === activeSectionId);
    return foundIndex >= 0 ? foundIndex : 0;
  }, [activeSectionId, project.sections]);

  const activeSection = project.sections[activeSectionIndex] ?? project.sections[0];

  const isProjectTooLarge = useMemo(() => {
    const encoded = encodeProjectToState(project);
    return encoded.length > 1800;
  }, [project]);

  const updateSearchState = useCallback(
    (state: string) => {
      navigate({
        replace: true,
        search: prev => ({ ...prev, state }),
      });
    },
    [navigate],
  );

  useEffect(() => {
    const encoded = encodeProjectToState(project);
    if (encoded === serializedStateRef.current) return;

    serializedStateRef.current = encoded;
    updateSearchState(encoded);
  }, [project, updateSearchState]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      const isTextInput =
        target.tagName === 'INPUT' &&
        (target as HTMLInputElement).type !== 'range' &&
        (target as HTMLInputElement).type !== 'checkbox' &&
        (target as HTMLInputElement).type !== 'radio';
      const isBlockedElement =
        isTextInput || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA';

      if (isBlockedElement || target.isContentEditable) {
        return;
      }

      if (event.code === 'Space') {
        event.preventDefault();
        void toggle();
      }

      if (event.key.toLowerCase() === 't') {
        event.preventDefault();
        tap();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [tap, toggle]);

  const applyTracks = useCallback((tracks: DrumTrack[]) => {
    setProject(prev => ({
      ...prev,
      sections: prev.sections.map(section => syncPatternTracks(section, tracks)),
      tracks,
    }));
  }, []);

  const loadKitReplace = useCallback(() => {
    if (!selectedKit) return;

    const kitSamples =
      selectedKit.starterSamples.length > 0 ? selectedKit.starterSamples : selectedKit.samples;
    const tracks = kitSamples.map(createTrackFromSample);
    applyTracks(tracks);
  }, [applyTracks, selectedKit]);

  const loadKitAdd = useCallback(() => {
    if (!selectedKit) return;

    setProject(prev => {
      const kitSamples =
        selectedKit.starterSamples.length > 0 ? selectedKit.starterSamples : selectedKit.samples;
      const existingPaths = new Set(prev.tracks.map(track => track.samplePath));
      const appendedTracks = kitSamples
        .filter(sample => !existingPaths.has(sample.path))
        .map(createTrackFromSample);
      const tracks = [...prev.tracks, ...appendedTracks];

      return {
        ...prev,
        sections: prev.sections.map(section => syncPatternTracks(section, tracks)),
        tracks,
      };
    });
  }, [selectedKit]);

  const addSingleSample = useCallback(() => {
    if (!effectiveSelectedSamplePath) return;

    const sample = drumKits
      .flatMap(kit => kit.samples)
      .find(manifestSample => manifestSample.path === effectiveSelectedSamplePath);

    if (!sample) return;

    setProject(prev => {
      if (prev.tracks.some(track => track.samplePath === sample.path)) {
        return prev;
      }

      const tracks = [...prev.tracks, createTrackFromSample(sample)];
      return {
        ...prev,
        sections: prev.sections.map(section => syncPatternTracks(section, tracks)),
        tracks,
      };
    });
  }, [effectiveSelectedSamplePath]);

  const clearTracks = useCallback(() => {
    applyTracks([]);
  }, [applyTracks]);

  const removeTrack = useCallback((trackId: string) => {
    setProject(prev => {
      const tracks = prev.tracks.filter(track => track.id !== trackId);
      return {
        ...prev,
        sections: prev.sections.map(section => syncPatternTracks(section, tracks)),
        tracks,
      };
    });
  }, []);

  const updateTrack = useCallback((trackId: string, patch: Partial<DrumTrack>) => {
    setProject(prev => ({
      ...prev,
      tracks: prev.tracks.map(track => (track.id === trackId ? { ...track, ...patch } : track)),
    }));
  }, []);

  const addSection = useCallback(() => {
    setProject(prev => {
      const sectionNumber = prev.sections.length + 1;
      const section = createSection(`Section ${sectionNumber}`, prev.tracks);
      return {
        ...prev,
        sections: [...prev.sections, section],
      };
    });
  }, []);

  const removeSection = useCallback((sectionId: string) => {
    setProject(prev => {
      if (prev.sections.length <= 1) return prev;

      const sections = prev.sections.filter(section => section.id !== sectionId);
      return {
        ...prev,
        sections,
      };
    });
  }, []);

  const updateSection = useCallback((sectionId: string, patch: Partial<DrumSection>) => {
    setProject(prev => ({
      ...prev,
      sections: prev.sections.map(section => {
        if (section.id !== sectionId) return section;

        const nextSection = normalizeSection({ ...section, ...patch });
        return syncPatternTracks(nextSection, prev.tracks);
      }),
    }));
  }, []);

  const setStepState = useCallback(
    (sectionId: string, stepIndex: number, trackId: string, shouldBeActive: boolean) => {
      setProject(prev => ({
        ...prev,
        sections: prev.sections.map(section => {
          if (section.id !== sectionId) return section;

          const activeSteps = section.pattern[trackId] ?? [];
          const hasStep = activeSteps.includes(stepIndex);
          if (hasStep === shouldBeActive) return section;

          const updatedSteps = shouldBeActive
            ? [...activeSteps, stepIndex].sort((a, b) => a - b)
            : activeSteps.filter(step => step !== stepIndex);

          return {
            ...section,
            pattern: {
              ...section.pattern,
              [trackId]: updatedSteps,
            },
          };
        }),
      }));
    },
    [],
  );

  const stopDragPainting = useCallback(() => {
    dragActionRef.current = null;
    isPointerDownRef.current = false;
    touchedStepsRef.current.clear();
  }, []);

  const handleStepPointerDown = useCallback(
    (sectionId: string, stepIndex: number, trackId: string, isActive: boolean) => {
      const shouldActivate = !isActive;
      isPointerDownRef.current = true;
      dragActionRef.current = shouldActivate ? 'on' : 'off';
      touchedStepsRef.current.clear();
      touchedStepsRef.current.add(`${sectionId}:${trackId}:${stepIndex}`);
      setStepState(sectionId, stepIndex, trackId, shouldActivate);
    },
    [setStepState],
  );

  const handleStepPointerEnter = useCallback(
    (sectionId: string, stepIndex: number, trackId: string) => {
      if (!isPointerDownRef.current || !dragActionRef.current) return;

      const key = `${sectionId}:${trackId}:${stepIndex}`;
      if (touchedStepsRef.current.has(key)) return;
      touchedStepsRef.current.add(key);

      setStepState(sectionId, stepIndex, trackId, dragActionRef.current === 'on');
    },
    [setStepState],
  );

  useEffect(() => {
    const handlePointerUp = () => {
      stopDragPainting();
    };

    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);

    return () => {
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [stopDragPainting]);

  const copyShareUrl = useCallback(async () => {
    const encoded = encodeProjectToState(project);
    const url = `${window.location.origin}${window.location.pathname}${window.location.hash.split('?')[0]}?state=${encoded}`;
    await navigator.clipboard.writeText(url);
    setPageError('Share URL copied to clipboard.');
    window.setTimeout(() => setPageError(null), 1800);
  }, [project]);

  const activeStepCount = getStepCount(activeSection);

  return (
    <div className="mx-auto flex max-w-[1200px] flex-col gap-6">
      <section className="order-2 rounded-3xl border border-border/70 bg-card/80 p-4 shadow-sm sm:p-6">
        <h2 className="text-lg font-semibold">Transport + Drum Kits</h2>

        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <div className="space-y-2 rounded-2xl border border-border/70 bg-background/70 p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Transport
            </p>
            <label className="flex items-center justify-between text-sm">
              BPM
              <span className="font-semibold tabular-nums">{project.bpm}</span>
            </label>
            <input
              className="w-full"
              max={MAX_BPM}
              min={MIN_BPM}
              onChange={event => setProject(prev => ({ ...prev, bpm: Number(event.target.value) }))}
              type="range"
              value={project.bpm}
            />
            <div className="flex items-center gap-2">
              <Button onClick={tap} size="sm" variant="secondary">
                Tap Tempo
              </Button>
              <span className="text-xs text-muted-foreground">
                taps: {tapCount} {tappedBpm ? `(${tappedBpm} bpm)` : ''}
              </span>
            </div>
            <label className="mt-2 flex items-center justify-between text-sm">
              Master
              <span>{Math.round(project.masterVolume * 100)}%</span>
            </label>
            <input
              className="w-full"
              max={1}
              min={0}
              onChange={event =>
                setProject(prev => ({ ...prev, masterVolume: Number(event.target.value) }))
              }
              step={0.01}
              type="range"
              value={project.masterVolume}
            />
          </div>

          <div className="space-y-2 rounded-2xl border border-border/70 bg-background/70 p-3 md:col-span-2">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Drum Kits
            </p>
            <div className="grid gap-2 md:grid-cols-2">
              <label className="space-y-1 text-sm">
                Kit
                <select
                  className="w-full rounded-md border border-input bg-background px-2 py-2"
                  onChange={event => setSelectedKitId(event.target.value)}
                  value={selectedKitId}
                >
                  {drumKits.map(kit => (
                    <option key={kit.id} value={kit.id}>
                      {kit.name} ({kit.samples.length})
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1 text-sm">
                Single sample
                <select
                  className="w-full rounded-md border border-input bg-background px-2 py-2"
                  onChange={event => setSelectedSamplePath(event.target.value)}
                  value={effectiveSelectedSamplePath}
                >
                  {availableSamples.length === 0 ? (
                    <option value="">No audio in this kit</option>
                  ) : (
                    availableSamples.map(sample => (
                      <option key={sample.id} value={sample.path}>
                        {sample.name}
                      </option>
                    ))
                  )}
                </select>
              </label>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={loadKitReplace} size="sm" variant="secondary">
                Replace with kit
              </Button>
              <Button onClick={loadKitAdd} size="sm" variant="secondary">
                Add kit
              </Button>
              <Button onClick={addSingleSample} size="sm" variant="secondary">
                Add sample
              </Button>
              <Button className="gap-2" onClick={clearTracks} size="sm" variant="outline">
                <RotateCcw className="size-4" />
                Clear tracks
              </Button>
            </div>
          </div>
        </div>

        {(pageError || playbackError || isBuffering || isProjectTooLarge) && (
          <div className="mt-4 space-y-2 text-sm">
            {pageError && (
              <p className="rounded-lg border border-primary/30 bg-primary/10 px-3 py-2">
                {pageError}
              </p>
            )}
            {playbackError && (
              <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-destructive">
                {playbackError}
              </p>
            )}
            {isBuffering && (
              <p className="rounded-lg border border-border/70 bg-background/70 px-3 py-2">
                Loading audio buffers...
              </p>
            )}
            {isProjectTooLarge && (
              <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-amber-700 dark:text-amber-300">
                URL state is getting long. Consider reducing sections/tracks before sharing.
              </p>
            )}
          </div>
        )}
      </section>

      <section className="order-3 rounded-3xl border border-border/70 bg-card/80 p-4 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Sections</h2>
          <Button className="gap-2" onClick={addSection} size="sm" variant="outline">
            <Plus className="size-4" />
            Add section
          </Button>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {project.sections.map((section, index) => {
            const isActive = section.id === activeSection.id;
            const isPlayingSection = cursor?.sectionIndex === index;

            return (
              <button
                className={cn(
                  'rounded-lg border px-3 py-2 text-left text-sm transition-colors',
                  isActive
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border bg-background',
                  isPlayingSection && 'ring-2 ring-orange-400/70',
                )}
                key={section.id}
                onClick={() => setActiveSectionId(section.id)}
                type="button"
              >
                <div className="font-medium">{section.name}</div>
                <div className="text-xs text-muted-foreground">
                  {section.beatsPerBar}/{section.stepsPerBeat * 1} x {section.bars} bar(s), repeat{' '}
                  {section.repeats}
                </div>
              </button>
            );
          })}
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-5">
          <label className="space-y-1 text-sm">
            Name
            <input
              className="w-full rounded-md border border-input bg-background px-2 py-2"
              onChange={event => updateSection(activeSection.id, { name: event.target.value })}
              value={activeSection.name}
            />
          </label>
          <label className="space-y-1 text-sm">
            Beats / bar
            <input
              className="w-full rounded-md border border-input bg-background px-2 py-2"
              max={32}
              min={1}
              onChange={event =>
                updateSection(activeSection.id, { beatsPerBar: Number(event.target.value) || 1 })
              }
              type="number"
              value={activeSection.beatsPerBar}
            />
          </label>
          <label className="space-y-1 text-sm">
            Bars
            <input
              className="w-full rounded-md border border-input bg-background px-2 py-2"
              max={16}
              min={1}
              onChange={event =>
                updateSection(activeSection.id, { bars: Number(event.target.value) || 1 })
              }
              type="number"
              value={activeSection.bars}
            />
          </label>
          <label className="space-y-1 text-sm">
            Steps / beat
            <select
              className="w-full rounded-md border border-input bg-background px-2 py-2"
              onChange={event =>
                updateSection(activeSection.id, { stepsPerBeat: Number(event.target.value) || 1 })
              }
              value={activeSection.stepsPerBeat}
            >
              <option value={2}>2 (8th)</option>
              <option value={4}>4 (16th)</option>
              <option value={8}>8 (32nd)</option>
            </select>
          </label>
          <label className="space-y-1 text-sm">
            Repeats
            <div className="flex gap-2">
              <input
                className="w-full rounded-md border border-input bg-background px-2 py-2"
                max={32}
                min={1}
                onChange={event =>
                  updateSection(activeSection.id, { repeats: Number(event.target.value) || 1 })
                }
                type="number"
                value={activeSection.repeats}
              />
              <Button
                className="gap-2"
                disabled={project.sections.length === 1}
                onClick={() => removeSection(activeSection.id)}
                size="icon"
                title="Remove section"
                variant="outline"
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          </label>
        </div>

        <div className="mt-3">
          <label className="flex items-center justify-between text-sm">
            Swing ({Math.round(activeSection.swing * 100)}%)
            <span className="text-xs text-muted-foreground">off-beat delay</span>
          </label>
          <input
            className="w-full"
            max={0.75}
            min={0}
            onChange={event =>
              updateSection(activeSection.id, { swing: Number(event.target.value) })
            }
            step={0.01}
            type="range"
            value={activeSection.swing}
          />
        </div>
      </section>

      <section className="order-1 rounded-3xl border border-border/70 bg-card/80 p-4 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Drum Looper</h1>
            <p className="text-sm text-muted-foreground">
              Build section-based drum tracks, then share them as a URL.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              className="gap-2"
              onClick={() => void toggle()}
            >
              {isPlaying ? <Pause className="size-4" /> : <Play className="size-4" />}
              {isBuffering && !isPlaying ? 'Loading Samples...' : isPlaying ? 'Stop' : 'Play'}
            </Button>
            <Button className="gap-2" onClick={copyShareUrl} variant="outline">
              <Copy className="size-4" />
              Copy URL
            </Button>
          </div>
        </div>

        {project.tracks.length === 0 ? (
          <p className="mt-3 rounded-xl border border-border/70 bg-background/70 p-4 text-sm text-muted-foreground">
            No tracks loaded yet. Add a drum kit or single sample.
          </p>
        ) : (
          <div className="mt-4 space-y-4">
            <div className="overflow-x-auto rounded-xl border border-border/70 bg-background/60 p-2">
              <div className="min-w-max">
                <div
                  className="grid items-center gap-1"
                  style={{
                    gridTemplateColumns: `minmax(130px, 170px) repeat(${activeStepCount}, minmax(22px, 22px))`,
                  }}
                >
                  <div className="px-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Track
                  </div>
                  {Array.from({ length: activeStepCount }, (_, stepIndex) => (
                    <div
                      className={cn(
                        'flex h-6 items-center justify-center rounded text-[10px] text-muted-foreground',
                        stepIndex % activeSection.stepsPerBeat === 0 &&
                          'font-semibold text-foreground',
                        cursor?.sectionIndex === activeSectionIndex &&
                          cursor.stepIndex === stepIndex &&
                          'bg-primary/25 text-primary',
                      )}
                      key={`step-${stepIndex}`}
                    >
                      {stepIndex + 1}
                    </div>
                  ))}

                  {project.tracks.map(track => {
                    const activeSteps = activeSection.pattern[track.id] ?? [];

                    return (
                      <div className="contents" key={track.id}>
                        <div
                          className="flex h-8 items-center px-2 pr-3 text-sm"
                          key={`${track.id}-name`}
                          title={track.name}
                        >
                          <span className="block truncate">{track.name}</span>
                        </div>
                        {Array.from({ length: activeStepCount }, (_, stepIndex) => {
                          const isActive = activeSteps.includes(stepIndex);
                          const isPlayhead =
                            cursor?.sectionIndex === activeSectionIndex &&
                            cursor.stepIndex === stepIndex;

                          return (
                            <button
                              className={cn(
                                'h-8 w-[22px] touch-none select-none rounded border transition-colors',
                                isActive
                                  ? 'border-primary bg-primary/90'
                                  : 'border-border/80 bg-card hover:bg-accent',
                                isPlayhead && 'ring-2 ring-orange-400',
                              )}
                              key={`${track.id}-${stepIndex}`}
                              onPointerDown={() =>
                                handleStepPointerDown(
                                  activeSection.id,
                                  stepIndex,
                                  track.id,
                                  isActive,
                                )
                              }
                              onPointerEnter={() =>
                                handleStepPointerEnter(activeSection.id, stepIndex, track.id)
                              }
                              type="button"
                            />
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-border/70 bg-background/70 p-3">
              <Button
                className="flex w-full items-center justify-between rounded-xl border-2 border-primary/40 bg-primary/10 px-4 py-3 text-left text-primary hover:bg-primary/15"
                onClick={() => setShowTrackControls(prev => !prev)}
                type="button"
                variant="ghost"
              >
                <span className="text-sm font-semibold uppercase tracking-[0.12em]">
                  {showTrackControls ? 'Hide Track Controls' : 'Show Track Controls'}
                </span>
                {showTrackControls ? (
                  <ChevronUp className="size-5" />
                ) : (
                  <ChevronDown className="size-5" />
                )}
              </Button>

              {showTrackControls && (
                <div className="mt-3 space-y-2">
                  {project.tracks.map(track => (
                    <div
                      className="grid gap-2 rounded-xl border border-border/60 bg-card/60 p-3 md:grid-cols-8"
                      key={track.id}
                    >
                      <div className="md:col-span-2">
                        <p className="text-sm font-medium">{track.name}</p>
                        <p className="text-xs text-muted-foreground">{track.samplePath}</p>
                      </div>

                      <label className="space-y-1 text-xs md:col-span-2">
                        Volume {Math.round(track.volume * 100)}%
                        <input
                          className="w-full"
                          max={1}
                          min={0}
                          onChange={event =>
                            updateTrack(track.id, { volume: Number(event.target.value) })
                          }
                          step={0.01}
                          type="range"
                          value={track.volume}
                        />
                      </label>

                      <label className="space-y-1 text-xs md:col-span-2">
                        Nudge ({track.nudgeMs}ms)
                        <input
                          className="w-full"
                          max={80}
                          min={-80}
                          onChange={event =>
                            updateTrack(track.id, { nudgeMs: Number(event.target.value) })
                          }
                          step={1}
                          type="range"
                          value={track.nudgeMs}
                        />
                      </label>

                      <div className="flex items-center justify-end gap-2 md:col-span-2">
                        <Button
                          onClick={() => updateTrack(track.id, { mute: !track.mute })}
                          size="sm"
                          variant={track.mute ? 'default' : 'outline'}
                        >
                          Mute
                        </Button>
                        <Button
                          onClick={() => updateTrack(track.id, { solo: !track.solo })}
                          size="sm"
                          variant={track.solo ? 'default' : 'outline'}
                        >
                          Solo
                        </Button>
                        <Button onClick={() => removeTrack(track.id)} size="icon" variant="outline">
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

// Route export
export const Route = createFileRoute('/drum-looper')({
  component: DrumLooperPage,
  validateSearch: zodValidator(searchSchema),
});
