# AI Agent Onboarding Guide

This onboarding note is for future AI agents working on MapWar.

## 1. Existing Documentation Review

Before coding, read these docs first:

1. `README.md`
   - Project goals, feature overview, local run/test commands.
2. `docs/ui_design_principles.md`
   - Responsive layout contract for portrait/landscape.
   - `MainScene.resize()` work must preserve this behavior.
3. `docs/logging_policy.md`
   - Rules for user-facing logs (human-only, severity semantics).
4. `docs/game_architecture.md`
   - Gameplay systems and turn/event mechanics (domain view).
5. `docs/code_architecture.md`
   - Code map, runtime layering, and safe extension points.

## 2. Fast Start (for agents)

```bash
npm install
npm run dev
npm run test:run
```

## 3. Where to Edit (Decision Tree)

- **Gameplay rule/cost/event/AI logic**: start in `src/core/`.
- **Visual/layout/input/UI rendering**: start in `src/renderer/`.
- **Map generation behavior**: `src/core/map/MapGenerator.ts`.
- **Benchmark/training workflows**: `scripts/` AI scripts.

## 4. Invariants to Preserve

- Human and AI must follow the same gameplay validation rules.
- Cost displayed to players should match execution-time cost logic.
- Layout contracts from `docs/ui_design_principles.md` must not regress.
- UI log behavior must follow `docs/logging_policy.md`.

## 5. Recommended PR Hygiene for Agents

- Keep changes layer-local when possible.
- Add or update nearby tests for touched logic.
- Document rule changes in `docs/` when behavior shifts.
- Prefer small, reviewable commits with explicit intent.

