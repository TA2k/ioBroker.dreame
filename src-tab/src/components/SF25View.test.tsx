import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { StateHandler, StateValue, TabConnection } from "../connection/types";
import { SF25View } from "./SF25View";
vi.mock("@iobroker/gui-components", () => ({ I18n: { t: (key: string) => key, getLanguage: () => "de" } }));

function harness() {
	const prefix = "dreame.2.-123";
	const states: Record<string, StateValue> = {};
	for (const [field, val] of Object.entries({
		"status.state": 2,
		"status.activity": 0,
		"status.running-state": -1,
		"remote.program": -1,
		"status.lid-open": false,
		"status.temperature": 35,
		"info.online": true,
		"remote.silent-mode": false,
		"remote.child-lock": false,
	}))
		states[`${prefix}.${field}`] = { val, ack: true, ts: Date.now() };
	const handlers = new Map<string, StateHandler>();
	const connection: TabConnection = {
		getState: async id => states[id] ?? null,
		getStates: async () => ({}),
		getObject: async () => null,
		getObjects: async () => ({}),
		setState: vi.fn().mockResolvedValue(undefined),
		subscribe: async (id, handler) => {
			handlers.set(id, handler);
		},
		unsubscribe: vi.fn((id: string) => {
			handlers.delete(id);
		}),
	};
	return {
		connection,
		handlers,
		update: (field: string, val: unknown) => {
			const id = `${prefix}.${field}`;
			states[id] = { val, ack: true, ts: Date.now() };
			handlers.get(id)?.(id, states[id]!);
		},
	};
}
afterEach(cleanup);
describe("SF25 controls", () => {
	it("keeps wake available when reachability is unconfirmed and writes only the wake command", async () => {
		const h = harness();
		render(<SF25View connection={h.connection} instanceId="dreame.2" did="-123" header="SF25" />);
		await waitFor(() => expect(h.handlers.size).toBe(14));
		await act(async () => {
			h.update("info.online", false);
			h.update("status.state", 3);
		});
		expect((screen.getByRole("button", { name: "sf25.ui.start" }) as HTMLButtonElement).disabled).toBe(true);
		const wake = screen.getByRole("button", { name: "sf25.ui.wake" }) as HTMLButtonElement;
		expect(wake.disabled).toBe(false);
		fireEvent.click(wake);
		await waitFor(() => expect(h.connection.setState).toHaveBeenCalledWith("dreame.2.-123.remote.wake", true));
		expect(h.connection.setState).toHaveBeenCalledTimes(1);
	});
	it("never issues a device command on mount and confirms program starts", async () => {
		const h = harness();
		render(<SF25View connection={h.connection} instanceId="dreame.2" did="-123" header="Biomüllreaktor" />);
		await waitFor(() =>
			expect((screen.getByRole("button", { name: "sf25.ui.start" }) as HTMLButtonElement).disabled).toBe(false),
		);
		expect(h.connection.setState).not.toHaveBeenCalled();
		fireEvent.click(screen.getByRole("button", { name: "sf25.ui.clean" }));
		expect(h.connection.setState).not.toHaveBeenCalled();
		fireEvent.click(screen.getByRole("button", { name: "sf25.ui.confirm" }));
		await waitFor(() => expect(h.connection.setState).toHaveBeenCalledWith("dreame.2.-123.remote.program", 2));
	});
	it("updates live, keeps standby despite retained flags, and removes all subscriptions", async () => {
		const h = harness();
		const { unmount } = render(<SF25View connection={h.connection} instanceId="dreame.2" did="-123" header="SF25" />);
		await waitFor(() => expect(h.handlers.size).toBe(14));
		await act(async () => {
			h.update("status.running-state", 1);
			h.update("remote.program", 1);
		});
		expect(screen.getByText("sf25.ui.standby")).toBeTruthy();
		expect((screen.getByRole("button", { name: "sf25.ui.openLid" }) as HTMLButtonElement).disabled).toBe(true);
		unmount();
		expect(h.handlers.size).toBe(0);
	});
	it("surfaces write failure instead of claiming device execution", async () => {
		const h = harness();
		vi.mocked(h.connection.setState).mockRejectedValue(new Error("disconnected"));
		render(<SF25View connection={h.connection} instanceId="dreame.2" did="-123" header="SF25" />);
		fireEvent.click(screen.getByRole("button", { name: "sf25.ui.refresh" }));
		await waitFor(() => expect(screen.getByText("sf25.ui.failed")).toBeTruthy());
	});
});
