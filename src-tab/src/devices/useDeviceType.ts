/**
 * Whether a robot is a vacuum or a mower, from the adapter's device list.
 *
 * Decides which panels apply: a mower has no water tank, no app shortcuts, no schedules of the
 * vacuum kind and no room sequence. Null while unknown, which hides nothing.
 */

import { useMemo } from "react";
import { useStates } from "../connection/useStates";
import { parseDeviceList } from "./deviceList";
import type { TabConnection } from "../connection/types";

export function useDeviceType(connection: TabConnection, instanceId: string, did: string | null): string | null {
	const stateId = `${instanceId}.info.devices`;
	const values = useStates(connection, [stateId]);
	return useMemo(() => {
		if (!did) return null;
		return parseDeviceList(values[stateId]).find(device => device.did === did)?.typ ?? null;
	}, [values, stateId, did]);
}
