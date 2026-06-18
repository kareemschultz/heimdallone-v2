/**
 * Separation-of-duties predicate (Phase INV-C; ported from StockHub
 * `lib/approval.ts`, a CLAUDE.md non-negotiable): an actor may not approve a
 * record they originated. Approval handlers compare the actor against the
 * record's creator/submitter and reject a match. Kept pure so it is unit
 * testable independent of the database transaction it runs inside.
 *
 * Returns true when approval must be blocked. A null/empty actor never matches
 * (an unauthenticated approval is rejected earlier by the permission gate).
 */
export function isSelfApproval(
	actorId: string | null | undefined,
	...originatorIds: (string | null | undefined)[]
): boolean {
	if (!actorId) {
		return false;
	}
	return originatorIds.some((id) => id != null && id === actorId);
}
