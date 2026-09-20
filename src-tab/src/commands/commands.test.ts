import { describe, expect, it, vi } from "vitest";
import { DeviceCommands, remoteId } from "./commands";
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

		expect(writes).toEqual([
			{ id: "dreame.0.abc.remote.cleaning-sequence.order", value: "[3,1,2]" },
		]);
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
