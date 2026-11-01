import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { StateHandler, TabConnection } from "../connection/types";
import { DeviceWorkspace } from "./DeviceWorkspace";
vi.mock("@iobroker/gui-components", () => ({ I18n: { t: (key: string) => key, getLanguage: () => "de" } }));
vi.mock("./DreameView", () => ({
	DreameView: ({ did, headerStart }: { did: string; headerStart: React.ReactNode }) => (
		<div>
			{headerStart}
			<div data-testid="robot-view">{did}</div>
		</div>
	),
}));
afterEach(cleanup);
function connection(robotList = "[]") {
	const handlers = new Map<string, StateHandler>();
	const c: TabConnection = {
		getState: async id => ({
			val: id.endsWith("info.sf25Devices")
				? JSON.stringify([{ did: "sf", name: "Biomüllreaktor", typ: "fwd" }])
				: id.endsWith("info.devices")
					? robotList
					: null,
		}),
		getStates: async () => ({}),
		getObjects: async () => ({}),
		getObject: async () => null,
		setState: vi.fn(),
		subscribe: async (id, handler) => {
			handlers.set(id, handler);
		},
		unsubscribe: id => {
			handlers.delete(id);
		},
	};
	return { c, handlers };
}
describe("SF25 workspace routing", () => {
	it("shows SF25-only accounts without a robot view or implicit commands, including StrictMode", async () => {
		const { c } = connection();
		render(
			<React.StrictMode>
				<DeviceWorkspace connection={c} instanceId="dreame.0" requestedDid={null} emptyMessage="empty" />
			</React.StrictMode>,
		);
		await waitFor(() => expect(screen.getByRole("button", { name: "sf25.ui.openLid" })).toBeTruthy());
		expect(screen.queryByTestId("robot-view")).toBeNull();
		expect(c.setState).not.toHaveBeenCalled();
	});
	it("switches mixed accounts between the existing robot view and SF25 without sharing device state", async () => {
		const { c } = connection(JSON.stringify([{ did: "robot", name: "Saugroboter", typ: "vacuum" }]));
		render(<DeviceWorkspace connection={c} instanceId="dreame.0" requestedDid={null} emptyMessage="empty" />);
		await waitFor(() => expect(screen.getByTestId("robot-view").textContent).toBe("robot"));
		fireEvent.mouseDown(screen.getByRole("combobox"));
		fireEvent.click(await screen.findByRole("option", { name: "Biomüllreaktor" }));
		await waitFor(() => expect(screen.queryByTestId("robot-view")).toBeNull());
		expect(screen.getByRole("button", { name: "sf25.ui.start" })).toBeTruthy();
		fireEvent.mouseDown(screen.getByRole("combobox"));
		fireEvent.click(await screen.findByRole("option", { name: "Saugroboter" }));
		await waitFor(() => expect(screen.getByTestId("robot-view").textContent).toBe("robot"));
		expect(c.setState).not.toHaveBeenCalled();
	});
});
