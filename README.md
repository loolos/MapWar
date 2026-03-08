# MapWar

A modern, turn-based 2D strategy game built with **Phaser 3** and **TypeScript**. Command your army, manage your economy, and conquer the map against intelligent AI opponents.

**[🎮 Play Live Demo](https://loolos.github.io/MapWar/)**

## 🌟 Features

### 🗺️ Dynamic Terrain
*   **Plain**: Standard terrain for movement and building.
*   **Hill**: Rugged terrain that doubles movement costs.
*   **Water**: Natural barriers that require **Bridges** to cross.

### 🏰 Buildings & Economy
Manage your gold wisely to expand your empire:
*   **Base**: Your headquarters. Upgrade it to boost income and defense.
*   **Towns**: Capture towns that grow over time, providing increasing income.
*   **Farms**: Build and upgrade farms (Lv 1-3) for steady resource generation.
*   **Gold Mines**: Secure these depleting resources for a quick influx of gold.
*   **Walls**: Fortify your borders. Walls provide defense bonuses and protect adjacent tiles.
*   **Watchtowers**: Strategic structures that provide support to nearby operations, reducing the cost of nearby attacks.
*   **Bridges**: Connect continents and cross bodies of water.

### ⚔️ Combat & Strategy
*   **Turn-Based Tactics**: Plan your moves carefully. Select multiple cells to conquer or attack in a single turn.
*   **Aura System**: 
    *   **Base Defense**: Protects core territory.
    *   **Wall Defense**: Strengthens nearby units.
*   **Dynamic Events**: Adapt to random world events like **Floods** (water levels rise/recede) and **Peace Days** (combat becomes expensive).
*   **Cost Multipliers**: Attack costs increase for distant enemies and fortified positions.

### 🤖 Advanced AI
*   Challenge yourself against AI opponents with adjustable difficulty (**Easy, Medium, Hard**).
*   AI uses advanced pathfinding and utility-based decision making.
*   Includes scripts for AI self-play training and benchmarking.

## 🛠️ Development

### Prerequisites
*   Node.js (v16+ recommended)
*   npm

### Setup
Clone the repository and install dependencies:

```bash
git clone https://github.com/loolos/MapWar.git
cd MapWar
npm install
```

### Run Locally
Start the development server:
```bash
npm run dev
```

### Testing
Run the test suite using Vitest:
```bash
npm test
```

### AI Tools
The project includes scripts for AI training and benchmarking:
```bash
# Run AI self-play
npm run ai:selfplay

# Benchmark AI performance
npm run ai:selfplay:benchmark

# Tune AI parameters
npm run ai:selfplay:tune
```


## 📚 Documentation

*   `docs/ai_agent_onboarding.md` - entry guide for future AI agents.
*   `docs/game_architecture.md` - gameplay systems and turn/event model.
*   `docs/code_architecture.md` - codebase layering, module map, and extension workflow.
*   `docs/ui_design_principles.md` - responsive UI layout contract.
*   `docs/logging_policy.md` - user-facing logging standards.

## 💻 Tech Stack
*   **Engine**: [Phaser 3](https://phaser.io/)
*   **Language**: [TypeScript](https://www.typescriptlang.org/)
*   **Bundler**: [Vite](https://vitejs.dev/)
*   **Testing**: [Vitest](https://vitest.dev/)
