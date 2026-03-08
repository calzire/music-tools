import { Link } from '@tanstack/react-router';
import { Keyboard, Menu, AudioLines } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverPositioner,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useIsMobileBrowser } from '@/hooks/use-is-mobile-browser';
import { useKeyboardShortcuts } from '@/hooks/use-keyboard-shortcuts';
import { type KeyboardShortcut } from '@/lib/keyboard-shortcuts-context';
import { useSidebar } from './SidebarContext';
import { ThemeToggle } from './ThemeToggle';

function KeyboardShortcutsButton() {
  const { globalShortcuts, pageShortcuts, hasShortcuts } = useKeyboardShortcuts();
  const isMobileBrowser = useIsMobileBrowser();

  // Hide on mobile browsers (iOS/Android) since they don't have physical keyboards
  if (!hasShortcuts || isMobileBrowser) return null;

  return (
    <Popover>
      <PopoverTrigger
        className="inline-flex size-9 items-center justify-center rounded-md hover:bg-accent hover:text-accent-foreground"
        aria-label="Keyboard shortcuts"
      >
        <Keyboard className="size-5" />
      </PopoverTrigger>
      <PopoverPositioner side="bottom" align="end">
        <PopoverContent className="w-56 p-3">
          <div className="space-y-3">
            <h4 className="text-sm font-medium">Keyboard shortcuts</h4>
            <div className="space-y-2">
              {pageShortcuts.length > 0 && (
                <div className="space-y-1.5">
                  {pageShortcuts.map(shortcut => (
                    <ShortcutRow key={shortcut.key} shortcut={shortcut} />
                  ))}
                </div>
              )}
              {pageShortcuts.length > 0 && globalShortcuts.length > 0 && (
                <div className="border-t border-border" />
              )}
              {globalShortcuts.length > 0 && (
                <div className="space-y-1.5">
                  {globalShortcuts.map(shortcut => (
                    <ShortcutRow key={shortcut.key} shortcut={shortcut} />
                  ))}
                </div>
              )}
            </div>
          </div>
        </PopoverContent>
      </PopoverPositioner>
    </Popover>
  );
}

function ShortcutRow({ shortcut }: { shortcut: KeyboardShortcut }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{shortcut.label}</span>
      <kbd className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{shortcut.key}</kbd>
    </div>
  );
}

export function TopNav() {
  const { toggle } = useSidebar();

  return (
    <header className="sticky top-0 z-50 flex h-14 items-center gap-2 border-b border-border bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <Button variant="ghost" size="icon" onClick={toggle}>
        <Menu className="h-5 w-5" />
        <span className="sr-only">Toggle sidebar</span>
      </Button>

      <Link to="/" className="flex items-center gap-2 font-semibold">
        <div className="bg-primary rounded-md px-1.5 py-1.5">
          <AudioLines className="h-5 w-5 text-white " />
        </div>
        <span>Music Tools</span>
      </Link>

      <nav className="ml-auto flex items-center gap-2">
        <KeyboardShortcutsButton />
        <ThemeToggle />
      </nav>
    </header>
  );
}
