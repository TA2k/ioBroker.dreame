import { describe, expect, it, vi } from "vitest";
import { DeviceCommands, START_ACK_TIMEOUT_MS, remoteId } from "./commands";
import type { TabConnection } from "../connection/types";

function recorder(): { connection: TabConnection; writes: Array<{ id: string; value: unknown }> } {
	const writes: Array<{ id: string; value: unknown }> = [];
	const connection: TabConnection = {
		getState: async () => null,
		getStates: async () => ({}),
		getObject: async () => null,
		getObjects: async () => ({}),
		setState: async (id, value) => {
			writes.push({ id, value });
		},
		subscribe: async () => undefined,
		unsubscribe: () => undefined,
	};
	return { connection, writes };
}

describe("remoteId", () => {
	it("builds an id under the device's remote branch", () => {
		expect(remoteId("dreame.0", "abc", "stop")).toBe("dreame.0.abc.remote.stop");
	});
});

describe("DeviceCommands", () => {
	// The ids and values are the widget's. A wrong suffix writes to a state that does not exist;
	// a wrong piid is a command that silently does something else. Both are pinned here.
	it("writes the trigger the widget writes for each simple command", async () => {
		const { connection, writes } = recorder();
		const commands = new DeviceCommands(connection, "dreame.0", "abc");

		await commands.start();
		await commands.stop();
		await commands.returnToDock();
		await commands.startWashing();
		await commands.startAutoEmpty();

		expect(writes).toEqual([
			{ id: "dreame.0.abc.remote.startCleaning", value: true },
			{ id: "dreame.0.abc.remote.stop", value: true },
			{ id: "dreame.0.abc.remote.return-to-dock", value: true },
			{ id: "dreame.0.abc.remote.start-washing", value: true },
			{ id: "dreame.0.abc.remote.start-auto-empty", value: true },
		]);
	});

	it("sends drying as the device's own property write, not a boolean", async () => {
		const { connection, writes } = recorder();
		const commands = new DeviceCommands(connection, "dreame.0", "abc");

		await commands.startDrying();
		await commands.stopDrying();

		expect(writes[0]).toEqual({
			id: "dreame.0.abc.remote.start-drying",
			value: JSON.stringify([{ piid: 10, value: "3,1" }]),
		});
		expect(writes[1]).toEqual({
			id: "dreame.0.abc.remote.stop-drying",
			value: JSON.stringify([{ piid: 10, value: "3,0" }]),
		});
	});

	it("addresses the device it was built for", async () => {
		const { connection, writes } = recorder();

		await new DeviceCommands(connection, "dreame.2", "other-device").stop();

		expect(writes[0]?.id).toBe("dreame.2.other-device.remote.stop");
	});

	it("lets a failed write reach the caller rather than swallowing it", async () => {
		const { connection } = recorder();
		vi.spyOn(connection, "setState").mockRejectedValue(new Error("refused"));

		await expect(new DeviceCommands(connection, "dreame.0", "abc").start()).rejects.toThrow("refused");
	});
});

describe("commands that build their own state id", () => {
	// These do not go through `trigger()`, so they assemble the id themselves - and an id that
	// loses its interpolation still compiles, still runs and writes to a state nobody watches.
	// Every one of them is pinned here, in full.
	it("starts a shortcut by its own id", async () => {
		const { connection, writes } = recorder();

		await new DeviceCommands(connection, "dreame.0", "abc").startShortcut("7");

		expect(writes).toEqual([{ id: "dreame.0.abc.shortcuts.7.start", value: true }]);
	});

	it("enables and disables a schedule by its own id", async () => {
		const { connection, writes } = recorder();
		const commands = new DeviceCommands(connection, "dreame.0", "abc");

		await commands.setScheduleEnabled("3", true);
		await commands.setScheduleEnabled("3", false);

		expect(writes).toEqual([
			{ id: "dreame.0.abc.schedule.3.enabled", value: true },
			{ id: "dreame.0.abc.schedule.3.enabled", value: false },
		]);
	});

	it("writes the cleaning sequence as a JSON array", async () => {
		const { connection, writes } = recorder();

		await new DeviceCommands(connection, "dreame.0", "abc").setSequenceOrder([3, 1, 2]);

		expect(writes).toEqual([{ id: "dreame.0.abc.remote.cleaning-sequence.order", value: "[3,1,2]" }]);
	});

	it("clears the sequence with an empty array", async () => {
		const { connection, writes } = recorder();

		await new DeviceCommands(connection, "dreame.0", "abc").clearSequence();

		expect(writes[0]).toEqual({ id: "dreame.0.abc.remote.cleaning-sequence.order", value: "[]" });
	});

	it("addresses the device it was built for, in every one of them", async () => {
		const { connection, writes } = recorder();
		const commands = new DeviceCommands(connection, "dreame.2", "other");

		await commands.startShortcut("1");
		await commands.setScheduleEnabled("1", true);
		await commands.setSequenceOrder([]);

		// The bug this guards against produced ids with the device missing entirely.
		for (const write of writes) expect(write.id.startsWith("dreame.2.other.")).toBe(true);
	});
});

