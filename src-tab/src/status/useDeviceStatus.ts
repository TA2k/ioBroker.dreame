/**
 * The handful of status states the header shows, keyed by name rather than by state id.
 *
 * A thin layer over {@link useStates}: the subscription mechanics live there, and this only
 * decides which states the header cares about and gives them readable names. Keeping the two
 * apart means a panel that wants different states writes a list, not another effect.
 */

import { useMemo } from "react";
import { useStates } from "../connection/useStates";
import type { TabConnection } from "../connection/types";

/** The status fields the header reads, mapped to their suffix under `<did>.status.`. */
export const STATUS_SUFFIX = {
	state: "state",
	battery: "battery-level",
	charging: "charging-status",
	taskStatus: "task-status",
	cleaningPaused: "cleaning-paused",
	cleaningProgress: "cleaning-progress",
	dryingProgress: "drying-progress",
	cleanedArea: "cleaned-area",
	cleaningTime: "cleaning-time",
	waterTank: "water-tank",
} as const;

export type StatusField = keyof typeof STATUS_SUFFIX;

/** Current values. A field whose state has not arrived, or does not exist, is undefined. */
export type DeviceStatus = Readonly<Partial<Record<StatusField, unknown>>>;

const FIELDS = Object.keys(STATUS_SUFFIX) as StatusField[];

/**
 * @param connection How to reach ioBroker.
 * @param instanceId Adapter instance, e.g. `dreame.0`.
 * @param did Device to follow, or null.
 */
export function useDeviceStatus(
	connection: TabConnection,
	instanceId: string,
	did: string | null,
): DeviceStatus {
	const prefix = did ? `${instanceId}.${did}.status.` : null;

	const ids = useMemo(
		() => (prefix ? FIELDS.map(field => prefix + STATUS_SUFFIX[field]) : []),
		[prefix],
	);

	const values = useStates(connection, ids);

	return useMemo(() => {
		if (!prefix) return {};
		const status: Partial<Record<StatusField, unknown>> = {};
		for (const field of FIELDS) {
			status[field] = values[prefix + STATUS_SUFFIX[field]];
		}
		return status;
	}, [values, prefix]);
}
