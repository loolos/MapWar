# UI Design Principles & Layout Standards

## Core Layout Philosophy
The game interface adapts dynamically to screen orientation, ensuring optimal playability on both mobile (Portrait) and desktop types (Landscape). Future modifications must strictly adhere to these layouts to prevent regression.

## 1. Portrait Mode (Mobile / Vertical)
**Trigger**: `height > width`
**Layout Strategy**: "4-Corner Quadrants"

| Position | Component | Details |
| :--- | :--- | :--- |
| **Top Left** | **Player Status** | Compact view. Name, Gold, Turn info. |
| **Top Right** | **Cell Info** | Selected cell details. Must be visible. |
| **Center** | **Map Viewport** | Fills space between Top/Bottom bars. |
| **Bottom Left** | **Log Panel** | Scrollable game history. |
| **Bottom Right** | **Buttons** | "End Turn" and actions. |

**Technical Constraints**:
- Top and Bottom bars have fixed height (approx 15% or min 120px).
- Map fills the central void: `height - (topBar + bottomBar)`.

## 2. Landscape Mode (Desktop / Horizontal)
**Trigger**: `width >= height`
**Layout Strategy**: "Symmetric Pillars"

| Position | Component | Details |
| :--- | :--- | :--- |
| **Left Column** | **Status & Info** | **Top**: Player Status.<br>**Bottom**: Cell Info. |
| **Right Column** | **Log & Buttons** | **Top**: Log Panel.<br>**Bottom**: Buttons. |
| **Center** | **Map Viewport** | Strictly centered between columns. |

**Technical Constraints**:
- Side columns have fixed width (e.g., 280px).
- Map Area Width: `width - (LeftColumn + RightColumn)`.
- Backgrounds must typically be drawn for both columns to frame the map.

## 3. Component Behavior
- **Cell Info**: Must be persistent (not purely transient).
- **Log System**: Must be visible in both modes.
- **Responsiveness**: All scaling must happen dynamically in `MainScene.resize()`.
