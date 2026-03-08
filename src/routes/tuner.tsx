import { useCallback, useMemo, useState } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { zodValidator } from '@tanstack/zod-adapter';
import { Mic, MicOff } from 'lucide-react';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import { getStandardFrequency, NOTE_STRINGS } from '@/lib/tuner-utils';
import { cn } from '@/lib/utils';
import { useTuner } from '@/hooks/use-tuner';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectPositioner,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

/**
 * Tuner page. Pitch detection uses browser-only autocorrelation (no external packages).
 * UI and note/cents math inspired by the online tuner by qiuxiang.
 *
 * Thank you to the original project: https://github.com/qiuxiang/tuner
 */

interface Note {
  name: string;
  value: number;
  octave: number;
  frequency: number;
}

interface SearchParams {
  a4?: number;
  auto?: boolean;
}

const DEFAULT_A4 = 440;
const MIN_A4 = 430;
const MAX_A4 = 450;
const searchSchema = z.object({
  a4: z.number().optional(),
  auto: z.boolean().optional(),
});

// Build note list: C1 (value 24) through B8 (value 107)
const MIN_OCTAVE = 1;
const MAX_OCTAVE = 8;

function buildNoteList(middleA: number): Note[] {
  const list: { name: string; value: number; octave: number; frequency: number }[] = [];
  for (let octave = MIN_OCTAVE; octave <= MAX_OCTAVE; octave++) {
    for (let n = 0; n < 12; n++) {
      const value = 12 * (octave + 1) + n;
      list.push({
        name: NOTE_STRINGS[n],
        value,
        octave,
        frequency: getStandardFrequency(value, middleA),
      });
    }
  }
  return list;
}

function TunerMeter({ cents }: { cents: number }) {
  const deg = Math.max(-45, Math.min(45, (cents / 50) * 45));

  return (
    <div className="relative mx-auto h-24 w-48">
      {/* Scale ticks */}
      <div className="absolute inset-0 flex justify-center gap-0">
        {Array.from({ length: 11 }, (_, i) => (i - 5) * 9).map((angle, i) => (
          <div
            key={i}
            className="absolute bottom-0 left-1/2 h-full w-px -translate-x-px origin-bottom bg-border"
            style={{ transform: `rotate(${angle}deg)` }}
          />
        ))}
      </div>
      <div className="absolute bottom-0 left-1/2 h-2 w-2 -translate-x-1/2 translate-y-1/2 rounded-full bg-foreground" />
      <div
        className="absolute bottom-0 left-1/2 h-full w-0.5 -translate-x-px origin-bottom bg-primary transition-transform duration-150"
        style={{ transform: `rotate(${deg}deg)` }}
      />
    </div>
  );
}

export const Route = createFileRoute('/tuner')({
  component: TunerPage,
  validateSearch: zodValidator(searchSchema),
});

