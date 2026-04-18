# Routes

This directory holds TanStack Router file-based routes. The router plugin auto-generates `../routeTree.gen.ts` — never hand-edit it. `src/main.tsx` uses `createHashHistory()` so URLs are `/#/path` (GitHub Pages compat).

## Creating a Route

```tsx
// src/routes/about.tsx → /#/about
import { createFileRoute } from '@tanstack/react-router';

function AboutPage() {
  return <div>About</div>;
}

export const Route = createFileRoute('/about')({
  component: AboutPage,
});
```

Nested routes mirror the filesystem:

```
src/routes/
  __root.tsx        # Root layout (TopNav, Sidebar)
  index.tsx         # /#/
  tools/
    index.tsx       # /#/tools
    metronome.tsx   # /#/tools/metronome
```

Link with `import { Link } from '@tanstack/react-router'` — `<Link to="/tools/metronome" />`.

## Query Parameters (page state)

Persist every user-visible setting in URL search params so links are shareable and refresh-safe. Validate with Zod via `@tanstack/zod-adapter`.

```tsx
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { zodValidator } from '@tanstack/zod-adapter';
import { z } from 'zod';

// Types
interface SearchParams {
  bpm?: number;
  enabled?: boolean;
  mode?: string;
}

const searchSchema = z.object({
  bpm: z.number().optional(),
  enabled: z.boolean().optional(),
  mode: z.string().optional(),
});

// Main component
function ToolPage() {
  const navigate = useNavigate({ from: '/tool' });
  const search = Route.useSearch();

  const updateSearch = useCallback(
    (updates: Partial<SearchParams>) => {
      navigate({
        search: prev => ({ ...prev, ...updates }),
        replace: true,
      });
    },
    [navigate],
  );

  const value = search.bpm ?? DEFAULT_VALUE;
  return <Control value={value} onChange={v => updateSearch({ bpm: v })} />;
}

export const Route = createFileRoute('/tool')({
  component: ToolPage,
  validateSearch: zodValidator(searchSchema),
});
```

Guidelines:

- `replace: true` on every update so the back button doesn't fill with slider drags.
- Always `zodValidator(schema)` — never raw `validateSearch`.
- Provide defaults when params are undefined; keep names short but descriptive.

## Adding a New Page

Before implementing, answer:

- How do you suggest we implement it?
- Do we need to install any packages?
- What functions and options should it have?
- What is the ideal route path?

**Required: show an ASCII layout for desktop and mobile (plus any dialogs) before writing code.**

```
┌─────────────────────────────┐
│  Header / TopNav            │
├─────────────────────────────┤
│                             │
│  Main content area          │
│                             │
├─────────────────────────────┤
│  Controls / Footer          │
└─────────────────────────────┘
```

Then:

1. **Create the route** at `src/routes/<page-name>.tsx`.
2. **Register in nav** — add an entry to `src/lib/nav.ts` (title, href, icon, description). This drives the sidebar, the mobile nav, and the homepage grid.
3. **Add to homepage** — add a card in `src/routes/index.tsx` if it should be discoverable there.
4. **Update `README.md`** Features list.
5. **Register keyboard shortcuts** (if any) with `useRegisterShortcuts` so they show in the TopNav help popover, and implement the actual `keydown` handler:

   ```tsx
   import { useRegisterShortcuts } from '@/hooks/use-keyboard-shortcuts';

   useRegisterShortcuts([
     { key: 'Space', label: 'Start / Stop' },
     { key: 'T', label: 'Tap tempo' },
   ]);

   useEffect(() => {
     const handleKeyDown = (e: KeyboardEvent) => {
       const target = e.target as HTMLElement;
       if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
         return;
       }
       if (e.code === 'Space') {
         e.preventDefault();
         // handle action
       }
     };
     window.addEventListener('keydown', handleKeyDown);
     return () => window.removeEventListener('keydown', handleKeyDown);
   }, []);
   ```

6. Put reusable state logic in `src/hooks/use-*.ts` and pure helpers in `src/lib/`.

Checklist:

- [ ] Route file created in `src/routes/`
- [ ] Navigation item added to `src/lib/nav.ts`
- [ ] Home page updated (if applicable)
- [ ] `README.md` features list updated
- [ ] Query parameters for settings (if applicable)
- [ ] Keyboard shortcuts registered (if applicable)
