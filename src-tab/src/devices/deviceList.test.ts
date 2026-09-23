import { describe, expect, it, vi } from "vitest";
import { DeviceList, chooseDevice, parseDeviceList } from "./deviceList";
import type { StateHandler, StateValue, TabConnection } from "../connection/types";

/**
 * A connection that serves one state and hands out its own change trigger.
 *
 * Small enough to read at a glance, which is the point of the connection being an interface:
 * these tests need no socket, no admin and no adapter.
 */
function fakeConnection(initial: string | null): {
	connection: TabConnection;
	change: (value: string | null) => void;
	unsubscribed: () => number;
} {
	let handlers: StateHandler[] = [];
	let unsubscribeCount = 0;
	let current: StateValue | null = initial === null ? null : { val: initial };

	const connection: TabConnection = {
		getState: async () => current,
		getStates: async () => ({}),
		getObject: async () => null,
		getObjects: async () => ({}),
		setState: async () => undefined,
		subscribe: async (_id, handler) => {
			handlers.push(handler);
		},
		unsubscribe: (_id, handler) => {
			unsubscribeCount++;
			handlers = handlers.filter(existing => existing !== handler);
		},
	};

	return {
		connection,
		change: value => {
			current = value === null ? null : { val: value };
			for (const handler of handlers) handler("dreame.0.info.devices", current);
		},
		unsubscribed: () => unsubscribeCount,
	};
}

const twoDevices = JSON.stringify([
	{ did: "aaa", name: "Downstairs", typ: "vacuum" },
	{ did: "bbb", name: "Garden", typ: "mower" },
]);

describe("parseDeviceList", () => {
	it("reads a well-formed list", () => {
		expect(parseDeviceList(twoDevices)).toEqual([
			{ did: "aaa", name: "Downstairs", typ: "vacuum" },
			{ did: "bbb", name: "Garden", typ: "mower" },
		]);
	});

	it("falls back to the did as a name and to vacuum as a type", () => {
		expect(parseDeviceList(JSON.stringify([{ did: "aaa" }]))).toEqual([
			{ did: "aaa", name: "aaa", typ: "vacuum" },
		]);
	});

	it("drops entries without a usable did rather than inventing one", () => {
		const raw = JSON.stringify([{ name: "no did" }, { did: "" }, { did: "ok" }]);
		expect(parseDeviceList(raw).map(device => device.did)).toEqual(["ok"]);
	});

	it("yields an empty list for anything that is not a device array", () => {
		expect(parseDeviceList(null)).toEqual([]);
		expect(parseDeviceList("")).toEqual([]);
		expect(parseDeviceList("not json")).toEqual([]);
		expect(parseDeviceList(JSON.stringify({ did: "aaa" }))).toEqual([]);
	});
});

describe("chooseDevice", () => {
	const devices = parseDeviceList(twoDevices);

	it("honours a requested did that is present", () => {
		expect(chooseDevice(devices, "bbb")?.did).toBe("bbb");
	});

	it("ignores a requested did that is absent and takes the first", () => {
		expect(chooseDevice(devices, "ccc")?.did).toBe("aaa");
	});

	it("returns null for an empty list", () => {
		expect(chooseDevice([], "aaa")).toBeNull();
	});
});

describe("DeviceList", () => {
	it("loads the list and selects the first device", async () => {
		const { connection } = fakeConnection(twoDevices);
		const list = new DeviceList(connection, "dreame.0");

		const snapshot = await list.start();

		expect(snapshot.devices).toHaveLength(2);
		expect(snapshot.selected?.did).toBe("aaa");
	});

	it("opens on the device named in the URL", async () => {
		const { connection } = fakeConnection(twoDevices);
		const list = new DeviceList(connection, "dreame.0", "bbb");

		expect((await list.start()).selected?.did).toBe("bbb");
	});

	it("notifies listeners when the list changes", async () => {
		const { connection, change } = fakeConnection(twoDevices);
		const list = new DeviceList(connection, "dreame.0");
		await list.start();

		const listener = vi.fn();
		list.onChange(listener);
		change(JSON.stringify([{ did: "aaa", name: "Renamed", typ: "vacuum" }]));

		expect(listener).toHaveBeenCalledTimes(1);
		expect(listener.mock.calls[0]?.[0].devices).toHaveLength(1);
	});

	it("keeps the selection when an unrelated device is added", async () => {
		const { connection, change } = fakeConnection(twoDevices);
		const list = new DeviceList(connection, "dreame.0", "bbb");
		await list.start();

		change(
			JSON.stringify([
				{ did: "aaa", name: "Downstairs", typ: "vacuum" },
				{ did: "bbb", name: "Garden", typ: "mower" },
				{ did: "ccc", name: "New", typ: "vacuum" },
			]),
		);

		expect(list.snapshot().selected?.did).toBe("bbb");
	});

	it("moves the selection when the selected device disappears", async () => {
		const { connection, change } = fakeConnection(twoDevices);
		const list = new DeviceList(connection, "dreame.0", "bbb");
		await list.start();

		change(JSON.stringify([{ did: "aaa", name: "Downstairs", typ: "vacuum" }]));

		expect(list.snapshot().selected?.did).toBe("aaa");
	});

	it("reports no device once the list empties", async () => {
		const { connection, change } = fakeConnection(twoDevices);
		const list = new DeviceList(connection, "dreame.0");
		await list.start();

		change(JSON.stringify([]));

		expect(list.snapshot().selected).toBeNull();
	});

	it("refuses to select a device that is not in the list", async () => {
		const { connection } = fakeConnection(twoDevices);
		const list = new DeviceList(connection, "dreame.0");
		await list.start();

		list.select("ccc");

		expect(list.snapshot().selected?.did).toBe("aaa");
	});

	it("survives a listener that throws and still serves the others", async () => {
		const { connection, change } = fakeConnection(twoDevices);
		const list = new DeviceList(connection, "dreame.0");
		await list.start();
		vi.spyOn(console, "error").mockImplementation(() => undefined);

		const good = vi.fn();
		list.onChange(() => {
			throw new Error("boom");
		});
		list.onChange(good);
		change(JSON.stringify([{ did: "aaa", name: "Downstairs", typ: "vacuum" }]));

		expect(good).toHaveBeenCalledTimes(1);
	});

	it("drops its subscription on stop", async () => {
		const { connection, unsubscribed } = fakeConnection(twoDevices);
		const list = new DeviceList(connection, "dreame.0");
		await list.start();

		list.stop();

		expect(unsubscribed()).toBe(1);
	});

	it("starts with no device when the state does not exist", async () => {
		const { connection } = fakeConnection(null);
		const list = new DeviceList(connection, "dreame.0");

		expect((await list.start()).selected).toBeNull();
	});
});
