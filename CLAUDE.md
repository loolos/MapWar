# CLAUDE.md — AI Assistant Guide for MapWar

## Project Overview

MapWar is a turn-based 2D strategy game built with **Phaser 3** and **TypeScript**. Players command armies, manage economies, and conquer territory on grid-based maps against AI opponents. The game is client-side only (no backend) and deploys to GitHub Pages.

**Live**: https://loolos.github.io/MapWar/

## Quick Reference

```bash
npm install              # Install dependencies
npm run dev              # Vite dev server (http://localhost:5173)
npm run build            # Production build (tsc && vite build)
npm test                 # Vitest in watch mode
npm run test:run         # Single test run
npm run check            # Full validation: tsc + vitest + AI benchmark
```

The **pre-commit hook** (Husky) runs `npm run check` — type checking, all tests, and a quick AI benchmark must pass before any commit lands.

## Tech Stack

| Layer       | Technology                    |
| ----------- | ----------------------------- |
| Engine      | Phaser 3 (v3.90.0)           |
| Language    | TypeScript (~5.9.3, strict)   |
| Bundler     | Vite (v7.2.4)                 |
| Tests       | Vitest (v4.0.16)              |
| Audio       | Tone.js (procedural synthesis)|
| Scripts     | tsx (TypeScript executor)      |
| Hooks       | Husky (v9.1.7)                |
| Deploy      | GitHub Pages via Actions       |

## Project Structure

```
src/
├── core/                     # Game logic (no rendering dependencies)
│   ├── GameEngine.ts         # Central orchestrator — turn flow, actions, validation
│   ├── GameState.ts          # Grid state, player data, serialization
│   ├── GameConfig.ts         # All balance constants (costs, bonuses, caps)
│   ├── GameStateManager.ts   # State mutation helper
│   ├── Cell.ts               # Cell model with serialization
│   ├── Actions.ts            # Action type definitions
│   ├── GameEvents.ts         # Strongly-typed event emitter
│   ├── AuraSystem.ts         # Defense/income aura calculations
│   ├── CostSystem.ts         # Move/attack cost computation with breakdowns
│   ├── AIController.ts       # AI decision engine (utility-based scoring)
│   ├── ai/
│   │   └── AIProfile.ts      # 140+ weighted parameters for AI behavior
│   ├── audio/
│   │   └── SoundManager.ts   # Tone.js procedural audio
│   ├── events/
│   │   └── TurnEventSystem.ts # Flood, Peace Day, Blood Moon events
│   ├── interaction/
│   │   ├── InteractionRegistry.ts
│   │   └── InteractionTypes.ts
│   ├── map/
│   │   └── MapGenerator.ts   # 5 map types: default, archipelago, pangaea, mountains, rivers
│   ├── saves/                # Save scenario presets
│   └── *.test.ts             # ~35 test files (colocated with source)
├── renderer/                 # Phaser scenes and UI (depends on core/)
│   ├── MainScene.ts          # Primary game scene — rendering, input, camera
│   ├── MenuScene.ts          # Game setup menu
│   ├── AuraVisualizer.ts     # Aura overlay rendering
│   └── ui/                   # Modular UI systems
│       ├── ActionButtonSystem.ts
│       ├── PlayerStatusSystem.ts
│       ├── CellInfoSystem.ts
│       ├── LogSystem.ts
│       ├── NotificationSystem.ts
│       └── InteractionMenu.ts
├── utils/
│   └── TextureUtils.ts
├── main.ts                   # Phaser game bootstrap
└── style.css
scripts/                      # AI training infrastructure (run via tsx)
├── ai_selfplay.ts            # Self-play games
├── ai_selfplay_benchmark.ts  # Win-rate benchmarks
├── ai_evolve.ts              # Genetic algorithm weight optimization
├── ai_tournament.ts          # Tournament runner
└── ai_tournament_lib.ts      # Tournament infrastructure
docs/
├── logging_policy.md         # Log message standards
└── ui_design_principles.md   # Responsive layout rules
.agent/workflows/             # Agent workflow definitions
├── test-and-fix.md           # Test, diagnose, fix loop
├── verify.md                 # Start dev server and verify in browser
└── upload.md                 # Check, build, commit, push
```

## Architecture

The codebase follows a strict **core/renderer separation**:

- **`src/core/`** — Pure game logic with zero rendering dependencies. All game rules, AI, costs, events, and state live here. This layer is testable in isolation.
- **`src/renderer/`** — Phaser scenes and UI components. Depends on `core/` but never the reverse.
- **Communication** — The `TypedEventEmitter` in `GameEvents.ts` provides a strongly-typed event bus between core and renderer. Events cover state changes, SFX triggers, and UI updates (40+ event types).

