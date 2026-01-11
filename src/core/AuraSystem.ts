import { GameConfig } from './GameConfig';
import { GameState } from './GameState';
import { Cell } from './Cell';

export class AuraSystem {

    /**
     * Calculates the maximum discount available for an attack on a specific target tile.
     * The discount is provided by nearby friendly Bases or Watchtowers.
     * 
     * @param state The current GameState
     * @param targetRow Row of the target tile being attacked
     * @param targetCol Column of the target tile being attacked
     * @param attackerId The ID of the attacking player
     * @returns The discount percentage (0.0 to 1.0) and the source of the best discount.
     */
    static getSupportDiscount(state: GameState, targetRow: number, targetCol: number, attackerId: string | null): { discount: number, source: Cell | null } {
        if (!attackerId) return { discount: 0, source: null };

        let maxDiscount = 0;
        let bestSource: Cell | null = null;

        // Optimization: Could scan only nearby tiles, but Grid scan is fine for 10x10.
        // We scan for SOURCES owned by ATTACKER.
        for (let r = 0; r < GameConfig.GRID_HEIGHT; r++) {
            for (let c = 0; c < GameConfig.GRID_WIDTH; c++) {
                const cell = state.getCell(r, c);
                if (!cell || cell.owner !== attackerId || !cell.isConnected) continue;

                // Check for Aura Sources
                let range = 0;
                let discount = 0;

                // 1. Base Support
                if (cell.building === 'base') {
                    // Base Logic
                    // Lv 0 (Initial): Base Range 2, Discount 20%
                    // Upgrades: +1 Range, +5% Discount per defense level? 
                    // Config: BASE_SUPPORT_RANGE_BASE + (DefLv * PER_LEVEL)
                    range = GameConfig.BASE_SUPPORT_RANGE_BASE + (cell.defenseLevel * GameConfig.BASE_SUPPORT_RANGE_PER_LEVEL);
                    discount = GameConfig.BASE_SUPPORT_DISCOUNT_BASE + (cell.defenseLevel * GameConfig.BASE_SUPPORT_DISCOUNT_PER_LEVEL);
                }
                // 2. Watchtower Support
                else if (cell.watchtowerLevel > 0) {
                    // Watchtower Logic
                    // Range comes from Level: [0, 2, 3, 4]
                    range = GameConfig.WATCHTOWER_RANGES[cell.watchtowerLevel];
                    // Discount comes from Wall Level: 20% + (WallLv-1)*5%
                    const wallLv = Math.max(1, cell.defenseLevel);
                    discount = GameConfig.WATCHTOWER_DISCOUNT_BASE + ((wallLv - 1) * GameConfig.WATCHTOWER_DISCOUNT_PER_WALL);
                }

                if (range > 0 && discount > 0) {
                    // Check Distance (Manhattan for Rhombus/Diamond shape)
                    const dist = Math.abs(r - targetRow) + Math.abs(c - targetCol);
                    if (dist <= range) {
                        if (discount > maxDiscount) {
                            maxDiscount = discount;
                            bestSource = cell;
                        }
                    }
                }
            }
        }

        return { discount: maxDiscount, source: bestSource };
    }

    /**
     * returns the aura range for a specific cell if it is a valid source.
     */
    static getAuraRange(cell: Cell): number {
        if (!cell) return 0;

        if (cell.building === 'base') {
            return GameConfig.BASE_SUPPORT_RANGE_BASE + (cell.defenseLevel * GameConfig.BASE_SUPPORT_RANGE_PER_LEVEL);
        }

        if (cell.watchtowerLevel > 0) {
            return GameConfig.WATCHTOWER_RANGES[cell.watchtowerLevel];
        }

        return 0;
    }
}
