/**
 * Keeps a decoded map in step with the device's `map.mergedCloud` state.
 *
 * The decode is asynchronous (the payload is inflated by the platform's decompression stream), so
 * two packages can be in flight at once when the robot is cleaning and pushing a map every few
 * seconds. The hook therefore drops any result that is no longer the newest - without that, a
 * slow decode of an older package can land after a fast decode of a newer one and the map jumps
 * backwards.
 */

import { useEffect, useState } from "react";
import { decodeMapPackage } from "./mapPackage";
import type { MapPackage } from "./mapPackage";
import type { StateHandler, TabConnection } from "../connection/types";

export interface MapPackageState {
	map: MapPackage | null;
	/** True until the first package has been decoded or has failed. */
	loading: boolean;
	/** Why there is no map, or null. Kept for display rather than only logged. */
	error: string | null;
}

/**
 * @param connection How to reach ioBroker.
 * @param instanceId Adapter instance, e.g. `dreame.0`.
 * @param did Device whose map to follow, or null for none.
 */
export function useMapPackage(
	connection: TabConnection,
	instanceId: string,
	did: string | null,
): MapPackageState {
	const [state, setState] = useState<MapPackageState>({ map: null, loading: true, error: null });

	useEffect(() => {
		if (!did) {
			setState({ map: null, loading: false, error: null });
			return;
		}

		const stateId = `${instanceId}.${did}.map.mergedCloud`;
		let cancelled = false;
		// Counts packages rather than comparing timestamps: the state carries no sequence number,
		// and two packages within the same millisecond are perfectly possible.
		let newest = 0;

		setState({ map: null, loading: true, error: null });

		const consume = (value: unknown): void => {
			if (typeof value !== "string" || value.length === 0) return;
			const generation = ++newest;

			void decodeMapPackage(value).then(
				map => {
					if (cancelled || generation !== newest) return;
					setState({ map, loading: false, error: null });
				},
				(error: unknown) => {
					if (cancelled || generation !== newest) return;
					setState({
						map: null,
						loading: false,
						error: error instanceof Error ? error.message : String(error),
					});
				},
			);
		};

		const handler: StateHandler = (_id, changed) => consume(changed?.val);

		void (async () => {
			try {
				const initial = await connection.getState(stateId);
				if (cancelled) return;
				if (initial?.val) {
					consume(initial.val);
				} else {
					// No map yet is a normal state on a fresh install, not a failure: the adapter
					// publishes one after its first cloud poll.
					setState({ map: null, loading: false, error: null });
				}
				await connection.subscribe(stateId, handler);
			} catch (error) {
				if (cancelled) return;
				setState({
					map: null,
					loading: false,
					error: error instanceof Error ? error.message : String(error),
				});
			}
		})();

		return () => {
			cancelled = true;
			connection.unsubscribe(stateId, handler);
		};
	}, [connection, instanceId, did]);

	return state;
}
