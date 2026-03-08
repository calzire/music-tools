import { useCallback, useEffect, useMemo, useState } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { zodValidator } from '@tanstack/zod-adapter';
import {
  Check,
  ChevronDownIcon,
  ChevronRight,
  Minus,
  Pause,
  Play,
  Plus,
  Settings,
} from 'lucide-react';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import {
  Combobox,
  ComboboxIcon,
  ComboboxItem,
  ComboboxItemIndicator,
  ComboboxList,
  ComboboxPopup,
  ComboboxPositioner,
  ComboboxTrigger,
  ComboboxValue,
} from '@/components/ui/combobox';
import { Command, CommandGroup, CommandItem, CommandList } from '@/components/ui/command';
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
import { useMetronome, DEFAULT_BPM, MAX_BPM, MIN_BPM } from '@/hooks/use-metronome';
import { useTapTempo } from '@/hooks/use-tap-tempo';
import {
  formatTime,
  getAccentBeats,
  getTempoName,
  isAccentBeat,
  isDownbeat,
  TIME_SIGNATURES,
  type TimeSignature,
} from '@/lib/tempo-utils';
import { cn } from '@/lib/utils';

// Types
interface BeatIndicatorProps {
  beat: number;
  currentBeat: number;
  isAccent: boolean;
  isDownbeat: boolean;
}

interface BpmControlsProps {
  bpm: number;
  onBpmChange: (bpm: number) => void;
}

interface SearchParams {
  bpm?: number;
  bpmIncrement?: number;
  countIn?: number;
  loops?: number;
  repeatsPerLoop?: number;
  speedTrainer?: boolean;
  timer?: boolean;
  timerDuration?: number;
  timeSignature?: string;
}

interface SpeedTrainerConfig {
  bpmIncrement: number;
  enabled: boolean;
  loops: number;
  repeatsPerLoop: number;
}

interface TimerConfig {
  durationSeconds: number;
  enabled: boolean;
}

// Constants
const BPM_ADJUSTMENTS = [-10, -5, 5, 10];
const COUNT_IN_OPTIONS = [0, 1, 2, 3, 4] as const;
const searchSchema = z.object({
  bpm: z.number().optional(),
  bpmIncrement: z.number().optional(),
  countIn: z.number().optional(),
  loops: z.number().optional(),
  repeatsPerLoop: z.number().optional(),
  speedTrainer: z.boolean().optional(),
  timer: z.boolean().optional(),
  timerDuration: z.number().optional(),
  timeSignature: z.string().optional(),
});

// Helper functions
function findTimeSignature(label: string | undefined): TimeSignature {
  if (!label) return TIME_SIGNATURES[0];
  return TIME_SIGNATURES.find(ts => ts.label === label) ?? TIME_SIGNATURES[0];
}

// Subcomponents
function BeatIndicator({ beat, currentBeat, isAccent, isDownbeat }: BeatIndicatorProps) {
  const isActive = currentBeat === beat;

  return (
    <div
      className={cn(
        'flex size-14 items-center justify-center rounded-full border-4 transition-all duration-100 sm:size-16',
        isActive
          ? isDownbeat
            ? 'scale-110 border-primary bg-primary shadow-[0_0_0_6px_color-mix(in_oklab,var(--primary)_18%,transparent)]'
            : isAccent
              ? 'scale-108 border-orange-500 bg-orange-500 shadow-[0_0_0_5px_rgba(249,115,22,0.2)]'
              : 'scale-105 border-amber-400 bg-amber-400'
          : 'border-muted-foreground/30 bg-card/30 shadow-inner',
      )}
    >
      <div
        className={cn(
          'size-5 rounded-full transition-colors sm:size-6',
          isActive
            ? isDownbeat
              ? 'bg-primary-foreground'
              : isAccent
                ? 'bg-orange-100'
                : 'bg-amber-100'
            : 'bg-muted-foreground/30',
        )}
      />
    </div>
  );
}

