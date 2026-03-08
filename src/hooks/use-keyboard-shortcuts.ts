import { useContext, useEffect, useMemo } from 'react';

import {
  KeyboardShortcutsContext,
  type KeyboardShortcut,
  type KeyboardShortcutsContextValue,
} from '@/lib/keyboard-shortcuts-context';

export function useKeyboardShortcuts(): KeyboardShortcutsContextValue {
  const context = useContext(KeyboardShortcutsContext);
  if (!context) {
    throw new Error('useKeyboardShortcuts must be used within a KeyboardShortcutsProvider');
  }
  return context;
}

/**
 * Hook for pages to register their keyboard shortcuts.
 * Shortcuts are automatically unregistered when the component unmounts.
 *
 * Note: You can pass an inline array - this hook stabilizes it by value.
 */
export function useRegisterShortcuts(shortcuts: KeyboardShortcut[]) {
  const { registerPageShortcuts } = useKeyboardShortcuts();

  // Serialize shortcuts to create a stable dependency
  // This prevents infinite loops when shortcuts array is created inline
  const serialized = JSON.stringify(shortcuts);

  // Memoize shortcuts based on serialized value, not reference
  const stableShortcuts = useMemo<KeyboardShortcut[]>(() => JSON.parse(serialized), [serialized]);

  useEffect(() => {
    if (stableShortcuts.length === 0) return;
    return registerPageShortcuts(stableShortcuts);
  }, [stableShortcuts, registerPageShortcuts]);
}
