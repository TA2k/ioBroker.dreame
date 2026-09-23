/**
 * The stored floors of one device, kept current.
 *
 * A thin layer over {@link useStatesByPattern}: floors are added, renamed and deleted in the app,
 * so they are followed rather than read once.
 */

import { useMemo } from "react";
import { useStatesByPattern } from "../connection/useStates";
import { parseFloors } from "./floors";
import type { Floor } from "./floors";
import type { TabConnection } from "../connection/types";

/** The state prefix every floor of a device sits under. */
export function floorPrefix(instanceId: string, did: string): string {
	return `${instanceId}.${did}.map.maps.`;
}

export function useFloors(connection: TabConnection, instanceId: string, did: string | null): Floor[] {
	const prefix = did ? floorPrefix(instanceId, did) : null;
	const values = useStatesByPattern(connection, prefix ? `${prefix}*.mapName` : null);
	return useMemo(() => (prefix ? parseFloors(values, prefix) : []), [values, prefix]);
}
