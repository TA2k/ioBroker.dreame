/**
 * The only way this tab reaches ioBroker.
 *
 * ## Why an interface rather than the admin socket directly
 *
 * Every view, panel and model in the tab takes one of these instead of the admin's own
 * `AdminConnection`. That buys three things, in the order they matter:
 *
 * 1. **Tests.** The map decoder, the device list and the 3D model can be driven from a plain
 *    object with seven methods on it. Nothing has to stand up a socket, an admin or a browser.
 * 2. **A second home.** The existing widget in `www/` talks to the web adapter over its own
 *    socket. Should the tab's views ever be wanted there too, they need a different connection,
 *    not different views.
 * 3. **A visible surface.** Everything this tab can ask of ioBroker is on this one page. A new
 *    capability has to be added here first, which is where somebody will notice it.
 *
 * ## What is deliberately absent
 *
 * There is no `sendTo`. The dreame adapter is driven entirely through states - every command the
 * existing widget issues is a `setState` on a trigger state (`www/js/core/trigger.js`) - so a
 * message channel would be a second way to do what the first way already does. If a future
 * feature genuinely needs one, it gets added here with a comment saying why states would not do.
 */

/** A state as ioBroker delivers it. Only the fields this tab reads are named. */
export interface StateValue {
	val: unknown;
	ack?: boolean;
	ts?: number;
	lc?: number;
}

/**
 * Called when a subscribed state changes.
 *
 * The id is passed because a single handler may be registered for a wildcard pattern, where the
 * concrete id is the only way to tell which state moved.
 */
export type StateHandler = (id: string, state: StateValue | null) => void;

/** What the tab can ask of ioBroker. */
export interface TabConnection {
	/** Current value, or null where the state does not exist. */
	getState(id: string): Promise<StateValue | null>;

	/**
	 * Every state matching a pattern, e.g. `dreame.0.<did>.schedule.*`.
	 *
	 * Missing states are simply absent from the result rather than present with a null value.
	 */
	getStates(pattern: string): Promise<Record<string, StateValue>>;

	/** Object for an id, or null. Needed for `native` fields that states do not carry. */
	getObject(id: string): Promise<ioBroker.Object | null>;

	/** Objects matching a pattern. The room ids behind the cleaning checkboxes live here. */
	getObjects(pattern: string): Promise<Record<string, ioBroker.Object>>;

	/** Writes a value as a command, i.e. unacknowledged. */
	setState(id: string, value: unknown): Promise<void>;

	/** Subscribes to an id or a wildcard pattern. */
	subscribe(id: string, handler: StateHandler): Promise<void>;

	/** Removes one handler. The subscription ends when its last handler is gone. */
	unsubscribe(id: string, handler: StateHandler): void;
}
