/**
 * The cleaning settings: mode, route, suction and wetness.
 *
 * Ported from the widget (`www/js/panels/reinigung.js`), which in turn follows the Home Assistant
 * integration. The tables carry translation keys rather than text, because a table evaluated when
 * the module loads would resolve its names before the translations are in - the widget documents
 * the same trap.
 */

/** Cleaning mode, written to `remote.cleaning-mode`. */
export const CLEAN_MODES: readonly { id: number; key: string }[] = [
	{ id: 0, key: "panel.reinigung.modus.vacuum" },
	{ id: 1, key: "panel.reinigung.modus.mop" },
	{ id: 2, key: "panel.reinigung.modus.vacuum-mop" },
	{ id: 3, key: "panel.reinigung.modus.mop-after-vacuum" },
];

/** Cleaning route, read from `status.cleaning-route`, written to `remote.set-cleaning-route`. */
export const CLEAN_ROUTES: readonly { id: number; key: string }[] = [
	{ id: 4, key: "panel.reinigung.route.schnell" },
	{ id: 1, key: "panel.reinigung.route.standard" },
	{ id: 2, key: "panel.reinigung.route.intensiv" },
	{ id: 3, key: "panel.reinigung.route.tief" },
];

/** Suction level, written to `remote.suction-level`. The index is the value. */
export const SUCTION_KEYS: readonly string[] = [
	"panel.reinigung.saug.leise",
	"panel.reinigung.saug.standard",
	"panel.reinigung.saug.stark",
	"panel.reinigung.saug.turbo",
];

/** Wetness is a range, not a list: `remote.wetness-level` takes 1..32. */
export const WETNESS_MIN = 1;
export const WETNESS_MAX = 32;

/** True where the mode has the robot mopping. */
export function modeMops(mode: number): boolean {
	return mode === 1 || mode === 2 || mode === 3;
}

/** True where the mode has the robot vacuuming. */
export function modeVacuums(mode: number): boolean {
	return mode === 0 || mode === 2 || mode === 3;
}

/**
 * The routes a mode allows.
 *
 * Intensive and deep are mopping intensities, so they drop away when the robot is only vacuuming
 * or vacuuming and mopping in one pass. Straight from Home Assistant's `device.py`; offering them
 * anyway would let the user pick a route the robot then silently ignores.
 */
export function routesFor(mode: number | null): readonly { id: number; key: string }[] {
	if (mode === 0 || mode === 2) return CLEAN_ROUTES.filter(route => route.id !== 2 && route.id !== 3);
	return CLEAN_ROUTES;
}

/** The translation key for a suction level, or null where the level is outside the list. */
export function suctionKey(level: number | null): string | null {
	if (level == null) return null;
	return SUCTION_KEYS[level] ?? null;
}

/** What the route select should offer, and whether the robot sits outside that list. */
export interface RouteChoice {
	/** Entries to render, in order. */
	options: readonly { id: number; key: string }[];
	/**
	 * The robot's current route, when the mode does not offer it.
	 *
	 * Nothing resets the route when the mode changes underneath it, so this happens in normal use.
	 * The widget hides it - its native `select` silently falls back to showing the first option, so
	 * it reads "quick" while the robot is on "deep". Reporting it lets the caller show the real
	 * setting with a caveat instead of a plausible-looking wrong one.
	 */
	stray?: { id: number; key: string };
}

/**
 * Builds the route list for a mode, keeping the robot's actual route visible.
 *
 * @param mode Current cleaning mode, or null while it is unknown.
 * @param route Current route, or null.
 */
export function routeChoice(mode: number | null, route: number | null): RouteChoice {
	const options = routesFor(mode);
	if (route == null || options.some(entry => entry.id === route)) return { options };

	const stray = CLEAN_ROUTES.find(entry => entry.id === route);
	// A route the table does not know at all is not worth inventing a label for; the select then
	// shows nothing selected, which is at least not a claim.
	if (!stray) return { options };

	return { options: [...options, stray], stray };
}
