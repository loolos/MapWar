export type ActionType = 'END_TURN' | 'PLAN_AIM';
// PLAN_AIM: Toggling a move in the plan (Local/Draft) - Maybe not needed for network if we only sync Turn End?
// Actually, recommendations say "Optimistic UI for planning", "Wait for server for actual turn end".
// So PLAN_AIM is local. END_TURN is the critical sync action.
// However, if we want "Live Coop" or "Spectator", we sync PLAN as well.
// For now, let's stick to critical sync: END_TURN.
// But wait, the GameEngine processes specific moves based on `pendingMoves`.
// If we just send END_TURN, the server doesn't know WHAT moves.
// So we MUST send the moves with the END_TURN action, OR sync the plan incrementally.
// Simplest for Turn-Based: Send the LIST of moves with END_TURN.

export interface Action {
    type: ActionType;
    playerId: string;
    payload?: any;
    timestamp?: number;
}

export interface EndTurnAction extends Action {
    type: 'END_TURN';
    payload: {
        moves: { r: number, c: number }[]; // The committed plan
    };
}
