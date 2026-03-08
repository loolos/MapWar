# Code Architecture (AI-Agent Onboarding)

This document explains **where logic lives** in MapWar and how data flows across modules, with an emphasis on safe entry points for future AI agents.

## 1. Repository Map

- `src/main.ts`: Phaser bootstrap and scene registration.
- `src/renderer/`: Phaser scenes + UI rendering systems.
- `src/core/`: game rules, state, engine, AI, events, interactions.
- `src/core/map/`: procedural map generation.
- `src/core/saves/`: preset scenarios for testing/demo.
- `src/core/audio/`: sound manager (with fallback behavior).
- `scripts/`: AI tooling (self-play, benchmark, evolution, tournament, profile labeling).
- `docs/`: design policies and architecture docs.

## 2. Runtime Layering

Use this layered mental model:

1. **Boot layer** (`src/main.ts`)
   - Creates Phaser game config and loads `MenuScene` + `MainScene`.
2. **Presentation layer** (`src/renderer/*`)
   - Handles user input, camera/layout, and visual/UI systems.
3. **Orchestration layer** (`src/core/GameEngine.ts`)
   - Executes turn flow, planning/commit logic, AI triggering, and event integration.
4. **Domain/state layer** (`src/core/GameState.ts`, `GameStateManager.ts`, `Cell.ts`)
   - Owns canonical game state and state mutations.
5. **Rule subsystems** (`CostSystem.ts`, `AuraSystem.ts`, `interaction/*`, `events/*`)
   - Encapsulate specialized calculations and behavior.

## 3. Main Control Flow

### 3.1 Scene Flow
- `MenuScene` gathers map/player setup and starts `MainScene` with payload.
- `MainScene` constructs `GameEngine`, optionally loads a preset save, then binds input + UI systems.

### 3.2 Input to State Mutation
- Pointer/keyboard input is interpreted in `MainScene`.
- UI actions are translated into engine operations (plan move, interaction, end turn).
- `GameEngine` validates/apply rules via subsystems and mutates state through `GameStateManager`/`GameState`.
- Renderer refreshes map/UI from engine state snapshots.

### 3.3 AI Turn Path
- `GameEngine` detects AI-controlled current player.
- `AIController` selects planned actions under budget/profile constraints.
- Engine executes AI actions through the same move/cost/validation pipeline.

## 4. Important Core Modules

### 4.1 `GameEngine`
Primary facade for gameplay operations:
- pending move plan and interaction queue
- turn transitions and round progression
- integration with turn events
- AI/autoplay orchestration
- emits typed game events for UI/logging

### 4.2 `GameState` + `GameStateManager`
- `GameState` stores grid, players, turn counters, map features, ownership indexes, and serialization.
- `GameStateManager` is a thin mutation/delegation wrapper used by `GameEngine`.

### 4.3 `InteractionRegistry`
- Central registry of contextual actions (build/upgrade/etc.).
- Interaction definitions include availability, cost, labels/descriptions, and execute callbacks.
- Experimental interactions are feature-gated.

### 4.4 `CostSystem`
- Central place for cost computation and multipliers (terrain, distance, defense, events, etc.).
- Should remain source-of-truth for both UI estimates and execution-time checks.

### 4.5 `AuraSystem`
- Evaluates local support/defense effects (e.g., walls/watchtowers/base aura).
- Used by cost/validation and strategic overlays.

### 4.6 `TurnEventSystem`
- Schedules and resolves random/forced/persistent events by round.
- Supports prechecks, deferral behavior, and selected-player targeting.

## 5. UI System Decomposition

Inside `src/renderer/ui/`:

- `ActionButtonSystem`: action buttons and command entry points.
- `PlayerStatusSystem`: current player/status panel.
- `CellInfoSystem`: selected tile detail panel.
- `LogSystem`: colored player-facing logs.
- `NotificationSystem`: temporary toasts/notifications.
- `InteractionMenu`: contextual interaction picker.

`MainScene.resize()` is the critical responsiveness path and should stay aligned with `docs/ui_design_principles.md`.

## 6. Testing Topology

Tests live next to core/renderer modules as `*.test.ts`.

Frequent clusters:
- Core rule tests: costs, validation, interactions, structures, events, aura.
- AI tests: behavior, robustness, controller logic.
- Renderer tests: layout/viewport/UI constraints.

Use `npm run test:run` for non-watch CI-style execution.

## 7. AI Agent Onboarding Workflow

Recommended sequence for new agents:

1. Read `README.md` and docs under `docs/`.
2. Locate affected layer (`renderer` vs `core`) before editing.
3. Reuse existing subsystem APIs (`CostSystem`, `InteractionRegistry`, `TurnEventSystem`) instead of duplicating rules.
4. Add/adjust targeted tests near changed modules.
5. Run at least relevant tests; prefer full `npm run test:run` if feasible.
6. Keep UI changes consistent with the layout and logging policies in docs.

## 8. Safe-Change Rules for Agents

- Prefer extending registries/systems over adding parallel ad-hoc logic.
- Keep serialization compatibility in mind (`GameState.serialize/deserialize`).
- Do not hardcode player IDs/count assumptions outside existing config pathways.
- Ensure human and AI paths remain rule-consistent.
- If changing event probabilities/mechanics, update docs + tests together.

