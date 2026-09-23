/**
 * The `common.states` of a state object: the names of its values.
 *
 * Read once per id; state objects do not change while a view is open, and a stale name costs
 * less than a subscription per object.
 */

import { useEffect, useState } from "react";
import type { TabConnection } from "./types";

/**
 * Normalises `common.states`, which ioBroker allows as an object or as the older string form
 * `"0:off;1:on"`.
 */
export function parseCommonStates(states: unknown): Record<string, string> | null {
	if (states && typeof states === "object" && !Array.isArray(states)) {
		const out: Record<string, string> = {};
		for (const [key, name] of Object.entries(states)) out[key] = String(name);
		return out;
	}
	if (typeof states === "string" && states.includes(":")) {
		const out: Record<string, string> = {};
		for (const pair of states.split(";")) {
			const at = pair.indexOf(":");
			if (at > 0) out[pair.slice(0, at)] = pair.slice(at + 1);
		}
		return out;
	}
	return null;
}

export function useObjectStates(connection: TabConnection, id: string | null): Record<string, string> | null {
	const [states, setStates] = useState<Record<string, string> | null>(null);

	useEffect(() => {
		setStates(null);
		if (!id) return;
		let cancelled = false;
		void connection
			.getObject(id)
			.then(object => {
				if (!cancelled) setStates(parseCommonStates((object?.common as { states?: unknown } | undefined)?.states));
			})
			.catch(() => undefined);
		return () => {
			cancelled = true;
		};
	}, [connection, id]);

	return states;
}
