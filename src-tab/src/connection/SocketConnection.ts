/**
 * Backs {@link TabConnection} with an ioBroker socket - the admin's, vis-2's or the devices app's.
 *
 * All three hosts hand their widgets or tabs a `Connection` from `@iobroker/socket-client`, and
 * every method used here is on that base class, not on the admin's subclass. So one adapter
 * serves the tab, both widget sets and any host added later.
 *
 * The tab runs inside the admin, so it does not open a connection of its own the way the widget
 * in `www/` does - `GenericApp` from `@iobroker/gui-components` has one up before the first
 * component renders, and this is the thin layer that presents it as the interface the rest of the
 * tab is written against.
 *
 * Nothing here holds state. The one piece of bookkeeping it does is in {@link getObjects}, which
 * has to turn a wildcard pattern into the id range the admin's object view actually takes.
 */

import type { Connection } from "@iobroker/gui-components";
import type { StateHandler, StateValue, TabConnection } from "./types";

/**
 * Highest character an ioBroker id can be followed by, used to close an open-ended range.
 *
 * The object view takes a start and an end id rather than a pattern, so "everything under this
 * prefix" is expressed as the prefix itself up to the prefix plus a character that sorts after
 * every character an id can contain. This is the idiom the admin and js-controller use.
 */
const ID_RANGE_END = "香";

/** Turns `a.b.c.*` into the `[start, end]` pair the object view takes. */
export function patternToRange(pattern: string): { start: string; end: string } {
	const star = pattern.indexOf("*");
	const prefix = star === -1 ? pattern : pattern.slice(0, star);
	return { start: prefix, end: prefix + ID_RANGE_END };
}

export class SocketConnection implements TabConnection {
	public constructor(private readonly socket: Connection) {}

	public async getState(id: string): Promise<StateValue | null> {
		const state = await this.socket.getState(id);
		return (state as StateValue | null | undefined) ?? null;
	}

	public async getStates(pattern: string): Promise<Record<string, StateValue>> {
		const states = await this.socket.getForeignStates(pattern);
		return (states ?? {}) as Record<string, StateValue>;
	}

	public async getObject(id: string): Promise<ioBroker.Object | null> {
		const object = await this.socket.getObject(id);
		return (object as ioBroker.Object | null | undefined) ?? null;
	}

	/**
	 * Objects by pattern.
	 *
	 * The admin offers a range view rather than a pattern match, so the pattern is reduced to its
	 * prefix and the range is filtered afterwards. Only `state` objects are fetched: every current
	 * caller wants a state's `native`, and widening the view to all object types would pull in
	 * channels and devices for nothing.
	 */
	public async getObjects(pattern: string): Promise<Record<string, ioBroker.Object>> {
		const { start, end } = patternToRange(pattern);
		const view = await this.socket.getObjectViewSystem("state", start, end);
		if (!view) return {};

		// A prefix range is wider than the pattern wherever the pattern has a star in the middle
		// rather than at the end, so the result is matched properly before it is handed on.
		const matches = patternToRegExp(pattern);
		const result: Record<string, ioBroker.Object> = {};
		for (const [id, object] of Object.entries(view)) {
			if (matches.test(id)) result[id] = object as ioBroker.Object;
		}
		return result;
	}

	/** Writes as a command: `ack: false` is what makes the adapter act on it. */
	public async setState(id: string, value: unknown): Promise<void> {
		await this.socket.setState(id, { val: value as ioBroker.StateValue, ack: false });
	}

	public async subscribe(id: string, handler: StateHandler): Promise<void> {
		await this.socket.subscribeState(id, handler as never);
	}

	public unsubscribe(id: string, handler: StateHandler): void {
		this.socket.unsubscribeState(id, handler as never);
	}
}

/**
 * Translates an ioBroker wildcard pattern into a regular expression.
 *
 * `*` stands for any run of characters; every other regex metacharacter is escaped so that the
 * dots in an id stay literal dots rather than matching anything.
 */
export function patternToRegExp(pattern: string): RegExp {
	const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
	return new RegExp(`^${escaped}$`);
}
