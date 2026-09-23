/**
 * Floors: the robot's stored maps, one per storey.
 *
 * ## Where they come from
 *
 * The adapter writes one channel per stored map under `<did>.map.maps.<mapId>`, holding a
 * `mapName` and a rendered `image` (`main.js`, next to `updateActiveMapStates`). The id is the
 * robot's own map number, the same number the live map package carries in its header.
 *
 * `current` is skipped: it is the adapter's alias for whichever map is active, not a floor of its
 * own, and listing it would show one storey twice.
 *
 * ## Live and stored are not the same thing
 *
 * Only the floor the robot is on has the full live data - rooms, the path, the robot. Every other
 * floor exists only as the picture the adapter rendered, and only when "fetch all maps" is on in
 * its settings. So a floor is either shown live or shown as that picture, and {@link floorSource}
 * decides which, by comparing the chosen floor against the map id of the live package.
 */

/** One stored floor. */
export interface Floor {
	/** The robot's map number, as a string - it is a segment of a state id. */
	id: string;
	/** User-given name, or the adapter's `Map <id>` default. */
	name: string;
}

/**
 * The selector value that means "whichever floor the robot is on".
 *
 * The default everywhere: a tile that follows the robot is right after a robot is carried
 * upstairs, whereas one pinned to a floor keeps showing the floor it was pinned to.
 */
export const LIVE_FLOOR = "live";

/**
 * Builds the floor list out of the `mapName` states.
 *
 * @param values State id to value, as delivered for `<prefix>*.mapName`.
 * @param prefix e.g. `dreame.0.<did>.map.maps.`
 */
export function parseFloors(values: Readonly<Record<string, unknown>>, prefix: string): Floor[] {
	const floors: Floor[] = [];

	for (const [id, value] of Object.entries(values)) {
		if (!id.startsWith(prefix) || !id.endsWith(".mapName")) continue;

		const mapId = id.slice(prefix.length, -".mapName".length);
		// A nested id would mean a state that is not a floor's name; `current` is an alias.
		if (!mapId || mapId.includes(".") || mapId === "current") continue;

		floors.push({
			id: mapId,
			name: typeof value === "string" && value.trim() !== "" ? value : `Map ${mapId}`,
		});
	}

	// By map number: the order the robot created them in, which is the order people think of the
	// storeys in far more often than an alphabetical one.
	return floors.sort((a, b) => Number(a.id) - Number(b.id));
}

/** What a view should draw for a chosen floor. */
export type FloorSource =
	/** The live map: rooms, path, robot, all interactive. */
	| { kind: "live" }
	/** A stored floor's rendered picture, from this state. */
	| { kind: "image"; stateId: string }
	/** Nothing yet: the live map has not arrived, so it is not known which floor it is. */
	| { kind: "pending" };

/**
 * Decides whether a chosen floor can be shown live.
 *
 * @param chosen The selector value: {@link LIVE_FLOOR} or a floor id.
 * @param liveMapId Map id carried by the live package, or null while none has arrived.
 * @param prefix e.g. `dreame.0.<did>.map.maps.`
 */
export function floorSource(chosen: string, liveMapId: number | null, prefix: string): FloorSource {
	if (chosen === LIVE_FLOOR) return { kind: "live" };
	// Until the live package has arrived there is no telling whether the chosen floor is the live
	// one; guessing "image" would flash a stale picture before the live map replaces it.
	if (liveMapId == null) return { kind: "pending" };
	if (String(liveMapId) === chosen) return { kind: "live" };
	return { kind: "image", stateId: `${prefix}${chosen}.image` };
}