function BpmControls({ bpm, onBpmChange }: BpmControlsProps) {
  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onBpmChange(Number(e.target.value));
  };

  return (
    <div className="space-y-5">
      <div className="text-center">
        <div className="text-sm font-medium uppercase tracking-[0.18em] text-muted-foreground/90">
          Tempo
        </div>
        <span className="text-4xl font-bold tracking-tight tabular-nums">{bpm} BPM</span>
        <span className="ml-2 text-muted-foreground">({getTempoName(bpm)})</span>
      </div>

      <div className="flex items-center gap-3">
        <Button
          className="rounded-xl"
          disabled={bpm <= MIN_BPM}
          onClick={() => onBpmChange(bpm - 1)}
          size="icon"
          variant="outline"
        >
          <Minus className="size-4" />
        </Button>

        <input
          className="metronome-slider h-2 flex-1 cursor-pointer appearance-none rounded-lg"
          max={MAX_BPM}
          min={MIN_BPM}
          onChange={handleSliderChange}
          type="range"
          value={bpm}
        />

        <Button
          className="rounded-xl"
          disabled={bpm >= MAX_BPM}
          onClick={() => onBpmChange(bpm + 1)}
          size="icon"
          variant="outline"
        >
          <Plus className="size-4" />
        </Button>
      </div>

      <div className="flex justify-center gap-2">
        {BPM_ADJUSTMENTS.map(adjustment => (
          <Button
            className="min-w-14 rounded-xl"
            key={adjustment}
            onClick={() => onBpmChange(bpm + adjustment)}
            size="sm"
            variant="secondary"
          >
            {adjustment > 0 ? `+${adjustment}` : adjustment}
          </Button>
        ))}
      </div>
    </div>
  );
}

function TimeSignatureCombobox({
  onChange,
  value,
}: {
  onChange: (ts: TimeSignature) => void;
  value: TimeSignature;
}) {
  return (
    <Combobox
      value={value.label}
      onValueChange={newValue => {
        if (newValue) {
          const found = TIME_SIGNATURES.find(ts => ts.label === newValue);
          if (found) onChange(found);
        }
      }}
    >
      <ComboboxTrigger className="w-48 justify-between">
        <ComboboxValue placeholder="Time signature" />
        <ComboboxIcon>
          <ChevronDownIcon className="size-4 opacity-50" />
        </ComboboxIcon>
      </ComboboxTrigger>
      <ComboboxPositioner>
        <ComboboxPopup className="min-w-48">
          <ComboboxList>
            {[...TIME_SIGNATURES].map(ts => (
              <ComboboxItem key={ts.label} value={ts.label}>
                <ComboboxItemIndicator />
                <span className="col-start-2 whitespace-nowrap">{ts.label}</span>
              </ComboboxItem>
            ))}
          </ComboboxList>
        </ComboboxPopup>
      </ComboboxPositioner>
    </Combobox>
  );
}

