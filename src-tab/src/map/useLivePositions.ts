/**
 * The robot's and the charger's position states, `map.robot` and `map.charger`.
 *
 * Where the adapter provides them they move the robot between maps, which only come every few
 * seconds. Where it does not, nothing here arrives, and the positions in each map's header are
 * all there is - which is also all the widget had on most installations.
 */

import { useMemo } from "react";
import { useStates } from "../connection/useStates";
import type { TabConnection } from "../connection/types";
import type { WorldPoint } from "./playback";

/** The firmware's "position unknown". */
const UNKNOWN = 32767;

/** Reads a position state: a JSON pair `[x, y]` in world millimetres. */
export function parsePosition(value: unknown): WorldPoint | null {
	let parsed: unknown = value;
	if (typeof value === "string") {
		try {
			parsed = JSON.parse(value);
		} catch {
			return null;
		}
	}
	if (!Array.isArray(parsed) || parsed.length < 2) return null;
	const x = Number(parsed[0]);
	const y = Number(parsed[1]);
	if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
	if (Math.abs(x) === UNKNOWN || Math.abs(y) === UNKNOWN) return null;
	return { x, y };
}

export function useLivePositions(
	connection: TabConnection,
	instanceId: string,
	did: string,
): { robot: WorldPoint | null; charger: WorldPoint | null } {
	const robotId = `${instanceId}.${did}.map.robot`;
	const chargerId = `${instanceId}.${did}.map.charger`;
	const values = useStates(connection, [robotId, chargerId]);
	const robotValue = values[robotId];
	const chargerValue = values[chargerId];

	const robot = useMemo(() => parsePosition(robotValue), [robotValue]);
	const charger = useMemo(() => parsePosition(chargerValue), [chargerValue]);
	return { robot, charger };
}
