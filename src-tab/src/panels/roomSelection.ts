/**
 * Which rooms the next start cleans.
 *
 * ## Kept by the adapter, not here
 *
 * The adapter has a switch per room and map, `remote.custom-room-cleaning.map-<mapId>.<room>`,
 * whose object carries the room's segment id in `native.roomId`. A tap on the map writes that
 * switch and changes nothing locally; the map shows the selection when the switch's new value
 * comes back. So the view, the old web interface, a script and a second browser all see one
 * selection, and none of them can show a choice the adapter does not have.
 *
 * ## Nothing selected means everything
 *
 * An empty selection is not "clean nothing" but the normal state: Start then cleans the whole
 * home. Only a selection narrows it down - which is why the map draws every room at full colour
 * while nothing is picked, and greys out only the rooms left out of a partial pick.
 */

import type { StateValues } from "../connection/useStates";

/** One room's switch. */
export interface RoomSwitch {
	stateId: string;
	roomId: number;
}

/** The switches of one map live under this channel. */
export function roomSwitchPrefix(instanceId: string, did: string, mapId: number): string {
	return `${instanceId}.${did}.remote.custom-room-cleaning.map-${mapId}.`;
}

/** Id of a state of the room-cleaning channel itself, e.g. `start` or `active-map`. */
export function roomCleaningId(instanceId: string, did: string, suffix: string): string {
	return `${instanceId}.${did}.remote.custom-room-cleaning.${suffix}`;
}

/**
 * Reads the room switches out of their objects.
 *
 * The room is identified by `native.roomId`, not by the id's last part: that part is a readable
 * name (`kitchen`, `bedroom-2`) and says nothing about the segment the map draws.
 */
export function parseRoomSwitches(objects: Readonly<Record<string, ioBroker.Object>>): RoomSwitch[] {
	const switches: RoomSwitch[] = [];
	for (const [stateId, object] of Object.entries(objects)) {
		const raw = (object?.native as { roomId?: unknown } | undefined)?.roomId;
		const roomId = typeof raw === "number" ? raw : typeof raw === "string" && raw !== "" ? Number(raw) : NaN;
		if (Number.isFinite(roomId)) switches.push({ stateId, roomId });
	}
	return switches.sort((a, b) => a.roomId - b.roomId);
}

/** The rooms whose switch is on. */
export function selectedRooms(switches: readonly RoomSwitch[], values: StateValues): Set<number> {
	const selected = new Set<number>();
	for (const { stateId, roomId } of switches) {
		const value = values[stateId];
		if (value === true || value === "true") selected.add(roomId);
	}
	return selected;
}

/** The switch that selects a room, or undefined where the map has none for it. */
export function switchOf(switches: readonly RoomSwitch[], roomId: number): RoomSwitch | undefined {
	return switches.find(entry => entry.roomId === roomId);
}

/**
 * What the cleaning panel says about the selection, as a translation key and its arguments.
 *
 * Worded apart on purpose: "all rooms active" is the default, not a choice, and reads differently
 * from "3 rooms selected". The keys are the old web interface's.
 */
export function selectionSummary(count: number): { key: string; count: number | null } {
	if (count === 0) return { key: "panel.reinigung.raum.alle", count: null };
	if (count === 1) return { key: "panel.reinigung.raum.gewaehlt-eins", count: null };
	return { key: "panel.reinigung.raum.gewaehlt-mehrere", count };
}
