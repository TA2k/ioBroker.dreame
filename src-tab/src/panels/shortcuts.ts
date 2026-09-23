/**
 * Shortcuts, assembled from the flat states under `<did>.shortcuts.<id>.*`.
 *
 * Three states per shortcut: `name`, `running` and `start`. The last is a trigger with no value
 * worth reading - writing to it is what starts the shortcut - so it is skipped here rather than
 * collected and ignored later.
 *
 * A shortcut with no name is dropped. It means the adapter has created the branch but has not
 * filled it yet, and a tile labelled with a bare number is not something a user can act on.
 */

/** One shortcut, as the app defines it. */
export interface Shortcut {
	/** Numeric id as a string, the segment in the state path. */
	id: string;
	/** Free text from the Dreame app. */
	name: string;
	/** True while this shortcut's run is in progress. */
	running: boolean;
}

/**
 * Builds the shortcut list out of raw state values.
 *
 * @param values State id to value, as delivered for the pattern `<prefix>*`.
 * @param prefix e.g. `dreame.0.<did>.shortcuts.`
 */
export function parseShortcuts(values: Readonly<Record<string, unknown>>, prefix: string): Shortcut[] {
	const collected = new Map<string, { name?: string; running?: boolean }>();

	for (const [id, value] of Object.entries(values)) {
		if (!id.startsWith(prefix)) continue;

		const rest = id.slice(prefix.length).split(".");
		if (rest.length !== 2) continue;

		const [shortcutId, field] = rest as [string, string];
		const entry = collected.get(shortcutId) ?? {};

		if (field === "name") {
			if (typeof value === "string" && value !== "") entry.name = value;
		} else if (field === "running") {
			entry.running = value === true || value === "true" || value === 1;
		}
		// `start` is a trigger; there is nothing to read from it.

		collected.set(shortcutId, entry);
	}

	const shortcuts: Shortcut[] = [];
	for (const [id, entry] of collected) {
		if (!entry.name) continue;
		shortcuts.push({ id, name: entry.name, running: entry.running ?? false });
	}

	// By id, numerically: the app numbers them in the order they were created, and a string sort
	// would put 10 before 2.
	return shortcuts.sort((a, b) => Number(a.id) - Number(b.id));
}

/** Names a shortcut by id, for a schedule that points at one. */
export function shortcutName(shortcuts: readonly Shortcut[], id: number): string | null {
	return shortcuts.find(shortcut => shortcut.id === String(id))?.name ?? null;
}
