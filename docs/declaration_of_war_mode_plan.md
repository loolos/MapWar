# Declaration of War Mode - Implementation Plan

## 1) Goal

Add an optional game mode called **Declaration of War Mode**.

When this mode is enabled:
- Players cannot capture enemy territory unless they are in an active war relationship.
- War is declared from an interaction on the opponent's base.
- War starts at end-of-turn (not immediately), so the declarer must wait until the next turn to attack.
- Declaring war is bilateral: both players become at war with each other.
- War ends if:
  - 5 rounds pass without either side capturing the other's territory, or
  - one side's base is destroyed (player eliminated).
- Eliminated players' territory can be captured by anyone regardless of war status.

When the mode is disabled, capture rules remain unchanged.

---

## 2) High-Level Feature Scope

### 2.1 Menu / Game Setup
- Add a toggle in main menu:
  - `Declaration of War Mode: OFF / ON`
- Pass selected value into `MainScene` and then into `GameEngine`.

### 2.2 Core War State Model
- Add game-level flag: `declarationOfWarModeEnabled`.
- Add runtime diplomacy state in engine:
  - Active war pairs (symmetric relationship).
  - Pending war declarations made this turn (to activate on end-turn).
  - Last round in which either side captured the other's land (for timeout logic).

### 2.3 New Interaction
- Add interaction on enemy base: `DECLARE_WAR`.
- Availability:
  - only when mode is ON
  - tile is enemy base
  - not already at war with that enemy
  - not already declared this turn by current player for that enemy
- Execution:
  - queue declaration for end-turn activation
  - add log message

### 2.4 Capture Restriction Rule
- When mode is ON and target tile is enemy-owned:
  - capture is allowed only if:
    - attacker and defender are currently at war, or
    - defender has already been eliminated (base destroyed, not in active turn order)
- If not allowed, move validation fails with clear reason and log.

### 2.5 War Lifecycle
- **Activation timing**: apply pending declarations right after turn commit, before next player acts.
- **Mutual activation**: declaration between A and B creates active war for both directions.
- **War timeout**: if `currentRound - lastMutualCaptureRound >= 5`, end war.
- **Combat refresh**: any capture where attacker and defender are in active war refreshes `lastMutualCaptureRound`.
- **Base destruction handling**:
  - remove all wars involving eliminated player immediately
  - add log entries for war ending reason

### 2.6 UI Status in Player Panel
- In player status rows, add a second line of small color chips.
- Each chip color corresponds to a player currently at war with that row's player.
- Keep current money/power indicators and place chips below them.

### 2.7 Logging
- Add logs for:
  - declaration queued
  - war activated (end-turn)
  - war timeout end (5 rounds no captures)
  - war ended due to elimination
  - blocked attack due to no war declaration

---

## 3) Data & API Design

## 3.1 Engine Fields
- `declarationOfWarModeEnabled: boolean`
- `activeWars: Map<string, WarState>` (pair-keyed canonical format, e.g. `A|B`)
- `pendingWarDeclarations: Set<string>` (pair-keyed, queued in current turn)

`WarState`:
- `playerA: string`
- `playerB: string`
- `lastCaptureRound: number`

## 3.2 Helper Functions
- `getWarPairKey(a, b): string`
- `isAtWar(a, b): boolean`
- `queueWarDeclaration(a, b): void`
- `activatePendingWars(): void`
- `markWarCapture(attacker, defender): void`
- `endExpiredWars(): void`
- `endWarsInvolving(playerId, reason): void`
- `isPlayerEliminated(playerId): boolean`

## 3.3 Public Read API for UI
- `isDeclarationOfWarModeEnabled(): boolean`
- `getWarOpponents(playerId): string[]`

---

## 4) Integration Points

## 4.1 MenuScene
- Add mode selector in HTML menu.
- Include selected mode value in `scene.start('MainScene', data)`.

## 4.2 MainScene
- Read mode flag from scene data.
- Pass mode flag into `new GameEngine(...)`.

## 4.3 GameEngine
- Constructor accepts new option(s) for mode.
- Hook war logic into:
  - move validation (`validateMove`)
  - interaction registry execution path (declare war action)
  - `commitActions` (capture tracking + elimination war cleanup)
  - `advanceTurn` (activate declarations and timeout checks)

## 4.4 InteractionRegistry
- Register `DECLARE_WAR` action.
- Ensure it appears only on valid enemy base tiles in war mode.

## 4.5 PlayerStatusSystem
- Extend row rendering layout.
- Draw war chips from `engine.getWarOpponents(pid)`.

---

## 5) Edge Cases

- Multiple declarations in one turn against different enemies: all activate at end-turn.
- Duplicate declaration against same enemy in same turn: deduplicate.
- Declaration against already eliminated player: ignore / unavailable.
- War timeout checked every round transition and logs once.
- Eliminated player's lands remain capturable by all even in war mode.
- Mode OFF must preserve existing gameplay behavior exactly.

---

## 6) Test Plan

## 6.1 Automated Tests (core)
- New/updated tests for:
  - declaration interaction availability
  - attack blocked before declaration
  - declaration activates only after end-turn
  - bilateral war relation after activation
  - capture allowed while at war
  - war timeout after 5 rounds without mutual capture
  - war removal on elimination
  - eliminated player land capturable without war
  - mode OFF backward-compatible behavior

## 6.2 Static checks
- Type check: `tsc --noEmit`

## 6.3 Runtime test
- Test suite: `npm run test:run`

## 6.4 Manual UI validation
- Verify menu toggle.
- Verify declare-war interaction on enemy base.
- Verify logs for declaration/activation/end.
- Verify war chips in player status panel.
- Record demo video and include at least one screenshot.