function TunerPage() {
  const navigate = useNavigate({ from: '/tuner' });
  const search = Route.useSearch();
  const a4 = search.a4 ?? DEFAULT_A4;
  const autoMode = search.auto ?? true;

  const [showA4Dialog, setShowA4Dialog] = useState(false);
  const [a4Input, setA4Input] = useState(String(a4));
  const [instrument, setInstrument] = useState<string | null>('e-standard');

  const noteListByInstrument = useMemo(() => {
    if (!instrument || instrument === 'all') return null;
    const i = flatInstruments.find(i => i.value === instrument);
    if (!i) return null;

    return i.notes;
  }, [instrument]);

  const updateSearch = useCallback(
    (updates: Partial<SearchParams>) => {
      navigate({
        search: prev => ({ ...prev, ...updates }),
        replace: true,
      });
    },
    [navigate],
  );

  const noteList = useMemo(() => buildNoteList(a4), [a4]);

  const { error, isListening, note, start, stop, playReference, stopReference } = useTuner({
    middleA: a4,
  });

  const activeNoteValue = note?.value ?? null;
  const handleNoteClick = useCallback(
    (value: number, frequency: number) => {
      if (autoMode) return;
      const current = activeNoteValue;
      if (current === value) {
        stopReference();
        return;
      }
      playReference(frequency);
    },
    [autoMode, activeNoteValue, playReference, stopReference],
  );

  const handleA4Submit = (e: React.FormEvent) => {
    e.preventDefault();
    const num = parseInt(a4Input, 10);
    if (Number.isFinite(num) && num >= MIN_A4 && num <= MAX_A4) {
      updateSearch({ a4: num });
      setShowA4Dialog(false);
    }
  };

  const handleInstrumentChange = (value: string | null) => {
    setInstrument(value);
  };

  const toggleAuto = () => {
    if (!autoMode) stopReference();
    updateSearch({ auto: !autoMode });
  };

  const activeDetectedNote = noteList.find(({ value }) => value === activeNoteValue);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <section className="relative overflow-hidden rounded-3xl border border-border/80 bg-gradient-to-b from-card via-card to-background p-4 shadow-sm sm:p-5">
        <div className="pointer-events-none absolute -top-28 right-6 h-60 w-60 rounded-full bg-primary/8 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 left-10 h-48 w-48 rounded-full bg-orange-400/8 blur-3xl" />

        <div className="relative space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-medium uppercase tracking-[0.18em] text-muted-foreground/90">
              Tuner
            </p>
            <div className="flex items-center gap-2">
              <button
                className="rounded-xl border border-border/70 bg-background/80 px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
                onClick={() => {
                  setA4Input(String(a4));
                  setShowA4Dialog(true);
                }}
                type="button"
              >
                A<sub>4</sub> = {a4} Hz
              </button>
              <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-border/70 bg-background/80 px-3 py-1.5 text-sm font-medium">
                <input
                  checked={autoMode}
                  className="size-4 accent-primary"
                  onChange={toggleAuto}
                  type="checkbox"
                />
                Auto
              </label>
            </div>
          </div>

          {showA4Dialog && (
            <div className="rounded-2xl border border-border/70 bg-card/70 p-4 backdrop-blur">
              <form className="flex flex-wrap items-center gap-3" onSubmit={handleA4Submit}>
                <span className="text-sm">
                  A<sub>4</sub> (Hz):
                </span>
                <input
                  className="border-input w-24 rounded-md border bg-background px-3 py-2 text-sm"
                  max={MAX_A4}
                  min={MIN_A4}
                  onChange={e => setA4Input(e.target.value)}
                  type="number"
                  value={a4Input}
                />
                <Button size="sm" type="submit">
                  Save
                </Button>
                <Button
                  size="sm"
                  type="button"
                  variant="ghost"
                  onClick={() => setShowA4Dialog(false)}
                >
                  Cancel
                </Button>
              </form>
            </div>
          )}

          {error && (
            <p className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-center text-sm text-destructive">
              {error}
            </p>
          )}

          <div className="rounded-2xl border border-border/70 bg-card/70 p-4 backdrop-blur sm:p-5">
            {!isListening && !error && (
              <div className="flex min-h-56 flex-col items-center justify-center gap-3">
                <Button className="gap-2 rounded-xl px-6" onClick={start} size="lg">
                  <Mic className="size-5" />
                  Start tuner (allow microphone)
                </Button>
              </div>
            )}

            {isListening && (
              <div className="flex flex-col items-center gap-4">
                <Button
                  className="gap-2 rounded-xl px-6"
                  onClick={stop}
                  size="lg"
                  variant="outline"
                >
                  <MicOff className="size-5" />
                  Stop
                </Button>

                <div className="rounded-2xl border border-border/60 bg-background/70 px-4 py-3">
                  <TunerMeter cents={note?.cents ?? 0} />
                </div>

                {autoMode && activeDetectedNote ? (
                  <button
                    key={`${activeDetectedNote.name}-${activeDetectedNote.octave}`}
                    className="flex min-w-24 flex-col rounded-xl border border-border/70 bg-background/70 px-3 py-2 text-center transition-colors hover:bg-accent"
                    onClick={() =>
                      handleNoteClick(activeDetectedNote.value, activeDetectedNote.frequency)
                    }
                    type="button"
                  >
                    <span className="text-4xl font-bold leading-tight">
                      {activeDetectedNote.name[0]}
                      {activeDetectedNote.name[1] && (
                        <span className="text-sm">{activeDetectedNote.name.slice(1)}</span>
                      )}
                    </span>
                    <span className="text-muted-foreground text-xs">
                      {activeDetectedNote.octave}
                    </span>
                  </button>
                ) : null}

                <div className="text-3xl">
                  {note ? (
                    <>
                      <span className="font-mono font-semibold text-foreground">
                        {note.frequency.toFixed(1)}
                      </span>
                      <span className="ml-1 text-lg text-muted-foreground">Hz</span>
                    </>
                  ) : (
                    <span className="text-sm text-muted-foreground">Play a note…</span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Manual note selection */}
      {isListening && !autoMode && (
        <div className="rounded-2xl border border-border/70 bg-card/70 p-3 backdrop-blur sm:p-4">
          <div className="flex flex-col items-center gap-3">
            <div className="flex max-w-[700px] overflow-x-auto overflow-y-hidden py-2 scrollbar-thin">
              <div className="flex gap-1 px-4">
                {(noteListByInstrument
                  ? noteList.filter(note =>
                      noteListByInstrument.some(
                        i => i.name === note.name && i.octave === note.octave,
                      ),
                    )
                  : noteList
                ).map(({ name, value, octave, frequency }) => {
                  const isManualTarget = activeNoteValue === value;
                  return (
                    <button
                      key={`${name}-${octave}`}
                      className={cn(
                        'flex flex-col rounded-md px-2 py-1 text-center transition-colors hover:bg-accent',
                        isManualTarget && 'bg-primary text-primary-foreground',
                      )}
                      onClick={() => handleNoteClick(value, frequency)}
                      type="button"
                    >
                      <span className="text-lg font-bold leading-tight">
                        {name[0]}
                        {name[1] && <span className="text-xs">{name.slice(1)}</span>}
                      </span>
                      <span className="text-muted-foreground text-xs">{octave}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <Select
              items={flatInstruments}
              onValueChange={handleInstrumentChange}
              value={instrument}
            >
              <SelectTrigger className="max-w-sm w-full rounded-xl">
                <SelectValue placeholder="Select an instrument" />
              </SelectTrigger>

              <SelectPositioner alignItemWithTrigger>
                <SelectContent>
                  <SelectItem value="all">All Notes</SelectItem>
                  {Object.entries(instruments).map(([group, items]) => (
                    <SelectGroup key={group}>
                      <SelectLabel>{group}</SelectLabel>
                      {items.map(item => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </SelectPositioner>
            </Select>
          </div>
        </div>
      )}
    </div>
  );
}

const instruments = {
  Guitar: [
    {
      label: 'E Standard',
      value: 'e-standard',
      notes: [
        { name: 'E', octave: 2 },
        { name: 'A', octave: 2 },
        { name: 'D', octave: 3 },
        { name: 'G', octave: 3 },
        { name: 'B', octave: 3 },
        { name: 'E', octave: 4 },
      ],
    },
    {
      label: 'Drop D',
      value: 'drop-d',
      notes: [
        { name: 'D', octave: 2 },
        { name: 'A', octave: 2 },
        { name: 'D', octave: 3 },
        { name: 'G', octave: 3 },
        { name: 'B', octave: 3 },
        { name: 'E', octave: 4 },
      ],
    },
  ],
};
const flatInstruments = Object.values({
  all: {
    label: 'All Notes',
    value: 'all',
    notes: [],
  },
  ...instruments,
}).flat();
