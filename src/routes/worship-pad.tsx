import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { zodValidator } from '@tanstack/zod-adapter';
import {
  Layers,
  Minus,
  Plus,
  Settings,
  Sparkles,
  Stars,
  VolumeX,
  Waves,
  Wind,
} from 'lucide-react';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useRegisterShortcuts } from '@/hooks/use-keyboard-shortcuts';
import { useWorshipPad, type PadSettings } from '@/hooks/use-worship-pad';
import { cn } from '@/lib/utils';
import {
  KEYS,
  MODES,
  SYNTH_PRESETS,
  VARIANTS,
  type Chord,
  type Key,
  type Mode,
  type SynthPreset,
  type Variant,
  getDiatonicChords,
} from '@/lib/worship-pad-utils';

// Types
interface SearchParams {
  attack?: number;
  drone?: boolean;
  key?: Key;
  mode?: Mode;
  octave?: number;
  preset?: SynthPreset;
  release?: number;
  reverb?: number;
  shimmer?: boolean;
  shimmerReverb?: number;
  subRoot?: boolean;
  variant?: Variant;
  volume?: number;
}

interface ChordButtonProps {
  active: boolean;
  chord: Chord;
  onPress: () => void;
}

// Constants
const DEFAULT_KEY: Key = 'C';
const DEFAULT_MODE: Mode = 'major';
const DEFAULT_VARIANT: Variant = 'triad';
const DEFAULT_OCTAVE = 4;
const DEFAULT_VOLUME = 0.5;
const DEFAULT_REVERB = 0.9;
const DEFAULT_ATTACK = 2;
const DEFAULT_RELEASE = 3;
const DEFAULT_SUB_ROOT = true;
const DEFAULT_DRONE = false;
const DEFAULT_SHIMMER = false;
const DEFAULT_SHIMMER_REVERB = 0.15;
const DEFAULT_PRESET: SynthPreset = 'pad';

const OCTAVE_MIN = 1;
const OCTAVE_MAX = 4;
const VOLUME_STEP = 0.05;

const searchSchema = z.object({
  attack: z.number().min(0.1).max(4).optional(),
  drone: z.boolean().optional(),
  key: z.enum(KEYS).optional(),
  mode: z.enum(MODES).optional(),
  octave: z.number().int().min(OCTAVE_MIN).max(OCTAVE_MAX).optional(),
  preset: z.enum(SYNTH_PRESETS).optional(),
  release: z.number().min(0.3).max(6).optional(),
  reverb: z.number().min(0).max(1).optional(),
  shimmer: z.boolean().optional(),
  shimmerReverb: z.number().min(0).max(0.85).optional(),
  subRoot: z.boolean().optional(),
  variant: z.enum(VARIANTS).optional(),
  volume: z.number().min(0).max(1).optional(),
});

// Helpers
function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

// Subcomponents
function ChordButton({ active, chord, onPress }: ChordButtonProps) {
  const deEmphasised = chord.quality === 'dim';
  return (
    <button
      type="button"
      onPointerDown={event => {
        event.currentTarget.setPointerCapture(event.pointerId);
        onPress();
      }}
      className={cn(
        'group flex flex-col items-center justify-center gap-1 rounded-2xl border px-2 py-5 shadow-sm transition-all select-none',
        'touch-none active:scale-[0.97]',
        active
          ? 'border-primary/60 bg-primary/15 text-foreground ring-2 ring-primary/50'
          : 'border-border/70 bg-card hover:bg-accent/60',
        deEmphasised && !active && 'opacity-70',
      )}
    >
      <span className="text-2xl font-semibold tracking-tight sm:text-3xl">{chord.roman}</span>
      <span className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
        {chord.name}
      </span>
    </button>
  );
}

interface SegmentedProps<T extends string> {
  options: readonly T[];
  labels?: Partial<Record<T, string>>;
  value: T;
  onChange: (value: T) => void;
}

function Segmented<T extends string>({ options, labels, value, onChange }: SegmentedProps<T>) {
  return (
    <div className="inline-flex rounded-xl border border-border/70 bg-background/60 p-1">
      {options.map(opt => (
        <button
          key={opt}
          type="button"
          onClick={() => onChange(opt)}
          className={cn(
            'rounded-lg px-3 py-1.5 text-sm font-medium capitalize transition-colors',
            value === opt
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {labels?.[opt] ?? opt}
        </button>
      ))}
    </div>
  );
}

interface KeySelectProps {
  value: Key;
  onChange: (key: Key) => void;
}

function KeySelect({ value, onChange }: KeySelectProps) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value as Key)}
      className="rounded-xl border border-border/70 bg-background px-3 py-1.5 text-sm font-medium shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
    >
      {KEYS.map(k => (
        <option key={k} value={k}>
          {k}
        </option>
      ))}
    </select>
  );
}

