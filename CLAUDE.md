# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `pnpm dev` — Vite dev server (runs `predev`, which generates `src/drumLooper.gen.ts` from `public/drum-looper/`).
- `pnpm build` — `tsc -b && vite build` (runs `prebuild` which regenerates the drum manifest).
- `pnpm typecheck` — `tsc -b --noEmit`.
- `pnpm lint` — ESLint (flat config, `eslint.config.js`).
- `pnpm format` / `pnpm format:check` — Prettier.
- `pnpm test` — Vitest (watch). `pnpm test -- --run` for one-shot (used in CI). Tests live under `tests/` mirroring the `src/` path (e.g. `tests/lib/tempo-utils.spec.ts` for `src/lib/tempo-utils.ts`) and must match `tests/**/*.{spec,test}.ts` — `src/` stays free of test files.
- Run a single test: `pnpm test -- --run tests/hooks/use-drum-engine.spec.ts` (add `-t "name"` to filter by test name).

Toolchain is pinned to Node 24+ and pnpm 9+ (`.node-version`, `packageManager`). `vite` is overridden to `rolldown-vite` in `pnpm.overrides`.

## Architecture

**SPA deployed to GitHub Pages.** `vite.config.ts` sets `base` to `/music-tools/` under `GITHUB_ACTIONS`, and `src/main.tsx` uses `createHashHistory()` so every route is served from `index.html` (URLs are `/#/path`).

**Routing** is TanStack Router file-based from `src/routes/`. The router plugin auto-generates `src/routeTree.gen.ts` — never hand-edit it. Each route exports `Route = createFileRoute(...)`; page state lives in URL search params validated with Zod via `@tanstack/zod-adapter` (`validateSearch`), updated with `navigate({ search: prev => ..., replace: true })`.

**Drum kit manifest generation.** `scripts/drumLooper.generator.ts` walks `public/drum-looper/` at build time and writes `src/drumLooper.gen.ts`. The `predev`/`prebuild` scripts compile it with `tsc` into `.tmp/generators/` first, then run it with `node`. Adding/removing kit audio files requires re-running dev or build — don't edit `drumLooper.gen.ts` by hand.

**Drum sample hosting in prod.** The deploy workflow sets `VITE_DRUM_SAMPLE_ORIGIN=https://cdn.jsdelivr.net/gh/kalmigs/music-tools@main/public` and then `rm -rf dist/drum-looper` before upload, so samples are served from jsDelivr, not from the Pages artifact.

**Drum project share links.** `src/lib/drum-looper-url-state.ts` serializes a full project to `?state=` via JSON + `lz-string` (`compressToEncodedURIComponent`) and validates on read with the Zod schema in `src/lib/drum-looper-types.ts`.

**PWA.** `vite-plugin-pwa` with `registerType: 'autoUpdate'`. Manifest `id`/`start_url`/`scope` all track the `base` path, so they change between local and GH Pages builds.

**Audio/UI architecture.** Each tool has a `use-*.ts` hook in `src/hooks/` that owns its `AudioContext` and state machine (`use-metronome`, `use-tuner`, `use-drum-engine`, `use-tap-tempo`), with pure helpers in `src/lib/` (`tempo-utils`, `tuner-utils`, `drum-looper-*`). Route components in `src/routes/` bind hook state to URL search params and UI.

**UI layer** is [basecn](https://basecn.dev) (shadcn/ui rebuilt on Base UI) in `src/components/ui/`. Install new components with `pnpm dlx shadcn@latest add https://basecn.dev/r/<name>.json`. Layout shell (`TopNav`, `Sidebar`, `ThemeContext`, `SidebarContext`, `KeyboardShortcutsContext`) is in `src/components/layout/` and mounted by `src/routes/__root.tsx`.

**Theme** uses OKLCH CSS variables in `src/index.css` (`--primary`, `--background`, etc.) with a `.dark` override — red primary, neutral sidebar. Always style with semantic Tailwind classes (`bg-primary`, `bg-sidebar`) — not hardcoded palette colors — so dark mode works.

## Conventions

- Imports grouped `react → external → @/components → @/hooks → @/lib`, alphabetized within groups. File structure: Imports → Types → Constants → Helpers → Subcomponents → Main component → Route export.
- `@/*` resolves to `src/*` (`vite.config.ts` + `tsconfig`).
- Prettier: single quotes, trailing commas, 100-char width.
- Type-only imports: `import type { Foo }` or `import { type Foo }`.
- Conventional commit types: `feat`, `fix`, `docs`, `style`, `refactor`, `chore`.

## Further reading

Scope-limited conventions live in nested `CLAUDE.md` files, which Claude auto-loads when working in that subtree:

- `src/routes/CLAUDE.md` — TanStack Router + hash history, Zod-validated query params, new-page checklist (incl. required ASCII layout mockup).
- `src/components/CLAUDE.md` — Base UI / basecn install + import patterns.
- `src/components/layout/CLAUDE.md` — `TopNav`/`Sidebar`/`ThemeContext`/`SidebarContext` usage and `src/lib/nav.ts`.

Global reference docs in `docs/` — consult when relevant:

- `docs/file-organization.md` — in-file section order, import grouping, alphabetization.
- `docs/theme-styling.md` — OKLCH CSS variables and semantic Tailwind classes.
- `docs/git-conventions.md` — commit + PR format.

## CI

`.github/workflows/deploy.yml` runs on push to `main`: `pnpm audit --audit-level=high` → `pnpm test -- --run` → `pnpm build` (with the jsDelivr sample origin env) → strip `dist/drum-looper` → deploy to GitHub Pages.
