/**
 * The display name of one device, read from the adapter's device list.
 *
 * A widget is configured with a device id; the name is what it should show. Read from
 * `info.devices` rather than asked for in the widget's settings, so renaming the robot in the app
 * renames the tile as well.
 */

import { useMemo } from "react";
import { useStates } from "../connection/useStates";
import { parseDeviceList } from "./deviceList";
import type { TabConnection } from "../connection/types";

export function useDeviceName(connection: TabConnection, instanceId: string, did: string | null): string | null {
	const stateId = `${instanceId}.info.devices`;
	const values = useStates(connection, [stateId]);
	return useMemo(() => {
		if (!did) return null;
		return parseDeviceList(values[stateId]).find(device => device.did === did)?.name ?? null;
	}, [values, stateId, did]);
}
