/**
 * The cleaning sequence: which rooms, and in what order.
 *
 * ## One gesture for two things
 *
 * Tapping a room on the map both selects it and appends it to the order. One tap means "clean
 * only this room"; three taps mean "clean these three, in this order"; tapping a room already in
 * the list removes it again. The widget arrived at this after a live test and it is worth keeping
 * - a separate order editor beside a separate room picker is two lists to keep in agreement.
 *
 * ## Round trip, never optimistic
 *
 * {@link toggleRoom} computes the *next* order; the caller writes it to
 * `remote.cleaning-sequence.order` and waits for the adapter to send it back. The displayed order
 * is always the adapter's, so the two can never drift apart - which matters because the same
 * state is writable from scripts and from a second browser tab.
 */

/** Parses the order state. Anything unreadable yields an empty order rather than throwing. */
export function parseOrder(value: unknown): number[] {
	if (value == null || value === "") return [];

	let parsed: unknown;
	try {
		parsed = JSON.parse(String(value));
	} catch {
		return [];
	}
	if (!Array.isArray(parsed)) return [];

	return parsed.map(Number).filter(entry => Number.isFinite(entry));
}

/**
 * The order after tapping a room.
 *
 * Appending rather than inserting is what makes the tap order the cleaning order. Removing keeps
 * the rest in place, so taking a room out of the middle does not reshuffle the others.
 */
export function toggleRoom(order: readonly number[], roomId: number): number[] {
	if (!Number.isFinite(roomId)) return [...order];

	const index = order.indexOf(roomId);
	if (index >= 0) return [...order.slice(0, index), ...order.slice(index + 1)];
	return [...order, roomId];
}

/**
 * Position of a room in the sequence, counting from 1, or null where it is not in it.
 *
 * One-based because it is shown to a person: the first room cleaned is "1".
 */
export function sequencePosition(order: readonly number[], roomId: number): number | null {
	const index = order.indexOf(roomId);
	return index >= 0 ? index + 1 : null;
}

/** Serialises an order for the state. */
export function serialiseOrder(order: readonly number[]): string {
	return JSON.stringify([...order]);
}