Key classes:
- `GameEngine` orchestrates turns, validates actions, coordinates AI
- `GameState` holds the grid (`Cell[][]`), player data, and turn state
- `GameConfig` contains all balance constants — costs, caps, bonuses
- `CostSystem` computes costs with detailed breakdowns (terrain, auras, distance)
- `AIController` scores candidate actions using weighted profiles from `AIProfile.ts`

## Code Conventions

### TypeScript
- **Strict mode** is enforced: `strict`, `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`
- Target: ES2022, module resolution: bundler
- Use `.ts` imports with extensions (`allowImportingTsExtensions`)
- No `any` types — use proper typing throughout
- `verbatimModuleSyntax` is enabled — use `import type` for type-only imports

### Naming
- `PascalCase` for classes and types
- `camelCase` for functions, methods, variables
- `UPPER_SNAKE_CASE` for constants in `GameConfig` and `AIProfile`
- Private fields use `#` prefix or `_` prefix

### Testing
- Tests are **colocated** with source files (e.g., `GameEngine.test.ts` alongside `GameEngine.ts`)
- Use Arrange-Act-Assert pattern
- Test files use Vitest (`describe`, `it`, `expect`, `beforeEach`)
- For debugging tests: use `console.error` instead of `console.log` (Vitest suppresses stdout for passing tests)
- Verbose test output: `npx vitest run --reporter=verbose path/to/test.ts`

### Logging
- Log messages are for **human players only** — AI actions are silent in the UI log
- Three severity levels: Error (red), Warning (yellow), Info (white)
- See `docs/logging_policy.md` for detailed rules

### UI Layout
- Responsive design with two modes: Portrait ("4-Corner Quadrants") and Landscape ("Symmetric Pillars")
- All layout scaling happens in `MainScene.resize()`
- See `docs/ui_design_principles.md` for layout rules and constraints

## Common Workflows

### Making changes
1. Edit source files in `src/`
2. Run `npm run check` to validate (types + tests + AI benchmark)
3. Fix any failures before committing

### Running tests
```bash
npm test                    # Watch mode (re-runs on change)
npm run test:run            # Single run
npx vitest run src/core/GameEngine.test.ts  # Single file
```

### AI training scripts
```bash
npm run ai:selfplay                          # Run self-play games
npm run ai:selfplay:benchmark -- --quick     # Quick benchmark
npm run ai:evolve                            # Genetic algorithm optimization
npm run ai:tournament                        # Tournament between profiles
```

### Build and deploy
- `npm run build` produces output in `dist/`
- Vite base path is `/MapWar/` (matches GitHub repo name)
- GitHub Actions workflow (`.github/workflows/deploy.yml`) auto-deploys `main` to Pages

## Key Design Details

### Game Mechanics
- **Grid**: 10x10 (configurable via `GameConfig`)
- **Terrain**: Plain, Hill (2x movement cost), Water (requires bridges)
- **Economy**: Base gold + land income + town/farm/mine income + aura bonuses
- **Combat**: Movement (5G), Attack (20G), with multipliers for terrain, distance, defenses, auras
- **Buildings**: Base, Town, Farm, Wall, Watchtower, Bridge, Lighthouse, Citadel — each with upgrade levels
- **Turn Events**: Flood, Peace Day, Blood Moon — random or forced at specific turns
- All balance values live in `GameConfig.ts`

### AI System
- Utility-based decision-making with 140+ weighted parameters in `AIProfile.ts`
- Evaluates candidates across categories: attack, expand, defend, farm, base upgrade
- Supports early/mid/endgame strategy shifting
- Profiles are evolved via genetic algorithm (`scripts/ai_evolve.ts`)
- Tournament system benchmarks profiles against each other

### Audio
- Fully procedural via Tone.js — no audio files
- Music states: PEACE, TENSION, CONFLICT, DOOM, PEACE_DAY
- SFX for all game actions (attack, capture, build, events)

## Important Notes

- The pre-commit hook runs `npm run check` which includes type checking, all tests, AND a quick AI benchmark. All three must pass.
- `GameEngine.ts` (~75KB) and `MainScene.ts` (~94KB) are the largest files. Changes to these require careful attention to side effects.
- Game state is fully serializable to JSON — save/load works through `GameState` serialization.
- There is no backend or database — everything runs client-side in the browser.
- The `scripts/` directory contains AI training infrastructure that runs outside the browser via `tsx`.
