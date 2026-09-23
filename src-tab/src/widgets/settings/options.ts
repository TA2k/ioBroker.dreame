/**
 * The choices a widget's settings offer for its robot and its floor.
 *
 * Both hosts store the same thing the object browser would have given: the object id of the robot
 * (`dreame.0.<did>`) and of the floor channel (`dreame.0.<did>.map.maps.<id>`). So a setting
 * made in either host reads the same, and `parseDeviceObjectId` and `parseFloorObjectId` in
 * `../../devices/deviceRef` understand every value these lists can produce.
 */

import { parseDeviceList } from "../../devices/deviceList";
import { floorPrefix } from "../../floors/useFloors";
import type { Floor } from "../../floors/floors";
import type { StateValues } from "../../connection/useStates";

export interface SelectOption {
	value: string;
	label: string;
}

/** One read that covers every instance: each keeps its robots in its own `info.devices`. */
export const DEVICE_LISTS_PATTERN = "dreame.*.info.devices";

const DEVICE_LIST_ID = /^(dreame\.(\d+))\.info\.devices$/;

/**
 * The robots of every instance, by instance and then by name.
 *
 * The instance is named only where there is more than one: a household with one instance - most
 * of them - would otherwise read `(dreame.0)` after every robot for nothing.
 *
 * @param values the states matched by {@link DEVICE_LISTS_PATTERN}
 */
export function robotOptions(values: StateValues): SelectOption[] {
	const instances = Object.keys(values)
		.map(id => DEVICE_LIST_ID.exec(id))
		.filter((match): match is RegExpExecArray => match !== null)
		.sort((a, b) => Number(a[2]) - Number(b[2]));

	const several = instances.length > 1;
	const options: SelectOption[] = [];

	for (const match of instances) {
		const instanceId = match[1]!;
		const devices = parseDeviceList(values[match[0]]).sort((a, b) => (a.name || a.did).localeCompare(b.name || b.did));
		for (const device of devices) {
			const name = device.name || device.did;
			options.push({
				value: `${instanceId}.${device.did}`,
				label: several ? `${name} (${instanceId})` : name,
			});
		}
	}

	return options;
}

/** The stored floors of one robot, in the order they are given - `parseFloors` sorts them by id. */
export function floorOptions(floors: readonly Floor[], instanceId: string, did: string): SelectOption[] {
	const prefix = floorPrefix(instanceId, did);
	return floors.map(floor => ({ value: `${prefix}${floor.id}`, label: floor.name }));
}

/**
 * Makes sure the stored value is among the options.
 *
 * A setting can outlive what it points at - a robot removed from the account, a floor deleted in
 * the app - or simply arrive before the list does. A select with a value outside its options shows
 * an empty field, which reads as "nothing picked" while the widget still uses the old value; so the
 * value is kept visible, under its raw id, until the user picks something else.
 */
export function withStoredValue(options: readonly SelectOption[], value: string): SelectOption[] {
	if (!value || options.some(option => option.value === value)) return [...options];
	return [...options, { value, label: value }];
}
