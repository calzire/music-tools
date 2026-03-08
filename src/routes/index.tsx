import { Link, createFileRoute } from '@tanstack/react-router';
import { ArrowRight, Drum, Gauge, Timer } from 'lucide-react';

// Types
interface ToolCardProps {
  description: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
}

// Subcomponents
function ToolCard({ description, href, icon: Icon, title }: ToolCardProps) {
  return (
    <Link
      to={href}
      className="group rounded-lg border border-border bg-card p-6 text-card-foreground shadow-sm transition-colors hover:bg-accent"
    >
      <div className="flex items-start gap-4">
        <div className="rounded-lg bg-primary/10 p-2">
          <Icon className="size-6 text-primary" />
        </div>
        <div className="flex-1">
          <h3 className="font-semibold">{title}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
        <ArrowRight className="size-5 text-muted-foreground transition-transform group-hover:translate-x-1" />
      </div>
    </Link>
  );
}

// Main component
function HomePage() {
  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Music Tools</h1>
        <p className="text-muted-foreground">A collection of browser-based music utilities.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <ToolCard
          description="Practice with adjustable tempo, time signatures, and speed training"
          href="/metronome"
          icon={Timer}
          title="Metronome"
        />
        <ToolCard
          description="Tune instruments using your microphone (browser-only pitch detection)"
          href="/tuner"
          icon={Gauge}
          title="Tuner"
        />
        <ToolCard
          description="Program drum patterns by section and share tracks in URL"
          href="/drum-looper"
          icon={Drum}
          title="Drum Looper"
        />
      </div>
    </div>
  );
}

// Route export
export const Route = createFileRoute('/')({
  component: HomePage,
});
