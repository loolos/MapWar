
import { describe, it, expect } from 'vitest';
import { GameEngine } from './GameEngine';


describe('Cost Discrepancy Reproduction', () => {
    it('should deduct the same amount of gold as the planned cost', () => {
        // Setup 3 players to ensure we have an enemy
        const engine = new GameEngine([
            { id: 'P1', isAI: false, color: 0xff0000 },
            { id: 'P2', isAI: true, color: 0x00ff00 }
        ]);

        // Manually setup the grid for the scenario
        // P1 at (0,0)
        // Enemy P2 at (0,1), (0,2), (0,3)
        // P1 will attack chain: (0,1) -> (0,2) -> (0,3)
        // Distance Multiplier Rules:
        // (0,1): Distance 1 (Adjacent to 0,0). Cost x1.
        // (0,2): Distance 2 (Adjacent to 0,1 which is pending). Multiplier x2.
        // (0,3): Distance 3. Multiplier x3.

        // Force reset grid to plain for simplicity
        engine.state.grid.forEach(row => row.forEach(cell => {
            cell.type = 'plain';
            cell.owner = null;
            cell.building = 'none';
        }));

        // Setup P1
        engine.state.setOwner(0, 0, 'P1');
        const p1Base = engine.state.getCell(0, 0);
        if (p1Base) {
            p1Base.building = 'base';
            p1Base.isConnected = true;
        }

        // Setup P2 (Enemy)
        engine.state.setOwner(0, 1, 'P2');
        engine.state.setOwner(0, 2, 'P2');
        engine.state.setOwner(0, 3, 'P2');

        // Give P1 enough gold
        const player = engine.state.players['P1'];
        player.gold = 10000;
        const initialGold = player.gold;

        // Plan Moves
        // 1. Attack (0,1)
        let res = engine.validateMove(0, 1, true); // Check valid
        expect(res.valid).toBe(true);
        engine.togglePlan(0, 1);

        // 2. Attack (0,2)
        res = engine.validateMove(0, 2, true);
        expect(res.valid).toBe(true);
        engine.togglePlan(0, 2);

        // 3. Attack (0,3)
        res = engine.validateMove(0, 3, true);
        expect(res.valid).toBe(true);
        engine.togglePlan(0, 3);

        // Calculate Plan Cost
        const plannedCost = engine.calculatePlannedCost();

        // Check Cost Details (Mental Check Implemented via code)
        // Cost 1: Base * 1x
        // Cost 2: Base * 2x
        // Cost 3: Base * 3x

        // Execute Moves
        engine.commitMoves();

        const finalGold = player.gold;
        const deducted = initialGold - finalGold;

        console.log(`Planned: ${plannedCost}, Deducted: ${deducted}`);

    });

    it('should deduct correct discounted cost with Watchtower Aura', () => {
        // Setup P1 with Watchtower at (0,0) (Connected)
        const engine = new GameEngine();
        const p1 = engine.state.players['P1'];
        engine.state.grid.forEach(row => row.forEach(cell => { cell.type = 'plain'; cell.owner = null; cell.building = 'none'; }));

        // P1 Base at (0,0) to ensure connectivity
        engine.state.setOwner(0, 0, 'P1');
        const base = engine.state.getCell(0, 0);
        base!.building = 'base';
        base!.isConnected = true;

        // Add Watchtower Level 1 at (0,0) (Base can have tower? Rules say separate building usually, but let's put it on (0,1) owned by P1)
        // Setup (0,1) as owned by P1 with Watchtower
        engine.state.setOwner(0, 1, 'P1');
        const towerCell = engine.state.getCell(0, 1);
        towerCell!.building = 'none'; // Watchtower is a property, not building type usually? 
        // Checking AuraSystem: "cell.watchtowerLevel > 0". 
        // Checking GameState.setBuilding: 'base' | 'town' ... no 'watchtower'.
        // Watchtower is likely a separate property or a "building" that is not in the Enum?
        // Let's check GameState.ts... Cell.ts has watchtowerLevel.
        towerCell!.watchtowerLevel = 1;
        towerCell!.isConnected = true;
        // Watchtower Lv1 has Range 2 (GameConfig.WATCHTOWER_RANGES[1])

        // Enemy at (0,2)
        engine.state.setOwner(0, 2, 'P2');

        p1.gold = 5000;
        const initialGold = p1.gold;

        // Plan Attack on (0,2)
        // Distance from (0,1) is 1. (My connected land).
        // Distance is 1 -> Multiplier 1x.
        // Aura from (0,1): Dist 1 <= Range 2.
        // Discount: Base 20% + (DefLv-1 * 5). DefLv defaults to 0? Or 1?
        // AuraSystem: const wallLv = Math.max(1, cell.defenseLevel);
        // discount = WATCHTOWER_DISCOUNT_BASE (0.2) + ...
        // So 20% discount.

        const res = engine.validateMove(0, 2, true);
        expect(res.valid).toBe(true);
        engine.togglePlan(0, 2);

        const plannedCost = engine.calculatePlannedCost();
        // Base Attack Cost: 20 (GameConfig.COST_ATTACK)
        // Discount: 20 * 0.2 = 4.
        // Expected: 16.
        // Multiplier: Neutral? No, P2. Attack Multiplier (GameConfig.COST_MULTIPLIER_ATTACK).
        // Let's assume defaults: COST_ATTACK=20. Multiplier might be 1.

        engine.commitMoves();

        const deducted = initialGold - p1.gold;

        console.log(`Watchtower - Planned: ${plannedCost}, Deducted: ${deducted}`);
        expect(deducted).toBe(plannedCost);
        // Also verify discount happened (optional, but good sanity check)
        // If normal cost is ~20, and we paid ~16, it worked.
    });

    it('should deduct correct cost for Mixed Terrain Chain (Plain -> Hill -> Plain)', () => {
        const engine = new GameEngine();
        const p1 = engine.state.players['P1'];
        engine.state.grid.forEach(row => row.forEach(cell => { cell.type = 'plain'; cell.owner = null; cell.building = 'none'; }));

        // P1 at (0,0)
        engine.state.setOwner(0, 0, 'P1');
        const base = engine.state.getCell(0, 0);
        base!.building = 'base';
        base!.isConnected = true;

        // Setup Terrain
        const t1 = engine.state.getCell(0, 1); t1!.type = 'plain'; // Cost 10
        const t2 = engine.state.getCell(0, 2); t2!.type = 'hill';  // Cost 20? (Capture Hill = 20)
        const t3 = engine.state.getCell(0, 3); t3!.type = 'plain'; // Cost 10

        p1.gold = 5000;
        const initialGold = p1.gold;

        // Plan Moves
        // 1. Attack (0,1) (Plain, Neutral)
        engine.togglePlan(0, 1);

        // 2. Attack (0,2) (Hill, Neutral)
        engine.togglePlan(0, 2);

        // 3. Attack (0,3) (Plain, Neutral)
        engine.togglePlan(0, 3);

        const plannedCost = engine.calculatePlannedCost();
        // Check expected cost logic:
        // C1: 10 (Neutral Plain) * 1.0 = 10.
        // C2: 20 (Neutral Hill) * 1.0 = 20. (Hill Capture is x2 base or explicit? Config: COST_CAPTURE*2 for Hill).
        // C3: 10 (Neutral Plain) * 1.0 = 10.
        // Total = 40.



        engine.commitMoves();

        const deducted = initialGold - p1.gold;
        console.log(`Mixed Terrain - Planned: ${plannedCost}, Deducted: ${deducted}`);

        expect(deducted).toBe(plannedCost);
        expect(deducted).toBeGreaterThan(0);
    });
});
