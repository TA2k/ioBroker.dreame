/**
 * The caption and dialog title of a widget, from its settings and the robot's names.
 *
 * Shared by the devices tile and the vis-2 widget, so both caption a robot by the same rule; the
 * rule itself is {@link tileCaption}, kept pure so it can be tested without a connection.
 */

import { useDeviceName } from "../devices/useDeviceName";
import { DEFAULT_INSTANCE } from "../devices/useResolvedDevice";
import { useFloors } from "../floors/useFloors";
import { LIVE_FLOOR } from "../floors/floors";
import { dialogTitle, tileCaption } from "./tileContent";
import type { CaptionMode } from "./tileContent";
import type { DeviceRef } from "../devices/deviceRef";
import type { TabConnection } from "../connection/types";

export interface TileCaptionSettings {
	caption?: CaptionMode;
	/** The caption's text where `caption` is `custom`. */
	captionText?: string;
}

export interface TileCaptionResult {
	/** Null where the caption is switched off. */
	caption: string | null;
	title: string;
}

/**
 * @param pinnedFloor the floor the widget's map is fixed to - a floor id, or {@link LIVE_FLOOR}
 *   or null where it shows whichever floor the robot is on. Only a fixed floor is named.
 */
export function useTileCaption(
	connection: TabConnection,
	device: DeviceRef | null,
	pinnedFloor: string | null,
	settings: TileCaptionSettings,
): TileCaptionResult {
	const instanceId = device?.instanceId ?? DEFAULT_INSTANCE;
	const name = useDeviceName(connection, instanceId, device?.did ?? null);
	const pinned = pinnedFloor && pinnedFloor !== LIVE_FLOOR ? pinnedFloor : null;
	// The floor list is read only where a floor's name is actually wanted.
	const floors = useFloors(connection, instanceId, pinned ? (device?.did ?? null) : null);

	const robotName = name ?? device?.did ?? "";
	const floorName = pinned ? (floors.find(floor => floor.id === pinned)?.name ?? null) : null;

	return {
		caption: tileCaption(settings.caption, settings.captionText, robotName, floorName),
		title: dialogTitle(settings.caption, settings.captionText, robotName),
	};
}