function SettingsDialog({
  countIn,
  onCountInChange,
}: {
  countIn: number;
  onCountInChange: (value: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [showCountIn, setShowCountIn] = useState(false);

  const handleCountInSelect = (value: number) => {
    onCountInChange(value);
    setShowCountIn(false);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        className={cn(
          'inline-flex size-10 items-center justify-center rounded-md',
          'hover:bg-accent hover:text-accent-foreground',
          countIn > 0 && 'bg-primary text-primary-foreground hover:bg-primary/90',
        )}
      >
        <Settings className="size-5" />
      </DialogTrigger>
      <DialogContent className="max-w-xs p-0">
        <DialogHeader className="sr-only">
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>Metronome settings</DialogDescription>
        </DialogHeader>
        <Command className="rounded-lg">
          <CommandList>
            {!showCountIn ? (
              <CommandGroup heading="Settings">
                <CommandItem onSelect={() => setShowCountIn(true)}>
                  <span className="flex-1">Count-in</span>
                  <span className="text-muted-foreground text-xs">
                    {countIn === 0 ? 'Off' : `${countIn} beat${countIn > 1 ? 's' : ''}`}
                  </span>
                  <ChevronRight className="size-4" />
                </CommandItem>
              </CommandGroup>
            ) : (
              <CommandGroup heading="Count-in">
                {COUNT_IN_OPTIONS.map(option => (
                  <CommandItem key={option} onSelect={() => handleCountInSelect(option)}>
                    <span className="size-4">
                      {countIn === option && <Check className="size-4" />}
                    </span>
                    {option === 0 ? 'Off' : `${option} beat${option > 1 ? 's' : ''}`}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}

function TimerDialog({
  enabledExplicitlySet,
  onSave,
  value,
}: {
  enabledExplicitlySet: boolean;
  onSave: (config: TimerConfig) => void;
  value: TimerConfig;
}) {
  return (
    <Dialog>
      <DialogTrigger
        className={cn(
          'rounded-md px-4 py-2 text-sm font-medium',
          value.enabled
            ? 'bg-primary text-primary-foreground'
            : 'bg-secondary hover:bg-secondary/80',
        )}
      >
        Timer
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Duration</DialogTitle>
          <DialogDescription>Determine your exercise time</DialogDescription>
        </DialogHeader>
        <TimerDialogContent
          enabledExplicitlySet={enabledExplicitlySet}
          onSave={onSave}
          value={value}
        />
      </DialogContent>
    </Dialog>
  );
}

function TimerDialogContent({
  enabledExplicitlySet,
  onSave,
  value,
}: {
  enabledExplicitlySet: boolean;
  onSave: (config: TimerConfig) => void;
  value: TimerConfig;
}) {
  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    onSave({
      durationSeconds: Number(formData.get('minutes')) * 60 + Number(formData.get('seconds')),
      enabled: formData.get('enabled') === 'on',
    });
  };

  // Default to true when opening dialog if not explicitly set
  const defaultEnabled = enabledExplicitlySet ? value.enabled : true;

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <label className="flex items-center gap-2">
        <input
          className="size-4 accent-primary"
          defaultChecked={defaultEnabled}
          name="enabled"
          type="checkbox"
        />
        <span>Enable timer</span>
      </label>
      <div className="flex items-center justify-center gap-2">
        <input
          className="w-16 rounded-md border border-border bg-background px-3 py-2 text-center text-lg"
          defaultValue={Math.floor(value.durationSeconds / 60)}
          max={99}
          min={0}
          name="minutes"
          type="number"
        />
        <span className="text-2xl">:</span>
        <input
          className="w-16 rounded-md border border-border bg-background px-3 py-2 text-center text-lg"
          defaultValue={value.durationSeconds % 60}
          max={59}
          min={0}
          name="seconds"
          type="number"
        />
      </div>
      <DialogFooter>
        <DialogClose className="rounded-md bg-secondary px-4 py-2 hover:bg-secondary/80">
          Cancel
        </DialogClose>
        <DialogClose
          className="rounded-md bg-primary px-4 py-2 text-primary-foreground hover:bg-primary/90"
          type="submit"
        >
          OK
        </DialogClose>
      </DialogFooter>
    </form>
  );
}

function SpeedTrainerDialog({
  enabledExplicitlySet,
  onSave,
  value,
}: {
  enabledExplicitlySet: boolean;
  onSave: (config: SpeedTrainerConfig) => void;
  value: SpeedTrainerConfig;
}) {
  return (
    <Dialog>
      <DialogTrigger
        className={cn(
          'rounded-md px-4 py-2 text-sm font-medium',
          value.enabled
            ? 'bg-primary text-primary-foreground'
            : 'bg-secondary hover:bg-secondary/80',
        )}
      >
        Speed trainer
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Speed Trainer</DialogTitle>
          <DialogDescription>Gradually increase tempo over time</DialogDescription>
        </DialogHeader>
        <SpeedTrainerDialogContent
          enabledExplicitlySet={enabledExplicitlySet}
          onSave={onSave}
          value={value}
        />
      </DialogContent>
    </Dialog>
  );
}

function SpeedTrainerDialogContent({
  enabledExplicitlySet,
  onSave,
  value,
}: {
  enabledExplicitlySet: boolean;
  onSave: (config: SpeedTrainerConfig) => void;
  value: SpeedTrainerConfig;
}) {
  const [infiniteLoops, setInfiniteLoops] = useState(value.loops === 0);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    onSave({
      bpmIncrement: Number(formData.get('bpmIncrement')),
      enabled: formData.get('enabled') === 'on',
      loops: infiniteLoops ? 0 : Number(formData.get('loops')),
      repeatsPerLoop: Number(formData.get('repeatsPerLoop')),
    });
  };

  // Default to true when opening dialog if not explicitly set
  const defaultEnabled = enabledExplicitlySet ? value.enabled : true;

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <label className="flex items-center gap-2">
        <input
          className="size-4 accent-primary"
          defaultChecked={defaultEnabled}
          name="enabled"
          type="checkbox"
        />
        <span>Enable speed trainer</span>
      </label>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span>Loops</span>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1 text-sm text-muted-foreground">
              <input
                checked={infiniteLoops}
                className="size-4 accent-primary"
                onChange={e => setInfiniteLoops(e.target.checked)}
                type="checkbox"
              />
              ∞
            </label>
            <input
              className="w-20 rounded-md border border-border bg-background px-3 py-1 text-right disabled:opacity-50"
              defaultValue={value.loops || 10}
              disabled={infiniteLoops}
              max={99}
              min={1}
              name="loops"
              type="number"
            />
          </div>
        </div>
        <div className="flex items-center justify-between">
          <span>Repeats per loop</span>
          <input
            className="w-20 rounded-md border border-border bg-background px-3 py-1 text-right"
            defaultValue={value.repeatsPerLoop}
            max={99}
            min={1}
            name="repeatsPerLoop"
            type="number"
          />
        </div>
        <div className="flex items-center justify-between">
          <span>BPM per loop</span>
          <input
            className="w-20 rounded-md border border-border bg-background px-3 py-1 text-right"
            defaultValue={value.bpmIncrement}
            max={20}
            min={1}
            name="bpmIncrement"
            type="number"
          />
        </div>
      </div>
      <DialogFooter>
        <DialogClose
          className="w-full rounded-md bg-secondary px-4 py-2 hover:bg-secondary/80"
          type="submit"
        >
          Close
        </DialogClose>
      </DialogFooter>
    </form>
  );
}

// Main component
function MetronomePage() {
  const navigate = useNavigate({ from: '/metronome' });
  const search = Route.useSearch();

  // Derive state from URL search params
  const timeSignature = findTimeSignature(search.timeSignature);
  const countIn = search.countIn ?? 0;
  const timerConfig: TimerConfig = {
    durationSeconds: search.timerDuration ?? 300,
    enabled: search.timer ?? false,
  };
  const timerEnabledExplicitlySet = search.timer !== undefined;
  const speedTrainerConfig: SpeedTrainerConfig = {
    bpmIncrement: search.bpmIncrement ?? 2,
    enabled: search.speedTrainer ?? false,
    loops: search.loops ?? 10,
    repeatsPerLoop: search.repeatsPerLoop ?? 10,
  };
  const speedTrainerEnabledExplicitlySet = search.speedTrainer !== undefined;
  const initialBpm = search.bpm ?? DEFAULT_BPM;

  // Compute accent beats from subdivision
  const accentBeats = useMemo(
    () => getAccentBeats(timeSignature.subdivision),
    [timeSignature.subdivision],
  );

  const updateSearch = useCallback(
    (updates: Partial<SearchParams>) => {
      navigate({
        search: prev => ({ ...prev, ...updates }),
        replace: true,
      });
    },
    [navigate],
  );

  const {
    bpm,
    countInRemaining,
    currentBeat,
    elapsedSeconds,
    isCountingIn,
    isPlaying,
    setBpm,
    speedTrainerState,
    toggle,
  } = useMetronome({
    accentBeats,
    beatsPerMeasure: timeSignature.beats,
    bpm: initialBpm,
    countIn,
    onBpmChange: newBpm => updateSearch({ bpm: newBpm }),
    speedTrainer: speedTrainerConfig,
    timer: timerConfig,
  });

  const { tap } = useTapTempo({
    onTempoChange: setBpm,
  });

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input, textarea, or contenteditable
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        toggle();
      } else if (e.key === 't' || e.key === 'T') {
        e.preventDefault();
        tap();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggle, tap]);

  // Register shortcuts for help popover
  useRegisterShortcuts([
    { key: 'Space', label: 'Start / Stop' },
    { key: 'T', label: 'Tap tempo' },
  ]);

  const handleBpmChange = useCallback(
    (newBpm: number) => {
      setBpm(newBpm);
    },
    [setBpm],
  );

  const handleTimeSignatureChange = useCallback(
    (ts: TimeSignature) => {
      updateSearch({ timeSignature: ts.label });
    },
    [updateSearch],
  );

  const handleCountInChange = useCallback(
    (value: number) => {
      updateSearch({ countIn: value });
    },
    [updateSearch],
  );

  const handleTimerChange = useCallback(
    (config: TimerConfig) => {
      updateSearch({
        timer: config.enabled,
        timerDuration: config.durationSeconds,
      });
    },
    [updateSearch],
  );

  const handleSpeedTrainerChange = useCallback(
    (config: SpeedTrainerConfig) => {
      updateSearch({
        bpmIncrement: config.bpmIncrement,
        loops: config.loops,
        repeatsPerLoop: config.repeatsPerLoop,
        speedTrainer: config.enabled,
      });
    },
    [updateSearch],
  );

  const showStatus =
    (isPlaying && !isCountingIn && (speedTrainerConfig.enabled || timerConfig.enabled)) ||
    (!isPlaying && (timerConfig.enabled || speedTrainerConfig.enabled));

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <section className="relative overflow-hidden rounded-3xl border border-border/80 bg-gradient-to-b from-card via-card to-background p-4 shadow-sm sm:p-5">
        <div className="pointer-events-none absolute -top-28 right-6 h-60 w-60 rounded-full bg-primary/8 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 left-10 h-48 w-48 rounded-full bg-orange-400/8 blur-3xl" />

        <div className="relative space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.18em] text-muted-foreground/90">
                Metronome
              </p>
            </div>
            <div className="rounded-xl border border-border/70 bg-background/80 px-3 py-1.5 text-xs font-medium text-muted-foreground backdrop-blur">
              {timeSignature.label}
            </div>
          </div>

          {isCountingIn && (
            <div className="flex min-h-32 items-center justify-center">
              <span className="text-7xl font-bold tracking-tight text-primary">
                {countInRemaining}
              </span>
            </div>
          )}

          {!isCountingIn && (
            <div className="flex min-h-32 flex-wrap items-center justify-center gap-2.5 sm:gap-3">
              {Array.from({ length: timeSignature.beats }).map((_, i) => (
                <BeatIndicator
                  key={i}
                  beat={i}
                  currentBeat={currentBeat}
                  isAccent={isAccentBeat(i, timeSignature.subdivision)}
                  isDownbeat={isDownbeat(i)}
                />
              ))}
            </div>
          )}

          {showStatus && (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-center gap-2 text-sm text-muted-foreground">
                {speedTrainerConfig.enabled &&
                  (isPlaying && speedTrainerState ? (
                    <>
                      <span className="rounded-full border border-border/70 bg-background/70 px-3 py-1">
                        Loop {speedTrainerState.currentLoop}
                        {speedTrainerConfig.loops > 0 ? `/${speedTrainerConfig.loops}` : ''}
                      </span>
                      <span className="rounded-full border border-border/70 bg-background/70 px-3 py-1">
                        {speedTrainerState.currentRepeat}/{speedTrainerConfig.repeatsPerLoop}
                      </span>
                      <span className="rounded-full border border-border/70 bg-background/70 px-3 py-1 font-medium text-foreground">
                        {speedTrainerState.currentBpm} BPM
                      </span>
                    </>
                  ) : (
                    <span className="rounded-full border border-border/70 bg-background/70 px-3 py-1">
                      Speed:{' '}
                      {speedTrainerConfig.loops > 0
                        ? `${speedTrainerConfig.loops} loops`
                        : '∞ loops'}{' '}
                      × {speedTrainerConfig.repeatsPerLoop} repeats (+
                      {speedTrainerConfig.bpmIncrement} BPM)
                    </span>
                  ))}
                {timerConfig.enabled && (
                  <span className="rounded-full border border-border/70 bg-background/70 px-3 py-1">
                    {isPlaying
                      ? `${formatTime(elapsedSeconds)} / ${formatTime(timerConfig.durationSeconds)}`
                      : `Timer: ${formatTime(timerConfig.durationSeconds)}`}
                  </span>
                )}
              </div>
              {timerConfig.enabled && (
                <div className="mx-auto h-2 w-64 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-primary transition-all duration-1000"
                    style={{
                      width: `${(elapsedSeconds / timerConfig.durationSeconds) * 100}%`,
                    }}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* BPM Controls */}
      <div className="rounded-3xl border border-border/80 bg-card p-5 shadow-sm">
        <BpmControls bpm={bpm} onBpmChange={handleBpmChange} />
      </div>

      {/* Feature toggles */}
      <div className="rounded-2xl border border-border/70 bg-card/70 p-3 backdrop-blur sm:p-4">
        <div className="flex flex-wrap items-center justify-center gap-2">
          <SettingsDialog countIn={countIn} onCountInChange={handleCountInChange} />
          <SpeedTrainerDialog
            enabledExplicitlySet={speedTrainerEnabledExplicitlySet}
            onSave={handleSpeedTrainerChange}
            value={speedTrainerConfig}
          />
          <TimerDialog
            enabledExplicitlySet={timerEnabledExplicitlySet}
            onSave={handleTimerChange}
            value={timerConfig}
          />
        </div>
      </div>

      {/* Bottom controls */}
      <div className="rounded-2xl border border-border/70 bg-card/70 p-3 backdrop-blur sm:p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-center">
          <div className="flex items-center justify-center gap-3">
            <TimeSignatureCombobox onChange={handleTimeSignatureChange} value={timeSignature} />

            <Button className="rounded-xl px-6" onClick={tap} variant="outline">
              Tap tempo
            </Button>
          </div>

          <Button className="w-full gap-2 rounded-xl px-6 sm:w-auto" onClick={toggle} size="lg">
            {isPlaying ? (
              <>
                <Pause className="size-5" />
                Stop
              </>
            ) : (
              <>
                <Play className="size-5" />
                Start
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

// Route export
export const Route = createFileRoute('/metronome')({
  component: MetronomePage,
  validateSearch: zodValidator(searchSchema),
});
