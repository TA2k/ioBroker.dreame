/**
 * The robot a widget should show.
 *
 * The one picked in its settings where there is one; otherwise the first robot of `dreame.0`.
 * Most households have one robot and one instance, and a widget that works the moment it is
 * dropped onto a page - before anybody has opened its settings - is worth more than one that
 * insists on being configured first.
 */

import { useMemo } from "react";
import { useStates } from "../connection/useStates";
import { parseDeviceList } from "./deviceList";
import { parseDeviceObjectId } from "./deviceRef";
import type { DeviceRef } from "./deviceRef";
import type { TabConnection } from "../connection/types";

/** Instance a widget falls back to when nothing is picked. */
export const DEFAULT_INSTANCE = "dreame.0";

export function useResolvedDevice(
	connection: TabConnection,
	deviceObjectId: string | null | undefined,
): DeviceRef | null {
	const picked = parseDeviceObjectId(deviceObjectId);
	// Only read the device list when it is actually needed for the fallback.
	const listId = picked ? null : `${DEFAULT_INSTANCE}.info.devices`;
	const values = useStates(connection, listId ? [listId] : []);

	return useMemo(() => {
		if (picked) return picked;
		const first = listId ? parseDeviceList(values[listId])[0] : undefined;
		return first ? { instanceId: DEFAULT_INSTANCE, did: first.did } : null;
		// `picked` is rebuilt every render from the same string; compare the string instead.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [deviceObjectId, values, listId]);
}