interface OctaveStepperProps {
  octave: number;
  onChange: (octave: number) => void;
}

function OctaveStepper({ octave, onChange }: OctaveStepperProps) {
  return (
    <div className="inline-flex items-center gap-1 rounded-xl border border-border/70 bg-background/60 p-1">
      <Button
        size="icon"
        variant="ghost"
        className="size-8"
        onClick={() => onChange(clamp(octave - 1, OCTAVE_MIN, OCTAVE_MAX))}
        disabled={octave <= OCTAVE_MIN}
        aria-label="Lower octave"
      >
        <Minus className="size-4" />
      </Button>
      <span className="min-w-6 text-center text-sm font-semibold tabular-nums">{octave}</span>
      <Button
        size="icon"
        variant="ghost"
        className="size-8"
        onClick={() => onChange(clamp(octave + 1, OCTAVE_MIN, OCTAVE_MAX))}
        disabled={octave >= OCTAVE_MAX}
        aria-label="Raise octave"
      >
        <Plus className="size-4" />
      </Button>
    </div>
  );
}

interface SliderRowProps {
  label: string;
  max: number;
  min: number;
  onChange: (value: number) => void;
  step: number;
  valueLabel: string;
  value: number;
}

function SliderRow({ label, max, min, onChange, step, value, valueLabel }: SliderRowProps) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-20 text-sm text-muted-foreground">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="h-2 flex-1 cursor-pointer appearance-none rounded-full bg-muted accent-primary"
      />
      <span className="w-14 text-right text-sm font-medium tabular-nums">{valueLabel}</span>
    </div>
  );
}

interface SettingsDialogProps {
  attack: number;
  release: number;
  shimmerReverb: number;
  onAttackChange: (value: number) => void;
  onReleaseChange: (value: number) => void;
  onShimmerReverbChange: (value: number) => void;
  onReset: () => void;
}

function SettingsDialog({
  attack,
  release,
  shimmerReverb,
  onAttackChange,
  onReleaseChange,
  onShimmerReverbChange,
  onReset,
}: SettingsDialogProps) {
  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm" className="rounded-xl gap-1.5">
            <Settings className="size-4" />
            Settings
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Pad settings</DialogTitle>
          <DialogDescription>Fine-tune how the pad swells in and out.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <SliderRow
            label="Attack"
            min={0.1}
            max={4}
            step={0.1}
            value={attack}
            onChange={onAttackChange}
            valueLabel={`${attack.toFixed(1)} s`}
          />
          <SliderRow
            label="Release"
            min={0.3}
            max={6}
            step={0.1}
            value={release}
            onChange={onReleaseChange}
            valueLabel={`${release.toFixed(1)} s`}
          />
          <SliderRow
            label="Shimmer verb"
            min={0}
            max={0.85}
            step={0.01}
            value={shimmerReverb}
            onChange={onShimmerReverbChange}
            valueLabel={`${Math.round(shimmerReverb * 100)}%`}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onReset}>
            Reset defaults
          </Button>
          <DialogClose render={<Button>Done</Button>} />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Main component
