/**
 * snapshot-hash.ts — Shared FNV-1a structural snapshot hashing.
 *
 * Produces a compact 32-bit numeric hash from agent IDs + statuses for
 * O(1) dirty-checking comparison. Zero string allocations — used in
 * hot render paths (dashboard, widget) to skip re-renders when the
 * agent list structure hasn't changed.
 */

interface HashableAgent {
  id: string;
  status: string;
}

/**
 * Build a numeric structural hash from agent IDs + statuses.
 * Uses FNV-1a inspired hashing — O(N) with zero string allocations.
 * Returns a 32-bit integer for fast equality comparison.
 */
export function buildSnapshotHash(agents: HashableAgent[]): number {
  if (agents.length === 0) return 0;
  let hash = 0x811c9dc5; // FNV offset basis
  for (let i = 0; i < agents.length; i++) {
    const a = agents[i];
    const id = a.id;
    for (let j = 0; j < id.length; j++) {
      hash ^= id.charCodeAt(j);
      hash = Math.imul(hash, 0x01000193); // FNV prime
    }
    hash ^= 0x3a; // ':' separator
    hash = Math.imul(hash, 0x01000193);
    const status = a.status;
    for (let j = 0; j < status.length; j++) {
      hash ^= status.charCodeAt(j);
      hash = Math.imul(hash, 0x01000193);
    }
    hash ^= 0x2c; // ',' separator
    hash = Math.imul(hash, 0x01000193);
  }
  return hash | 0;
}
