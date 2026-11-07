import type { StateValue, TabConnection } from "../connection/types";

export const SF25_FIELDS = [
	"status.state",
	"status.activity",
	"status.running-state",
	"status.remaining-time",
	"status.temperature",
	"status.humidity",
	"status.energy",
	"status.carbon-filter-life",
	"status.carbon-filter-days",
	"status.lid-open",
	"remote.program",
	"remote.child-lock",
	"remote.silent-mode",
	"info.online",
] as const;
export type SF25States = Readonly<Record<string, StateValue | null | undefined>>;
export const MAX_STATE_AGE = 5 * 60 * 1000;

export function numeric(state: StateValue | null | undefined): number | null {
	return state?.ack === true && !state.q && typeof state.val === "number" && Number.isFinite(state.val)
		? state.val
		: null;
}
export function booleanValue(state: StateValue | null | undefined): boolean | null {
	return state?.ack === true && !state.q && typeof state.val === "boolean" ? state.val : null;
}
export function fresh(state: StateValue | null | undefined, now: number): boolean {
	return (
		state?.ack === true &&
		!state.q &&
		typeof state.ts === "number" &&
		state.ts <= now &&
		now - state.ts <= MAX_STATE_AGE
	);
}

/** Device state takes precedence over raw running/program flags retained after a cycle. */
export function activity(states: SF25States): "running" | "paused" | "standby" | "sleeping" | "unknown" {
	const status = numeric(states["status.state"]);
	if (status === 2) return "standby";
	if (status === 3) return "sleeping";
	if (status === 1 && numeric(states["status.running-state"]) === 1) return "running";
	if (status === 1 && numeric(states["status.running-state"]) === 0) return "paused";
	return "unknown";
}

export function controls(states: SF25States, now: number) {
	// info.online is written on reachability transitions only, not on every poll.
	// Its age says nothing about liveness; fresh status supplies that evidence.
	const ready = fresh(states["status.state"], now) && booleanValue(states["info.online"]) === true;
	const current = activity(states);
	const idle = current === "standby" || current === "sleeping";
	const runningFresh = fresh(states["status.running-state"], now);
	const lidClosed = fresh(states["status.lid-open"], now) && booleanValue(states["status.lid-open"]) === false;
	return {
		ready,
		current,
		stale: !fresh(states["status.state"], now),
		start: ready && idle && lidClosed,
		pause: ready && current === "running" && runningFresh,
		resume: ready && current === "paused" && runningFresh && lidClosed,
		stop: ready && (current === "running" || current === "paused"),
		// Recovery must work even when status is old or reachability is unconfirmed.
		// The controller confirms awake status; this does not start a program.
		wake: current === "sleeping" || !ready,
		openLid:
			ready &&
			current === "standby" &&
			lidClosed &&
			["remote.program", "status.running-state", "status.temperature"].every(key => fresh(states[key], now)) &&
			numeric(states["remote.program"]) === -1 &&
			numeric(states["status.running-state"]) === -1 &&
			numeric(states["status.temperature"]) !== null &&
			numeric(states["status.temperature"])! <= 40,
	};
}

const BUTTONS = new Set(["wake", "pause", "resume", "Refresh", "open-lid"]);
export async function sendCommand(
	connection: TabConnection,
	instance: string,
	did: string,
	name: string,
	value: unknown,
): Promise<void> {
	if (
		BUTTONS.has(name)
			? value !== true
			: name === "program"
				? ![-1, 0, 2].includes(value as number)
				: ["child-lock", "silent-mode"].includes(name)
					? typeof value !== "boolean"
					: true
	) {
		throw new Error("Invalid SF25 command");
	}
	await connection.setState(`${instance}.${did}.remote.${name}`, value);
}
