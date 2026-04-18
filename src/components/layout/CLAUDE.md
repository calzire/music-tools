# Layout

App shell mounted by `src/routes/__root.tsx`.

```
TopNav.tsx                      # Top navigation bar
Sidebar.tsx                     # Collapsible sidebar
SidebarContext.tsx              # Sidebar open/close state
ThemeContext.tsx                # Dark/light mode state
ThemeToggle.tsx                 # Theme toggle button
KeyboardShortcutsContext.tsx    # Registry read by the TopNav help popover
```

## Sidebar context

```tsx
import { useSidebar } from '@/components/layout/SidebarContext';

const { isOpen, toggle, open, close } = useSidebar();
```

Auto-closes on mobile, auto-opens on desktop, responds to viewport changes.

## Theme context

```tsx
import { useTheme } from '@/components/layout/ThemeContext';

const { theme, setTheme } = useTheme(); // 'light' | 'dark' | 'system'
```

## Nav items

Edit `src/lib/nav.ts`:

```tsx
export const navItems: NavGroup[] = [
  {
    title: 'Group Name',
    items: [{ title: 'Page', href: '/page', icon: IconName }],
  },
];
```

This single source drives the desktop sidebar, the mobile sheet, and the homepage grid — update it when adding a page.
