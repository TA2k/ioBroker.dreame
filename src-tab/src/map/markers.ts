/**
 * What the robot and charger markers show: their size, and the status badge each carries.
 *
 * Both rules are Home Assistant's (`device.robot_status`, `device.station_status`, and the icon
 * sizes of `map.py`), as the widget ports them (`www/js/panels/kopf.js`, `karte/overlays.js`).
 */

import type { HaIcon } from "./haIcons";
import { asNumber } from "../connection/useStates";
import type { DeviceStatus } from "../status/useDeviceStatus";

/** Where a badge sits on its marker: behind the icon, in its corner, or above it. */
export type BadgePlacement = "behind" | "corner" | "above";

export interface Badge {
	icon: HaIcon;
	placement: BadgePlacement;
}

/** The status fields the badges are worked out from. */
export interface MarkerStatus {
	/** Home Assistant's `status`, the `status.status` state. */
	robotStatus: number | null;
	/** `status.state`. */
	state: number | null;
	charging: number | null;
	washStatus: number | null;
	emptyStatus: number | null;
	hotWater: number | null;
}

/** Robot `status` values that count as running for the badge. */
const RUNNING_STATUSES: ReadonlySet<number> = new Set([2, 4, 5, 18, 19, 20, 22, 23, 24, 25]);
/** Robot states that mean charging, besides the charging status itself. */
const CHARGING_STATES: ReadonlySet<number> = new Set([6, 13, 24]);
const STATUS_SLEEPING = 14;
const STATUS_ERROR = 12;

/**
 * The robot's badge: warning on a fault, else cleaning, charging or sleeping, else none.
 *
 * A fault wins over everything, as in Home Assistant, where it adds 10 to the running, charging
 * or sleeping code and the renderer then draws the warning in its place.
 */
export function robotBadge(status: MarkerStatus): Badge | null {
	if (status.robotStatus === STATUS_ERROR) return { icon: "warning", placement: "behind" };
	if (status.robotStatus != null && RUNNING_STATUSES.has(status.robotStatus)) {
		return { icon: "cleaning", placement: "behind" };
	}
	if (status.charging === 1 || (status.state != null && CHARGING_STATES.has(status.state))) {
		return { icon: "charging", placement: "behind" };
	}
	if (status.robotStatus === STATUS_SLEEPING) return { icon: "sleeping", placement: "corner" };
	return null;
}

/** `self-wash-base-status` values, from Home Assistant's `DreameVacuumSelfWashBaseStatus`. */
const WASH = { WASHING: 1, DRYING: 2, PAUSED: 4, CLEAN_ADD_WATER: 5 } as const;
const EMPTY_ACTIVE = 1;
/** The robot state of dust bag drying. */
const STATE_DUST_BAG_DRYING = 35;

/**
 * The station's badge: emptying, washing, drying or drying the dust bag, hot where the water is.
 *
 * Two departures from Home Assistant, both the widget's: its second way of detecting a hot wash
 * reads a switch the adapter does not provide, and a paused dust bag drying has no state here,
 * so it always shows as running.
 */
export function stationBadge(status: MarkerStatus): Badge | null {
	if (status.emptyStatus === EMPTY_ACTIVE) return { icon: "emptying", placement: "above" };

	// In this order, as in the widget: a dust bag drying outranks a wash going on at the same time.
	const wash = status.washStatus;
	let activity: "washing" | "drying" | "dustBag" | null = null;
	if (wash === WASH.WASHING || wash === WASH.CLEAN_ADD_WATER || wash === WASH.PAUSED) activity = "washing";
	if (wash === WASH.DRYING) activity = "drying";
	else if (status.state === STATE_DUST_BAG_DRYING) activity = "dustBag";

	const hot = status.hotWater === 1;
	if (activity === "washing") return { icon: hot ? "hotWashing" : "washing", placement: "above" };
	if (activity === "drying") return { icon: hot ? "hotDrying" : "drying", placement: "above" };
	if (activity === "dustBag") return { icon: "dustBagDrying", placement: "above" };
	return null;
}

/**
 * Marker sizes in map cells.
 *
 * Home Assistant sizes the robot at 3.7 % of the map's side - its width, or its height where the
 * map is turned by 90 or 270 degrees - within 7 to 14 cells, and the charger 1.2 times that. So
 * the robot looks the same size on a studio and on a whole house.
 *
 * @param rotation the map rotation the app uses (`mra`), in degrees
 */
export function markerSizes(width: number, height: number, rotation = 0): { robot: number; charger: number } {
	const side = rotation === 90 || rotation === 270 ? height : width;
	const robot = Math.max(7, Math.min(14, side * 0.037));
	return { robot, charger: robot * 1.2 };
}

/** The badge's box relative to its marker's centre, for a marker of the given size. */
export function badgeBox(placement: BadgePlacement, size: number): { x: number; y: number; size: number } {
	if (placement === "corner") return { x: size * 0.35, y: -size * 0.75, size: size * 0.45 };
	if (placement === "above") return { x: -size * 0.45, y: -size * 1.25, size: size * 0.9 };
	return { x: -size * 0.65, y: -size * 0.65, size: size * 1.3 };
}

/** Picks the fields the badges need out of the device status. */
export function markerStatusOf(status: DeviceStatus): MarkerStatus {
	return {
		robotStatus: asNumber(status.robotStatus),
		state: asNumber(status.state),
		charging: asNumber(status.charging),
		washStatus: asNumber(status.washStatus),
		emptyStatus: asNumber(status.emptyStatus),
		hotWater: asNumber(status.hotWater),
	};
}
