// Leave more space between the two thresholds than the player's 82px height
// change. Native scroll anchoring can then preserve the answer sheet without
// immediately triggering the opposite player state.
export const LISTENING_COLLAPSE_OFFSET = 96;
export const LISTENING_EXPAND_OFFSET = 16;

export function listeningPlayerCompact(current: boolean, sentinelOffset: number): boolean {
  return current ? sentinelOffset < LISTENING_EXPAND_OFFSET : sentinelOffset <= -LISTENING_COLLAPSE_OFFSET;
}
