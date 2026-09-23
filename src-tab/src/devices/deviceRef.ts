/**
 * Turns what a widget's settings hold into a device and a floor.
 *
 * ## Why object ids
 *
 * Both widget hosts - vis-2 and the devices app - offer an object picker in their settings, and
 * each robot is a `device` object at `dreame.<n>.<did>` (`main.js`, `extendObject(device.did, {
 * type: 'device' })`). Picking that object gives the instance and the device in one value, with no
 * need for the adapter to answer a message to fill a dropdown - which this adapter does not do.
 * A floor is picked the same way, as its channel under `map.maps`.
 */

import { LIVE_FLOOR } from "../floors/floors";

/** A robot, addressed the way every state id needs it. */
export interface DeviceRef {
	/** e.g. `dreame.0`. */
	instanceId: string;
	did: string;
}

/**
 * Reads a picked device object id.
 *
 * Anything that is not exactly `dreame.<n>.<did>` is refused: a picker offers every device object
 * in the system, and a Shelly or a light picked by mistake must not be taken for a robot.
 */
export function parseDeviceObjectId(id: string | null | undefined): DeviceRef | null {
	if (!id) return null;
	const match = /^(dreame\.\d+)\.([^.]+)$/.exec(id.trim());
	if (!match) return null;
	return { instanceId: match[1]!, did: match[2]! };
}

/**
 * Reads a picked floor channel id, e.g. `dreame.0.<did>.map.maps.5`.
 *
 * Anything else - nothing picked, the adapter's `current` alias, an unrelated object - means
 * "follow the robot", which is the right thing for a tile to do when in doubt.
 */
export function parseFloorObjectId(id: string | null | undefined): string {
	if (!id) return LIVE_FLOOR;
	const match = /\.map\.maps\.([^.]+)$/.exec(id.trim());
	if (!match || match[1] === "current") return LIVE_FLOOR;
	return match[1]!;
}
