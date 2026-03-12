# AGENTS.md

## Cursor Cloud specific instructions

### Overview

MapWar is a fully client-side turn-based 2D strategy game using Phaser 3, TypeScript, and Vite. There is no backend, database, or Docker dependency.

### Key commands

All standard dev commands are in `package.json` scripts:

- **Dev server**: `npm run dev` (Vite, serves at `http://localhost:5173/MapWar/`)
- **Type check**: `tsc --noEmit`
- **Tests**: `npm run test:run` (Vitest, 229 tests)
- **Full check** (pre-commit): `npm run check` (type check + tests + quick AI benchmark)
- **Build**: `npm run build` (tsc + vite build → `dist/`)

### Caveats

- The Vite config sets `base: '/MapWar/'`, so the local dev URL is `http://localhost:5173/MapWar/` (not just `/`).
- Husky pre-commit hook runs `npm run check`, which includes a quick AI self-play benchmark. This can take a few seconds.
- The `tsconfig.json` only includes `src/` — scripts in `scripts/` are not type-checked by `tsc --noEmit`.
- AI tooling scripts (`scripts/*.ts`) run via `tsx` and are optional for core development.
