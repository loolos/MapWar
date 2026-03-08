# Game Architecture (AI-Agent Oriented)

This document explains **how MapWar works as a game system** (rules, turn flow, progression, and key mechanics), so future AI agents can reason about gameplay before editing code.

## 1. High-Level Game Model

MapWar is a turn-based territory strategy game on a grid map.

- Players take turns spending gold to claim/attack cells and trigger interactions.
- Control of territory drives income, which funds future expansion.
- The game combines static map features (terrain, towns, citadel, lighthouse) with dynamic events (flood, peace day, blood moon).
- Humans and AI use the same core rules.

## 2. Core Gameplay Pillars

### 2.1 Territory and Ownership
- Every cell may be neutral or owned by a player.
- Capturing neutral/enemy cells is the main expansion mechanic.
- Supply-line connectivity matters for legality and strategic value.

### 2.2 Economy Loop
- Gold is the main resource.
- Start-of-turn income is derived from owned land and buildings.
- Gold mines and treasures provide burst or extra value.
- Spend decisions are made in a planning phase, then committed.

### 2.3 Tactical Structures
- **Base**: anchor structure and defensive core.
- **Town**: growable economy structure (multi-level).
- **Farm**: upgradable income structure.
- **Wall**: local defense and adjacency benefits.
- **Watchtower**: support aura that can reduce nearby attack costs.
- **Bridge**: enables crossing water.
- **Citadel/Lighthouse**: special map objectives with global or strategic impact.

### 2.4 Terrain + Distance Pressure
- Terrain (plain/hill/water/bridge) modifies access/cost.
- Distance and defense modifiers make remote aggression expensive.
- This creates a natural front line and tempo management problem.

## 3. Turn Lifecycle

A practical mental model for agents:

1. **Turn starts**
   - Current player receives income.
   - Timed/round-based effects are updated.
2. **Planning phase**
   - Player queues moves (multi-cell planning) and interactions.
   - Validation/cost estimation happens before commit.
3. **Commit phase**
   - Planned actions execute in order.
   - Ownership/building/economy changes are applied.
4. **Post-commit systems**
   - Elimination checks, aura updates, town progression, mine depletion, etc.
   - Event hooks/logs/UI updates fire.
5. **End turn**
   - Next player rotates in; AI turn may auto-trigger.

## 4. Dynamic World Event Layer

The game includes round-triggered events that temporarily modify normal rules:

- **Flood**: converts/affects terrain and can later recede.
- **Peace Day**: raises combat cost (discourages aggression).
- **Blood Moon**: lowers attack friction (encourages aggression).

Events are probabilistic with guard conditions and can be deferred when invalid for current context.

## 5. Win/Loss and Competitive Arc

- Players can be eliminated when core conditions are met (e.g., losing critical presence).
- Remaining-player progression continues until winner resolution.
- The game pacing is shaped by economy snowball, structure upgrades, and event timing.

## 6. AI-Relevant Gameplay Constraints

When building or editing AI behavior, preserve these invariants:

- Use the same validation path as human moves.
- Do not bypass cost rules, connectivity, or terrain passability.
- Respect event-modified costs.
- Keep planning deterministic enough for tests when using seeded randomness.

## 7. Agent Change Safety Checklist (Gameplay)

Before merging gameplay changes:

- Confirm cost/validation parity between human and AI paths.
- Verify turn event effects are reversible where intended (e.g., flood recede).
- Re-check edge cases: disconnected territory, wall/watchtower modifiers, bridge legality.
- Run related core tests first (cost, AI, interactions, events).

