import { GameConfig } from './GameConfig';
import { GameState } from './GameState';
import { AuraSystem } from './AuraSystem';

export class CostSystem {
    static getMoveCost(state: GameState, row: number, col: number, pendingMoves: { r: number, c: number }[] = []): number {
        return this.getCostDetails(state, row, col, pendingMoves).cost;
    }

    static getCostDetails(state: GameState, row: number, col: number, pendingMoves: { r: number, c: number }[] = []): { cost: number, breakdown: string } {
        const cell = state.getCell(row, col);
        if (!cell) return { cost: 0, breakdown: '' };

        let breakdownParts: string[] = [];
        let baseCost = GameConfig.COST_CAPTURE;

        // 1. Base Cost Determination
        if (cell.building === 'citadel' && (cell.owner === null || cell.owner !== state.currentPlayerId)) {
            baseCost = GameConfig.COST_CAPTURE_CITADEL;
            breakdownParts.push(`Citadel(${baseCost})`);
        } else if (cell.building === 'town' && (cell.owner === null || cell.owner === 'neutral')) {
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
            const isBase = cell.building === 'base';
            const isCitadel = cell.building === 'citadel';
            if (isBase) {
                baseCost = GameConfig.COST_CAPTURE_BASE;
                breakdownParts = [`Attack Base(${baseCost})`];
            } else if (isCitadel) {
                baseCost = GameConfig.COST_CAPTURE_CITADEL * 2;
                breakdownParts = [`Attack Citadel(${baseCost})`];
            } else {
                baseCost = GameConfig.COST_ATTACK; // 20
                breakdownParts = [`Attack(${baseCost})`];
            }

            // Adjust for Terrain in Attack
            if (!isBase && !isCitadel) {
                if (cell.type === 'hill' || cell.type === 'bridge') {
                    baseCost = GameConfig.COST_ATTACK * 2;
                    breakdownParts = [`Attack Hill/Bridge(${baseCost})`];
                } else {
                    breakdownParts = [`Attack(${baseCost})`];
                }
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

            // Watchtower Defense (applies to any building with watchtower)
            if (cell.watchtowerLevel > 0 && cell.isConnected) {
                const watchtowerBonus = cell.watchtowerLevel * GameConfig.WATCHTOWER_DEFENSE_BONUS;
                baseCost += watchtowerBonus;
                breakdownParts.push(`Tower Lv${cell.watchtowerLevel}(+${watchtowerBonus})`);
            }
        }

        // 3. Multipliers
        const multiplier = isAttack ? GameConfig.COST_MULTIPLIER_ATTACK : GameConfig.COST_MULTIPLIER_NEUTRAL;
        // Apply multiplier to current Sum
        baseCost = Math.floor(baseCost * multiplier);
        if (multiplier !== 1) breakdownParts.push(`x${multiplier}`);

        // 4. Distance-Based Cost Multiplier (Attack Only)
        // User Request: Cost multiplied by N where N is Manhattan Distance to nearest connected own cell.
        // "Manhattan Diamond" = Manhattan Distance.
        if (isAttack && curr) {
            const dist = this.getDistanceToNearestConnected(state, row, col, curr, pendingMoves);

            // If dist is 1 (Adjacent), multiplier is 1.
            // If dist is 2, multiplier is 2.
            // If dist is Infinity (No connected land?), treat as very high or 1? 
            // If no connected land, you shouldn't be able to attack technically, or it's infinite.
            // But let's cap it or just use it.

            if (dist > 0 && dist < Infinity) {
                // Should we Replace the multiplier or Append?
                // Logic: "Cost ... flipped N times" (Fan N Bei -> Multiplied by N).
                // So baseCost = baseCost * dist.

                baseCost = Math.floor(baseCost * dist);
                if (dist > 1) {
                    breakdownParts.push(`Distance(x${dist})`);
                }
            } else if (dist === Infinity) {
                // Fallback if no connected land found (shouldn't happen in valid state)
                baseCost = 9999;
                breakdownParts.push(`NoConnection(MAX)`);
            }

            if (baseCost === Infinity) {
                breakdownParts.push(`NoConnection(MAX)`);
            }

            if (cell.owner && !cell.isConnected) {
                baseCost = Math.floor(baseCost * 0.7);
                breakdownParts.push(`Disconnected(x0.7)`);
            }
        }


        // 5. Aura Support (Watchtower + Base)
        if (isAttack) {
            const attackerId = state.currentPlayerId;
            const { discount } = AuraSystem.getSupportDiscount(state, row, col, attackerId!);

            if (discount > 0) {
                const discountAmount = Math.floor(baseCost * discount);
                baseCost -= discountAmount;
                breakdownParts.push(`Support(-${Math.floor(discount * 100)}%)`);
            }

            // 6. Wall Defense Aura (Defender's Walls protecting this tile)
            // Target is cell. Owner is cell.owner.
            // But we checked isAttack only if cell.owner !== curr. So cell.owner IS the defender.
            if (cell.owner) {
                const defenseBonus = AuraSystem.getDefenseAuraBonus(state, row, col, cell.owner);
                if (defenseBonus > 0) {
                    // Increase Cost
                    // Logic: "Cost increased by 20%...". Is it additive or multiplicative to base?
                    // Usually multiplicative to the current running cost or base?
                    // Let's apply it to the baseCost (which includes terrain/multipliers already).
                    const addedCost = Math.floor(baseCost * defenseBonus);
                    baseCost += addedCost;
                    breakdownParts.push(`WallCover(+${Math.floor(defenseBonus * 100)}%)`);
                }
            }

            const attackFactor = Math.max(1, state.players[attackerId!]?.attackCostFactor ?? 1);
            if (attackFactor > 1) {
                baseCost = Math.floor(baseCost / attackFactor);
                breakdownParts.push(`Dominance(/${attackFactor.toFixed(1)})`);
            }
        }

        return { cost: Math.max(1, baseCost), breakdown: breakdownParts.join(' ') };
    }

    static getDistanceToNearestConnected(state: GameState, targetR: number, targetC: number, playerId: string, _pendingMoves: { r: number, c: number }[] = []): number {
        let minDist = Infinity;

        // Iterate all cells to find owned & connected ones
        const height = state.grid.length;
        const width = height > 0 ? state.grid[0].length : 0;
        for (let r = 0; r < height; r++) {
            for (let c = 0; c < width; c++) {
                const cell = state.getCell(r, c);
                if (cell && cell.owner === playerId && cell.isConnected) {
                    const dist = Math.abs(r - targetR) + Math.abs(c - targetC);
                    if (dist < minDist) {
                        minDist = dist;
                    }
                }
            }
        }

        // Also check Pending Moves?
        // User Requirement: "Manhattan Distance to nearest connected own cell"
        // If we include pending moves, then chaining moves 1-by-1 always results in dist=1.
        // To enforce "Distance Penalty" (Stretching supply lines), we should measure from ESTABLISHED connectivity.
        // So we do NOT include pending moves here.
        /*
        for (const pm of pendingMoves) {
            const dist = Math.abs(pm.r - targetR) + Math.abs(pm.c - targetC);
            if (dist < minDist) {
                minDist = dist;
            }
        }
        */

        if (minDist === 1) return 1;
        return minDist;
    }

    /**
     * Calculates the BASE attack cost for an imaginary enemy to attack this tile.
     * Excludes distance and aura modifiers.
     */
    static getPotentialEnemyAttackCost(state: GameState, row: number, col: number): { cost: number, breakdown: string } {
        const cell = state.getCell(row, col);
        if (!cell || !cell.owner) return { cost: 0, breakdown: '' };

        let breakdownParts: string[] = [];
        let baseCost = 0;

        // Determine Base Attack Cost
        if (cell.building === 'base') {
            baseCost = GameConfig.COST_CAPTURE_BASE;
            breakdownParts = [`Attack Base(${baseCost})`];
        } else if (cell.building === 'citadel') {
            baseCost = GameConfig.COST_CAPTURE_CITADEL * 2;
            breakdownParts = [`Attack Citadel(${baseCost})`];
        } else if (cell.type === 'hill' || cell.type === 'bridge') {
            baseCost = GameConfig.COST_ATTACK * 2;
            breakdownParts = [`Attack Hill/Bridge(${baseCost})`];
        } else {
            baseCost = GameConfig.COST_ATTACK;
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

        // Watchtower Defense (applies to any building with watchtower)
        if (cell.watchtowerLevel > 0 && cell.isConnected) {
            const watchtowerBonus = cell.watchtowerLevel * GameConfig.WATCHTOWER_DEFENSE_BONUS;
            baseCost += watchtowerBonus;
            breakdownParts.push(`Tower Lv${cell.watchtowerLevel}(+${watchtowerBonus})`);
        }

        // Aura: Wall Defense (from Neighbors)
        if (cell.owner) {
            const defenseBonus = AuraSystem.getDefenseAuraBonus(state, row, col, cell.owner);
            if (defenseBonus > 0) {
                const addedCost = Math.floor(baseCost * defenseBonus);
                baseCost += addedCost;
                breakdownParts.push(`WallCover(+${Math.floor(defenseBonus * 100)}%)`);
            }
        }

        // Multiplier
        const multiplier = GameConfig.COST_MULTIPLIER_ATTACK;
        baseCost = Math.floor(baseCost * multiplier);
        if (multiplier !== 1) breakdownParts.push(`x${multiplier}`);

        return { cost: Math.max(1, baseCost), breakdown: breakdownParts.join(' ') };
    }
}
