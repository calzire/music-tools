import { createContext } from 'react';

export interface KeyboardShortcut {
  key: string;
  label: string;
}

export interface KeyboardShortcutsContextValue {
  globalShortcuts: KeyboardShortcut[];
  pageShortcuts: KeyboardShortcut[];
  registerGlobalShortcuts: (shortcuts: KeyboardShortcut[]) => () => void;
  registerPageShortcuts: (shortcuts: KeyboardShortcut[]) => () => void;
  hasShortcuts: boolean;
}

export const KeyboardShortcutsContext = createContext<KeyboardShortcutsContextValue | null>(null);
