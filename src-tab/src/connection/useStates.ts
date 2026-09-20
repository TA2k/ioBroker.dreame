/**
 * Reads and follows a fixed set of states.
 *
 * Every panel needs the same four steps - read the current values so the panel is populated at
 * once, subscribe, re-render on change, unsubscribe on the way out - and getting the last one
 * wrong leaks a subscription per device switch. Doing it once here means a panel is a list of
 * state ids and a render function.
 *
 * ## The ids are a list, not a pattern
 *
 * A pattern would pull in a device's entire `status` branch, which on a well-equipped model is
 * well over a hundred states, to render a panel that shows four. Each panel names what it needs.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { StateHandler, TabConnection } from "./types";
import { patternToRegExp } from "./AdminTabConnection";

/** Current values by state id. A state that does not exist is absent rather than null. */
export type StateValues = Readonly<Record<string, unknown>>;

/**
 * @param connection How to reach ioBroker.
 * @param ids State ids to follow. Order does not matter; contents do.
 */
export function useStates(connection: TabConnection, ids: readonly string[]): StateValues {
	const [values, setValues] = useState<StateValues>({});

	// Callers build their id list inline, so a fresh array arrives on every render. Comparing the
	// contents rather than the identity keeps that from tearing down and rebuilding every
	// subscription each time the component re-renders.
	const key = ids.join("\u0000");
	const stable = useMemo(() => ids.slice(), [key]);

	// Kept in a ref so the effect can see the newest handler without listing it as a dependency.
	const latest = useRef<StateValues>({});
	latest.current = values;

	useEffect(() => {
		if (stable.length === 0) {
			setValues({});
			return;
		}

		let cancelled = false;
		setValues({});

		const wanted = new Set(stable);
		const handler: StateHandler = (id, state) => {
			if (cancelled || !wanted.has(id)) return;
			setValues(previous => ({ ...previous, [id]: state?.val }));
		};

		void (async () => {
			const initial = await Promise.all(
				stable.map(async id => [id, (await connection.getState(id))?.val] as const),
			);
			if (cancelled) return;

			const next: Record<string, unknown> = {};
			for (const [id, value] of initial) {
				if (value !== undefined) next[id] = value;
			}
			setValues(next);

			await Promise.all(stable.map(id => connection.subscribe(id, handler)));
		})();

		return () => {
			cancelled = true;
			for (const id of stable) connection.unsubscribe(id, handler);
		};
	}, [connection, stable]);

	return values;
}

/** Reads a value as a finite number, or null where it is absent or not numeric. */
export function asNumber(value: unknown): number | null {
	if (value == null || value === "") return null;
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : null;
}

/** Reads a value as a boolean, treating the numeric and string forms ioBroker also carries. */
export function asBoolean(value: unknown): boolean | null {
	if (value == null || value === "") return null;
	if (typeof value === "boolean") return value;
	if (typeof value === "number") return value !== 0;
	if (value === "true") return true;
	if (value === "false") return false;
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed !== 0 : null;
}

/**
 * Reads and follows every state matching a wildcard pattern.
 *
 * Used where the ids are not known in advance - schedules and shortcuts are numbered by the app,
 * and a device can gain or lose one at any time. The initial read is a separate call because a
 * subscription alone delivers only *changes*: without it the panel would stay empty until the
 * user happened to edit something in the app.
 *
 * @param pattern e.g. `dreame.0.<did>.schedule.*`, or null for nothing.
 */
export function useStatesByPattern(connection: TabConnection, pattern: string | null): StateValues {
	const [values, setValues] = useState<StateValues>({});

	useEffect(() => {
		if (!pattern) {
			setValues({});
			return;
		}

		let cancelled = false;
		setValues({});

		const matches = patternToRegExp(pattern);
		const handler: StateHandler = (id, state) => {
			if (cancelled || !matches.test(id)) return;
			setValues(previous => ({ ...previous, [id]: state?.val }));
		};

		void (async () => {
			const initial = await connection.getStates(pattern);
			if (cancelled) return;

			const next: Record<string, unknown> = {};
			for (const [id, state] of Object.entries(initial)) {
				if (state?.val !== undefined) next[id] = state.val;
			}
			setValues(next);

			await connection.subscribe(pattern, handler);
		})();

		return () => {
			cancelled = true;
			connection.unsubscribe(pattern, handler);
		};
	}, [connection, pattern]);

	return values;
}
