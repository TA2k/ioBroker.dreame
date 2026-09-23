/**
 * Where the page finds ioBroker, and how it connects - the old web interface's rules
 * (`www/js/core/daten.js`), kept so that its links and bookmarks keep working.
 *
 * ## The server
 *
 * 1. `?iob=http://host:8082` in the address - for a page opened from somewhere else, e.g. a file
 *    on a tablet. Remembered in the browser, so the parameter is needed once.
 * 2. What the browser remembered.
 * 3. Where the page came from - the normal case, served by the web adapter, with nothing to set.
 *
 * ## The client library
 *
 * Under `/socket.io/socket.io.js` the web adapter serves one of two libraries, depending on its
 * instance: the real socket.io client, whose `io` is a function, or the pure-websocket shim of
 * `@iobroker/ws-server-library`, whose `io` only has `connect`. Calling `io(...)` on the shim fails
 * with "io is not a function"; `pickConnect` finds whichever entry point the loaded one has.
 */

const REMEMBERED = "dreame.iob";

/** The ioBroker server the page talks to, or null where there is none to be had. */
export function serverBase(search: string, origin: string, protocol: string, storage: Storage | null): string | null {
	const fromUrl = new URLSearchParams(search).get("iob");
	if (fromUrl) {
		try {
			storage?.setItem(REMEMBERED, fromUrl);
		} catch {
			// private mode or blocked storage: the parameter still works for this visit
		}
		return fromUrl.replace(/\/+$/, "");
	}
	try {
		const remembered = storage?.getItem(REMEMBERED);
		if (remembered) return remembered.replace(/\/+$/, "");
	} catch {
		// as above
	}
	return protocol === "file:" ? null : origin;
}

export type ConnectFunction = (url: string, options: unknown) => unknown;

/** The connect function of whichever client library was loaded. */
export function pickConnect(client: unknown): ConnectFunction | null {
	if (typeof client === "function") return client as ConnectFunction;
	const connect = (client as { connect?: unknown } | null | undefined)?.connect;
	return typeof connect === "function" ? (connect as ConnectFunction) : null;
}

export function loadScript(src: string): Promise<void> {
	return new Promise((resolve, reject) => {
		const script = document.createElement("script");
		script.src = src;
		script.onload = () => resolve();
		script.onerror = () => reject(new Error(`Cannot load ${src}`));
		document.head.appendChild(script);
	});
}
