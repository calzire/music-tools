import { useCallback, useMemo, useState } from 'react';

import { KeyboardShortcutsContext, type KeyboardShortcut } from '@/lib/keyboard-shortcuts-context';

export function KeyboardShortcutsProvider({ children }: { children: React.ReactNode }) {
  const [globalShortcuts, setGlobalShortcuts] = useState<KeyboardShortcut[]>([]);
  const [pageShortcuts, setPageShortcuts] = useState<KeyboardShortcut[]>([]);

  const registerGlobalShortcuts = useCallback((shortcuts: KeyboardShortcut[]) => {
    setGlobalShortcuts(prev => [...prev, ...shortcuts]);
    return () => {
      setGlobalShortcuts(prev =>
        prev.filter(s => !shortcuts.some(ns => ns.key === s.key && ns.label === s.label)),
      );
    };
  }, []);

  const registerPageShortcuts = useCallback((shortcuts: KeyboardShortcut[]) => {
    setPageShortcuts(shortcuts);
    return () => setPageShortcuts([]);
  }, []);

  const hasShortcuts = globalShortcuts.length > 0 || pageShortcuts.length > 0;

  const value = useMemo(
    () => ({
      globalShortcuts,
      pageShortcuts,
      registerGlobalShortcuts,
      registerPageShortcuts,
      hasShortcuts,
    }),
    [globalShortcuts, pageShortcuts, registerGlobalShortcuts, registerPageShortcuts, hasShortcuts],
  );

  return (
    <KeyboardShortcutsContext.Provider value={value}>{children}</KeyboardShortcutsContext.Provider>
  );
}
