import { GameConfig } from './GameConfig';
import { GameState } from './GameState';
import { AuraSystem } from './AuraSystem';

export class CostSystem {
    static getMoveCost(state: GameState, row: number, col: number): number {
        return this.getCostDetails(state, row, col).cost;
    }

    static getCostDetails(state: GameState, row: number, col: number): { cost: number, breakdown: string } {
        const cell = state.getCell(row, col);
        if (!cell) return { cost: 0, breakdown: '' };

        let breakdownParts: string[] = [];
        let baseCost = GameConfig.COST_CAPTURE;

        // 1. Base Cost Determination
        if (cell.building === 'town' && (cell.owner === null || cell.owner === 'neutral')) {
            baseCost = GameConfig.COST_CAPTURE_TOWN; // 30
            breakdownParts.push(`Capture Town(${baseCost})`);
        } else {
            if (cell.type === 'hill') {
                baseCost = GameConfig.COST_CAPTURE * 2;
                breakdownParts.push(`Capture Hill(${baseCost})`);
            } else if (cell.type === 'water') {
                baseCost = GameConfig.COST_BUILD_BRIDGE;
                breakdownParts.push(`Build Bridge(${baseCost})`);
            } else {
                breakdownParts.push(`Capture Plain(${baseCost})`);
            }
        }

        // 2. Attack Logic
        let isAttack = false;
        const curr = state.currentPlayerId;
        if (cell.owner !== null && cell.owner !== curr) {
            isAttack = true;
            // Overwrite base with Attack Base
            if (cell.building === 'base') {
                baseCost = GameConfig.COST_CAPTURE_BASE;
                breakdownParts = [`Attack Base(${baseCost})`];
            } else {
                baseCost = GameConfig.COST_ATTACK; // 20
                breakdownParts = [`Attack(${baseCost})`];
            }

            // Adjust for Terrain in Attack
            if (cell.type === 'hill' || cell.type === 'bridge') {
                baseCost = GameConfig.COST_ATTACK * 2;
                breakdownParts = [`Attack Hill/Bridge(${baseCost})`];
            } else {
                breakdownParts = [`Attack(${baseCost})`];
            }

            // Defenses
            if (cell.building === 'base' && cell.defenseLevel > 0) {
                const bonus = cell.defenseLevel * GameConfig.UPGRADE_DEFENSE_BONUS;
                baseCost += bonus;
                breakdownParts.push(`Base Def Lv${cell.defenseLevel}(+${bonus})`);
            } else if (cell.building === 'wall') {
                if (cell.isConnected) {
                    const upgradeBonus = cell.defenseLevel * GameConfig.WALL_DEFENSE_BONUS;
                    const baseWallCost = GameConfig.WALL_CAPTURE_BASE_ADDITION;
                    baseCost += upgradeBonus + baseWallCost;
                    breakdownParts.push(`Wall(Base+${baseWallCost}, Lv${cell.defenseLevel}+${upgradeBonus})`);
                } else {
                    breakdownParts.push(`Wall Disconnected(+0)`);
                }
            }
        }

        // 3. Multipliers
        const multiplier = isAttack ? GameConfig.COST_MULTIPLIER_ATTACK : GameConfig.COST_MULTIPLIER_NEUTRAL;
        // Apply multiplier to current Sum
        baseCost = Math.floor(baseCost * multiplier);
        if (multiplier !== 1) breakdownParts.push(`x${multiplier}`);

        // 4. Distance / Disconnect Penalties (Attack Only)
        if (isAttack) {
            if (cell.owner && !cell.isConnected) {
                baseCost = Math.floor(baseCost * 0.7);
                breakdownParts.push(`Disconnected(x0.7)`);
            }

            // Distance Penalty
            if (curr && !state.isAdjacentToOwned(row, col, curr)) {
                baseCost = baseCost * 2;
                breakdownParts.push(`Distance(x2)`);
            }
        }


        // 5. Aura Support (Watchtower + Base)
        if (isAttack) {
            const attackerId = state.currentPlayerId;
            const { discount } = AuraSystem.getSupportDiscount(state, row, col, attackerId);

            if (discount > 0) {
                const discountAmount = Math.floor(baseCost * discount);
                baseCost -= discountAmount;
                breakdownParts.push(`Support(-${Math.floor(discount * 100)}%)`);
            }
        }

        return { cost: Math.max(1, baseCost), breakdown: breakdownParts.join(' ') };
    }
}
