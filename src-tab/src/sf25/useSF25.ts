import { useEffect, useState } from "react";
import type { StateHandler, StateValue, TabConnection } from "../connection/types";
import { SF25_FIELDS, type SF25States } from "./model";

/** Retain timestamps/ack/quality and subscribe before reading, so pushes win over stale reads. */
export function useSF25(connection: TabConnection, prefix: string) {
	const [states, setStates] = useState<SF25States>({});
	const [error, setError] = useState(false);
	useEffect(() => {
		let cancelled = false;
		setStates({});
		setError(false);
		const changed = new Set<string>();
		const handlers: Array<[string, StateHandler]> = [];
		const apply = (field: string, state: StateValue | null): void => {
			if (!cancelled) setStates(previous => ({ ...previous, [field]: state }));
		};
		void Promise.all(
			SF25_FIELDS.map(async field => {
				const id = `${prefix}.${field}`;
				const handler: StateHandler = (_id, state) => {
					changed.add(field);
					apply(field, state);
				};
				handlers.push([id, handler]);
				await connection.subscribe(id, handler);
				if (cancelled) {
					connection.unsubscribe(id, handler);
					return;
				}
				const state = await connection.getState(id);
				if (!changed.has(field)) apply(field, state);
			}),
		).catch(() => {
			if (!cancelled) setError(true);
		});
		return () => {
			cancelled = true;
			for (const [id, handler] of handlers) connection.unsubscribe(id, handler);
		};
	}, [connection, prefix]);
	return { states, error };
}
