/**
 * The room selection of the map the robot is on, kept live.
 *
 * Follows the map the robot reports, not the adapter's `active-map`: the room ids drawn on the
 * map belong to the map in the raster, and a tap must reach that map's switches. `active-map` is
 * only pointed there when a start actually needs it - see `DeviceCommands.startSelectedRooms`.
 */

import { useEffect, useMemo, useState } from "react";
import { useStatesByPattern } from "../connection/useStates";
import { parseRoomSwitches, roomSwitchPrefix, selectedRooms, switchOf } from "./roomSelection";
import type { RoomSwitch } from "./roomSelection";
import type { TabConnection } from "../connection/types";

export interface RoomSelection {
	/** The map the selection belongs to; null while no map has arrived. */
	mapId: number | null;
	/** Selected room ids. Empty means "all rooms". */
	selected: ReadonlySet<number>;
	switches: readonly RoomSwitch[];
	/**
	 * False where the map has no switches: an adapter version without room cleaning, or a map it
	 * has not set up yet. Rooms cannot be picked then, and Start cleans everything.
	 */
	available: boolean;
}

const NONE: ReadonlySet<number> = new Set();

export function useRoomSelection(
	connection: TabConnection,
	instanceId: string,
	did: string,
	mapId: number | null,
): RoomSelection {
	const prefix = mapId != null ? roomSwitchPrefix(instanceId, did, mapId) : null;
	const values = useStatesByPattern(connection, prefix ? `${prefix}*` : null);
	const [switches, setSwitches] = useState<RoomSwitch[]>([]);

	// A value under the prefix whose switch is not known yet means the adapter has added a room -
	// after the robot mapped a new one - so the objects are read again.
	const unknownValue = useMemo(
		() => Object.keys(values).some(id => !switches.some(entry => entry.stateId === id)),
		[values, switches],
	);

	useEffect(() => {
		if (!prefix) {
			setSwitches([]);
			return;
		}
		let cancelled = false;
		void connection.getObjects(`${prefix}*`).then(objects => {
			if (!cancelled) setSwitches(parseRoomSwitches(objects));
		});
		return () => {
			cancelled = true;
		};
		// `unknownValue` re-reads the objects when a room appears; see above.
	}, [connection, prefix, unknownValue]);

	const selected = useMemo(() => (switches.length ? selectedRooms(switches, values) : NONE), [switches, values]);

	return { mapId, selected, switches, available: switches.length > 0 };
}

/** The switch to write for a tap on a room, or undefined where the room cannot be picked. */
export function switchForRoom(selection: RoomSelection, roomId: number): RoomSwitch | undefined {
	return switchOf(selection.switches, roomId);
}
