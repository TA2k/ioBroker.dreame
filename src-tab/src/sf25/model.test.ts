import { describe, expect, it, vi } from "vitest";
import { activity, controls, MAX_STATE_AGE, sendCommand, type SF25States } from "./model";
import type { TabConnection } from "../connection/types";

const now = 1000000;
const state = (val: unknown) => ({ val, ts: now, ack: true });
const idle = (): SF25States => ({
	"status.state": state(2),
	"status.running-state": state(-1),
	"remote.program": state(-1),
	"info.online": state(true),
	"status.lid-open": state(false),
	"status.temperature": state(40),
});
describe("SF25 view state and command policy", () => {
	it("treats online as a transition flag, not a heartbeat, while requiring fresh device readings", () => {
		const states = { ...idle(), "info.online": { ...state(true), ts: now - 3600000 } };
		expect(controls(states, now)).toMatchObject({ ready: true, start: true, openLid: true });
		expect(controls(states, now + MAX_STATE_AGE + 1)).toMatchObject({
			ready: false,
			start: false,
			openLid: false,
			wake: true,
		});
	});
	it("allows waking as recovery with offline, unknown or old data without enabling guarded commands", () => {
		for (const states of [
			{},
			{ ...idle(), "info.online": state(false) },
			{ ...idle(), "status.state": { ...state(3), ts: now - MAX_STATE_AGE - 1 } },
		]) {
			expect(controls(states, now)).toMatchObject({ wake: true, start: false, openLid: false });
		}
	});
	it("gives standby and sleep precedence over retained running flags", () => {
		expect(activity({ ...idle(), "status.running-state": state(1), "remote.program": state(1) })).toBe("standby");
		expect(activity({ ...idle(), "status.state": state(3), "status.running-state": state(1) })).toBe("sleeping");
	});
	it("permits opening only on cool, fresh, stopped standby", () => {
		expect(controls(idle(), now).openLid).toBe(true);
		for (const [field, value] of [
			["status.temperature", 41],
			["status.temperature", NaN],
			["status.temperature", "30"],
			["remote.program", 1],
			["status.running-state", 1],
			["status.state", 3],
			["status.lid-open", true],
			["info.online", false],
		] as const) {
			expect(controls({ ...idle(), [field]: state(value) }, now).openLid).toBe(false);
		}
		for (const field of Object.keys(idle())) {
			expect(controls({ ...idle(), [field]: null }, now).openLid).toBe(false);
			expect(controls({ ...idle(), [field]: { ...state(0), ts: now - MAX_STATE_AGE - 1 } }, now).openLid).toBe(false);
		}
	});
	it("disables starting with unknown/open lid, old state or missing reachability", () => {
		expect(controls(idle(), now).start).toBe(true);
		for (const patch of [
			{ "status.lid-open": state(true) },
			{ "info.online": null },
			{ "status.state": { ...state(2), ack: false } },
			{ "status.state": { ...state(2), q: 0x40 } },
		]) {
			expect(controls({ ...idle(), ...patch }, now).start).toBe(false);
		}
		expect(controls(idle(), now + MAX_STATE_AGE + 1).start).toBe(false);
	});
	it("only offers pause/resume for confirmed current running/paused states", () => {
		const running = { ...idle(), "status.state": state(1), "status.running-state": state(1) };
		expect(controls(running, now)).toMatchObject({ pause: true, resume: false, start: false, stop: true });
		expect(controls({ ...running, "status.running-state": state(0) }, now)).toMatchObject({
			pause: false,
			resume: true,
		});
	});
	it("writes only SF25 command states under the selected instance and device", async () => {
		const setState = vi.fn().mockResolvedValue(undefined);
		const connection = { setState } as unknown as TabConnection;
		await sendCommand(connection, "dreame.2", "-123", "program", 2);
		await sendCommand(connection, "dreame.2", "-123", "open-lid", true);
		expect(setState.mock.calls).toEqual([
			["dreame.2.-123.remote.program", 2],
			["dreame.2.-123.remote.open-lid", true],
		]);
		for (const [name, value] of [
			["program", 1],
			["program", "0"],
			["open-lid", false],
			["silent-mode", 1],
			["start", true],
			["lid-open", true],
		]) {
			await expect(sendCommand(connection, "dreame.2", "-123", name as string, value)).rejects.toThrow();
		}
		expect(setState).toHaveBeenCalledTimes(2);
	});
});