describe("room selection commands", () => {
	/** A connection whose subscribers can be fed by hand, and whose state reads are scripted. */
	function scripted(activeMap: string | null): {
		connection: TabConnection;
		writes: Array<{ id: string; value: unknown }>;
		emit: (id: string, val: unknown, ack: boolean) => void;
	} {
		const writes: Array<{ id: string; value: unknown }> = [];
		const handlers = new Map<string, Set<(id: string, state: { val: unknown; ack?: boolean } | null) => void>>();
		const emit = (id: string, val: unknown, ack: boolean): void => {
			for (const handler of handlers.get(id) ?? []) handler(id, { val, ack });
		};
		const connection: TabConnection = {
			getState: async id => (id.endsWith(".active-map") && activeMap !== null ? { val: activeMap } : null),
			getStates: async () => ({}),
			getObject: async () => null,
			getObjects: async () => ({}),
			setState: async (id, value) => {
				writes.push({ id, value });
			},
			subscribe: async (id, handler) => {
				const set = handlers.get(id) ?? new Set();
				set.add(handler);
				handlers.set(id, set);
				// Like the real socket: the current value arrives while subscribing.
				handler(id, { val: false, ack: true });
			},
			unsubscribe: (id, handler) => {
				handlers.get(id)?.delete(handler);
			},
		};
		return { connection, writes, emit };
	}

	const prefix = "dreame.0.abc.remote.custom-room-cleaning";
	const switches = [`${prefix}.map-3.kitchen`, `${prefix}.map-3.bedroom`];

	it("writes a room's switch as the lasting value it is", async () => {
		const { connection, writes } = scripted("3");
		await new DeviceCommands(connection, "dreame.0", "abc").setRoomSelected(switches[0]!, true);
		expect(writes).toEqual([{ id: switches[0], value: true }]);
	});

	it("starts, and clears the selection only after the adapter has acknowledged the start", async () => {
		const { connection, writes, emit } = scripted("3");
		const running = new DeviceCommands(connection, "dreame.0", "abc").startSelectedRooms(3, switches);

		// The start is written; the value handed over while subscribing did not count as its
		// acknowledgement, so nothing has been cleared yet.
		await vi.waitFor(() => expect(writes).toEqual([{ id: `${prefix}.start`, value: true }]));

		emit(`${prefix}.start`, true, false); // our own write coming back
		await Promise.resolve();
		expect(writes).toHaveLength(1);

		emit(`${prefix}.start`, false, true); // the adapter's acknowledgement
		await running;
		expect(writes.slice(1)).toEqual([
			{ id: switches[0], value: false },
			{ id: switches[1], value: false },
		]);
	});

	it("points the adapter at the map the rooms were picked on when it names another", async () => {
		const { connection, writes, emit } = scripted("7");
		const running = new DeviceCommands(connection, "dreame.0", "abc").startSelectedRooms(3, []);

		await vi.waitFor(() => expect(writes).toHaveLength(2));
		expect(writes).toEqual([
			{ id: `${prefix}.active-map`, value: "3" },
			{ id: `${prefix}.start`, value: true },
		]);
		emit(`${prefix}.start`, false, true);
		await running;
	});

	it("clears the selection after the timeout when no acknowledgement comes", async () => {
		vi.useFakeTimers();
		try {
			const { connection, writes } = scripted("3");
			const running = new DeviceCommands(connection, "dreame.0", "abc").startSelectedRooms(3, switches);
			await vi.advanceTimersByTimeAsync(START_ACK_TIMEOUT_MS);
			await running;
			expect(writes.map(write => write.id)).toEqual([`${prefix}.start`, ...switches]);
		} finally {
			vi.useRealTimers();
		}
	});
});

describe("washing and tank commands", () => {
	it("pauses and resumes a wash with the widget's property writes, and resets the tank counter", async () => {
		const { connection, writes } = recorder();
		const commands = new DeviceCommands(connection, "dreame.0", "abc");

		await commands.pauseWashing();
		await commands.resumeWashing();
		await commands.resetTankCounter();

		expect(writes).toEqual([
			{ id: "dreame.0.abc.remote.pause-washing", value: JSON.stringify([{ piid: 10, value: "1,0" }]) },
			{ id: "dreame.0.abc.remote.resume-washing", value: JSON.stringify([{ piid: 10, value: "1,1" }]) },
			{ id: "dreame.0.abc.config.tank.wash-counter", value: 0 },
		]);
	});
});
