# Logging System Policy

This document defines the rules for the game's logging system. Log messages are displayed to the user to provide feedback, warnings, and information.

## General Rules
- **Human Players Only**: Logs should only be generated for human players (`!player.isAI`). AI actions should remain silent in the UI log.
- **Message Types**:
    1. **Error (Red)**: Critical validation failures preventing an action.
    2. **Warning (Yellow)**: Important notices about cost adjustments or side effects.
    3. **Info (White)**: General game state information.

## detailed Specifications

### 1. Error Logs (Red)
**Trigger**: When a user attempts to add a move to their pending plan, but the move is invalid.
**Context**: This occurs when `validateMove` fails during an explicit user action (e.g., clicking a tile). It does **not** occur during passive validation (e.g., hovering).
**Current Scenarios (Extensible)**:
- **Insufficient Funds**: "Cannot select: Insufficient Funds! Need X G, have Y G."
- **Disconnected**: "Must connect to Main Base supply line" (if implemented as error log).
- **Invalid Target**: e.g., "Bridges can only be built from existing territory".
*Note: New error triggers can be added here as game rules evolve.*

### 2. Warning Logs (Yellow)
**Trigger**: When a user action is valid but has important implications or cost modifiers.
**Current Scenarios (Extensible)**:
- **Distance Multiplier**: When selecting a tile far from owned territory.
    - Message: "Reminder: Distance Multiplier Active! Cost is higher due to distance."
- **Cascade Cancellation**: When cancelling a move causes subsequent dependent moves to be cancelled.
    - Message: "Dependent moves cancelled." (To be implemented/verified)
*Note: Additional warnings (e.g., breaking alliances, resource caps) should follow this pattern.*

### 3. Info Logs (White)
**Trigger**: Routine game events that provide context.
**Current Scenarios (Extensible)**:
- **Turn Start Income**: Summary of income sources at the start of the turn.
    - Message: "Turn X Start. Income: +Y (Base: A, Land: B, Town: C)."
*Note: Future info logs might include trade offers, weather effects, or tech unlocks.*