function WorshipPadPage() {
  const navigate = useNavigate({ from: '/worship-pad' });
  const search = Route.useSearch();

  const key = search.key ?? DEFAULT_KEY;
  const mode = search.mode ?? DEFAULT_MODE;
  const variant = search.variant ?? DEFAULT_VARIANT;
  const octave = search.octave ?? DEFAULT_OCTAVE;
  const volume = search.volume ?? DEFAULT_VOLUME;
  const reverb = search.reverb ?? DEFAULT_REVERB;
  const subRoot = search.subRoot ?? DEFAULT_SUB_ROOT;
  const drone = search.drone ?? DEFAULT_DRONE;
  const shimmer = search.shimmer ?? DEFAULT_SHIMMER;
  const shimmerReverb = search.shimmerReverb ?? DEFAULT_SHIMMER_REVERB;
  const preset = search.preset ?? DEFAULT_PRESET;
  const attack = search.attack ?? DEFAULT_ATTACK;
  const release = search.release ?? DEFAULT_RELEASE;

  const updateSearch = useCallback(
    (updates: Partial<SearchParams>) => {
      navigate({
        search: prev => ({ ...prev, ...updates }),
        replace: true,
      });
    },
    [navigate],
  );

  const settings = useMemo<PadSettings>(
    () => ({
      attack,
      preset,
      release,
      reverbWet: reverb,
      shimmerReverbAmount: shimmerReverb,
      volume,
    }),
    [attack, preset, release, reverb, shimmerReverb, volume],
  );

  const pad = useWorshipPad({ settings });
  const chords = useMemo(() => getDiatonicChords(key, mode), [key, mode]);
  const tonic = chords[0];
  const droneOctave = Math.max(octave - 1, OCTAVE_MIN);

  const [pointerDownChord, setPointerDownChord] = useState<number | null>(null);

  const handlePressChord = useCallback(
    (index: number) => {
      setPointerDownChord(index);
      void pad.playChord(chords[index], variant, octave, subRoot, shimmer);
    },
    [chords, octave, pad, shimmer, subRoot, variant],
  );

  const handleReleaseChord = useCallback(() => {
    if (pointerDownChord === null) return;
    setPointerDownChord(null);
    pad.releaseChord();
  }, [pad, pointerDownChord]);

  // Live-update the sounding chord and drone when voicing params change mid-play
  const activeChordRef = useRef(pad.activeChord);
  useEffect(() => {
    activeChordRef.current = pad.activeChord;
  }, [pad.activeChord]);

  const { refreshVoicing, retuneDrone, setDrone } = pad;
  useEffect(() => {
    const active = activeChordRef.current;
    if (!active) return;
    const next = chords[active.degree - 1];
    if (!next) return;
    refreshVoicing(next, variant, octave, subRoot, shimmer);
  }, [chords, octave, refreshVoicing, shimmer, subRoot, variant]);

  useEffect(() => {
    retuneDrone(tonic.rootPc, droneOctave);
  }, [droneOctave, retuneDrone, tonic.rootPc]);

  // Sync drone audio to the URL-driven drone state
  useEffect(() => {
    setDrone(drone, tonic.rootPc, droneOctave);
  }, [drone, droneOctave, setDrone, tonic.rootPc]);

  // Global pointerup so dragging off a chord button still releases it
  useEffect(() => {
    const handleUp = () => handleReleaseChord();
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('pointercancel', handleUp);
    return () => {
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleUp);
    };
  }, [handleReleaseChord]);

  // Keyboard shortcuts (play + release)
  useEffect(() => {
    const isTyping = (target: EventTarget | null) => {
      const el = target as HTMLElement | null;
      return (
        !!el &&
        (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable === true)
      );
    };

    const chordDown = new Set<number>();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return;

      if (e.key >= '1' && e.key <= '7') {
        const index = Number(e.key) - 1;
        if (chordDown.has(index) || e.repeat) return;
        chordDown.add(index);
        e.preventDefault();
        handlePressChord(index);
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        pad.toggleLatch();
      } else if (e.key === 'd' || e.key === 'D') {
        if (e.repeat) return;
        e.preventDefault();
        pad.setDucked(true);
      } else if (e.key === 'g' || e.key === 'G') {
        if (e.repeat) return;
        e.preventDefault();
        updateSearch({ drone: !drone });
      } else if (e.key === 'b' || e.key === 'B') {
        if (e.repeat) return;
        e.preventDefault();
        updateSearch({ subRoot: !subRoot });
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        updateSearch({ octave: clamp(octave + 1, OCTAVE_MIN, OCTAVE_MAX) });
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        updateSearch({ octave: clamp(octave - 1, OCTAVE_MIN, OCTAVE_MAX) });
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        updateSearch({ volume: clamp(volume + VOLUME_STEP, 0, 1) });
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        updateSearch({ volume: clamp(volume - VOLUME_STEP, 0, 1) });
      } else if (e.key === 'Escape') {
        e.preventDefault();
        if (pad.latched) pad.toggleLatch();
        else pad.releaseChord();
        if (drone) updateSearch({ drone: false });
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return;

      if (e.key >= '1' && e.key <= '7') {
        const index = Number(e.key) - 1;
        chordDown.delete(index);
        if (pointerDownChord === index || pointerDownChord === null) {
          setPointerDownChord(null);
          pad.releaseChord();
        }
      } else if (e.key === 'd' || e.key === 'D') {
        pad.setDucked(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [
    drone,
    droneOctave,
    handlePressChord,
    octave,
    pad,
    pointerDownChord,
    subRoot,
    tonic.rootPc,
    updateSearch,
    volume,
  ]);

  useRegisterShortcuts([
    { key: '1–7', label: 'Play chords I through vii°' },
    { key: 'Space', label: 'Toggle latch (hands-free sustain)' },
    { key: 'D', label: 'Hold to duck volume' },
    { key: 'G', label: 'Toggle root drone' },
    { key: 'B', label: 'Toggle sub-root (thicker bass)' },
    { key: '↑ / ↓', label: 'Octave up / down' },
    { key: '← / →', label: 'Volume down / up' },
    { key: 'Esc', label: 'Release all' },
  ]);

  const handleResetSettings = useCallback(() => {
    updateSearch({
      attack: DEFAULT_ATTACK,
      release: DEFAULT_RELEASE,
      shimmerReverb: DEFAULT_SHIMMER_REVERB,
    });
  }, [updateSearch]);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <section className="relative overflow-hidden rounded-3xl border border-border/80 bg-gradient-to-b from-card via-card to-background p-5 shadow-sm sm:p-6">
        <div className="pointer-events-none absolute -top-20 right-10 h-56 w-56 rounded-full bg-primary/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-16 left-6 h-44 w-44 rounded-full bg-indigo-400/10 blur-3xl" />

        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1">
            <p className="flex items-center gap-1.5 text-sm font-medium uppercase tracking-[0.18em] text-muted-foreground/90">
              <Sparkles className="size-4 text-primary" />
              Worship Pad
            </p>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              {key} {mode}
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <KeySelect value={key} onChange={next => updateSearch({ key: next })} />
            <Segmented
              options={MODES}
              labels={{ major: 'Major', minor: 'Minor' }}
              value={mode}
              onChange={next => updateSearch({ mode: next })}
            />
            <OctaveStepper octave={octave} onChange={next => updateSearch({ octave: next })} />
          </div>
        </div>

        <div className="relative mt-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Segmented
              options={VARIANTS}
              labels={{ triad: 'Triad', sus4: 'sus4', add9: 'add9' }}
              value={variant}
              onChange={next => updateSearch({ variant: next })}
            />
            <Segmented
              options={SYNTH_PRESETS}
              labels={{ pad: 'Pad', organ: 'Organ', bell: 'Bell' }}
              value={preset}
              onChange={next => updateSearch({ preset: next })}
            />
          </div>
          <SettingsDialog
            attack={attack}
            release={release}
            shimmerReverb={shimmerReverb}
            onAttackChange={next => updateSearch({ attack: next })}
            onReleaseChange={next => updateSearch({ release: next })}
            onShimmerReverbChange={next => updateSearch({ shimmerReverb: next })}
            onReset={handleResetSettings}
          />
        </div>
      </section>

      <section className="rounded-3xl border border-border/80 bg-card/80 p-4 shadow-sm sm:p-6">
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 sm:gap-3 lg:grid-cols-7">
          {chords.map((chord, i) => (
            <ChordButton
              key={chord.roman}
              chord={chord}
              active={pad.activeChord?.roman === chord.roman}
              onPress={() => handlePressChord(i)}
            />
          ))}
        </div>
        {!pad.isReady && (
          <p className="mt-4 text-center text-sm text-muted-foreground">
            Tap any chord to start the audio engine.
          </p>
        )}
      </section>

      <section className="rounded-3xl border border-border/80 bg-card/80 p-4 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4">
          <SliderRow
            label="Volume"
            min={0}
            max={1}
            step={0.01}
            value={volume}
            onChange={next => updateSearch({ volume: next })}
            valueLabel={`${Math.round(volume * 100)}%`}
          />
          <SliderRow
            label="Reverb"
            min={0}
            max={1}
            step={0.01}
            value={reverb}
            onChange={next => updateSearch({ reverb: next })}
            valueLabel={`${Math.round(reverb * 100)}%`}
          />
          <div className="flex flex-wrap items-center justify-center gap-2 pt-1 sm:justify-start">
            <Button
              variant={pad.ducked ? 'default' : 'outline'}
              className="rounded-xl gap-1.5"
              onPointerDown={event => {
                event.currentTarget.setPointerCapture(event.pointerId);
                pad.setDucked(true);
              }}
              onPointerUp={() => pad.setDucked(false)}
              onPointerCancel={() => pad.setDucked(false)}
            >
              <VolumeX className="size-4" />
              Duck
            </Button>
            <Button
              variant={pad.latched ? 'default' : 'outline'}
              className="rounded-xl gap-1.5"
              onClick={pad.toggleLatch}
              aria-pressed={pad.latched}
            >
              <Waves className="size-4" />
              Latch
            </Button>
            <Button
              variant={subRoot ? 'default' : 'outline'}
              className="rounded-xl gap-1.5"
              onClick={() => updateSearch({ subRoot: !subRoot })}
              aria-pressed={subRoot}
            >
              <Layers className="size-4" />
              Sub
            </Button>
            <Button
              variant={shimmer ? 'default' : 'outline'}
              className="rounded-xl gap-1.5"
              onClick={() => updateSearch({ shimmer: !shimmer })}
              aria-pressed={shimmer}
            >
              <Stars className="size-4" />
              Shimmer
            </Button>
            <Button
              variant={drone ? 'default' : 'outline'}
              className="rounded-xl gap-1.5"
              onClick={() => updateSearch({ drone: !drone })}
              aria-pressed={drone}
            >
              <Wind className="size-4" />
              Drone ({tonic.name}
              {droneOctave})
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}

// Route export
export const Route = createFileRoute('/worship-pad')({
  component: WorshipPadPage,
  validateSearch: zodValidator(searchSchema),
});
