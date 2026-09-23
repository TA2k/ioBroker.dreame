/**
 * Cleaning settings: mode, route, suction and wetness.
 *
 * The route list narrows with the mode, which is the one piece of behaviour here rather than
 * plumbing: intensive and deep are mopping intensities and the robot ignores them when it is only
 * vacuuming, so offering them would be offering a setting that does nothing.
 *
 * Wetness is a slider because the state is a 1..32 range, not a list of named steps - the widget
 * made the same choice for the same reason.
 *
 * ## What the widget does on top
 *
 * - The first line says which rooms the next start covers: all, or how many are picked.
 * - The mode is locked while a task runs; changing it mid-job would change the job.
 * - A mode change that leaves the route without a place in the new mode resets it to standard,
 *   as Home Assistant does - but only while nothing runs, for the same reason.
 * - A device that reports no route gets no route field, rather than an empty one.
 */

import type React from "react";
import { useEffect, useRef } from "react";
import { MenuItem, Slider, Stack, TextField, Typography } from "@mui/material";
import { I18n } from "@iobroker/gui-components";

import { PanelSection, useCommandRunner } from "./PanelSection";
import { asBoolean, asNumber, useStates } from "../connection/useStates";
import {
	CLEAN_MODES,
	SUCTION_KEYS,
	WETNESS_MAX,
	WETNESS_MIN,
	modeMops,
	modeVacuums,
	routeChoice,
	routesFor,
} from "../panels/cleaningOptions";
import type { TabConnection } from "../connection/types";
import type { DeviceCommands } from "../commands/commands";
import type { DeviceStatus } from "../status/useDeviceStatus";
import type { RoomSelection } from "../panels/useRoomSelection";
import { isStarted } from "../status/statusCodes";
import { selectionSummary } from "../panels/roomSelection";

/** The route a mode change falls back to: standard, which every mode offers. */
const STANDARD_ROUTE = 1;

export interface CleaningPanelProps {
	connection: TabConnection;
	instanceId: string;
	did: string;
	commands: DeviceCommands;
	status: DeviceStatus;
	/** Absent where rooms cannot be picked; the panel then says nothing about rooms. */
	selection?: RoomSelection;
	/** Fields the user hid in the settings: `modus`, `route`, `saug`, `wasser`. */
	hidden?: ReadonlySet<string>;
}

export function CleaningPanel({
	connection,
	instanceId,
	did,
	commands,
	status,
	selection,
	hidden,
}: CleaningPanelProps): React.JSX.Element {
	const modeId = `${instanceId}.${did}.remote.cleaning-mode`;
	// Read from status, written to remote: the two are different states, and using the writable
	// one as the source shows what was asked for rather than what the robot settled on.
	const routeId = `${instanceId}.${did}.status.cleaning-route`;
	const suctionId = `${instanceId}.${did}.remote.suction-level`;
	const wetnessId = `${instanceId}.${did}.remote.wetness-level`;

	// Per-room settings override the global ones, and the robot then ignores what is set here.
	const customId = `${instanceId}.${did}.remote.customized-cleaning`;

	const values = useStates(connection, [modeId, routeId, suctionId, wetnessId, customId]);
	const { run, failureElement } = useCommandRunner();

	const mode = asNumber(values[modeId]);
	const route = asNumber(values[routeId]);
	const suction = asNumber(values[suctionId]);
	const wetness = asNumber(values[wetnessId]);
	const customized = asBoolean(values[customId]) === true;

	const started = isStarted(asNumber(status.taskStatus), asNumber(status.robotStatus), Boolean(status.cleaningPaused));

	const { options: routeOptions, stray: strayRoute } = routeChoice(mode, route);
	const routeValue = route != null && routeOptions.some(entry => entry.id === route) ? String(route) : "";

	// Once per mode: should the robot refuse the reset, the next render must not send it again.
	const resetForMode = useRef<number | null>(null);
	useEffect(() => {
		if (mode == null || route == null || started) return;
		if (routesFor(mode).some(entry => entry.id === route)) return;
		if (resetForMode.current === mode) return;
		resetForMode.current = mode;
		void commands.setCleaningRoute(STANDARD_ROUTE).catch(() => undefined);
	}, [mode, route, started, commands]);

	const summary = selection?.available ? selectionSummary(selection.selected.size) : null;

	return (
		<PanelSection title={I18n.t("panel.reinigung.titel")}>
			{summary ? (
				<Typography variant="body2" color="text.secondary">
					{summary.count != null ? `${summary.count} ${I18n.t(summary.key)}` : I18n.t(summary.key)}
				</Typography>
			) : null}

			<Stack direction="row" spacing={1}>
				{hidden?.has("modus") ? null : (
					<TextField
						select
						fullWidth
						size="small"
						disabled={customized || started}
						label={I18n.t("panel.reinigung.modus.label")}
						value={mode != null ? String(mode) : ""}
						onChange={event => run(() => commands.setCleaningMode(Number(event.target.value)))()}
					>
						{CLEAN_MODES.map(entry => (
							<MenuItem key={entry.id} value={String(entry.id)}>
								{I18n.t(entry.key)}
							</MenuItem>
						))}
					</TextField>
				)}

				{route == null || hidden?.has("route") ? null : (
					<TextField
						select
						fullWidth
						size="small"
						disabled={customized}
						label={I18n.t("panel.reinigung.route.label")}
						value={routeValue}
						helperText={strayRoute ? I18n.t("panel.reinigung.route.nicht-fuer-modus") : undefined}
						onChange={event => run(() => commands.setCleaningRoute(Number(event.target.value)))()}
					>
						{routeOptions.map(entry => (
							<MenuItem key={entry.id} value={String(entry.id)}>
								{I18n.t(entry.key)}
								{entry === strayRoute ? " ⚠" : ""}
							</MenuItem>
						))}
					</TextField>
				)}
			</Stack>

			{hidden?.has("saug") ? null : (
				<TextField
					select
					fullWidth
					size="small"
					// Also off while the mode does not vacuum: there is nothing for a suction level to do.
					disabled={customized || (mode != null && !modeVacuums(mode))}
					label={I18n.t("panel.reinigung.saug.label")}
					value={suction != null && suction < SUCTION_KEYS.length ? String(suction) : ""}
					onChange={event => run(() => commands.setSuctionLevel(Number(event.target.value)))()}
				>
					{SUCTION_KEYS.map((key, level) => (
						<MenuItem key={key} value={String(level)}>
							{I18n.t(key)}
						</MenuItem>
					))}
				</TextField>
			)}

			{/*
			 * Only shown while the mode actually mops, and only where the device has the state at
			 * all - not every model reports wetness, and a slider for a setting that goes nowhere is
			 * worse than no slider.
			 */}
			{wetness != null && mode != null && modeMops(mode) && !hidden?.has("wasser") ? (
				<Stack spacing={0}>
					<Typography variant="body2" color="text.secondary">
						{I18n.t("panel.reinigung.wasser.label")}: {wetness}
					</Typography>
					<Slider
						size="small"
						min={WETNESS_MIN}
						max={WETNESS_MAX}
						value={wetness}
						// Committed on release rather than on every pixel: dragging would otherwise send
						// a state write per step, and each one reaches the robot.
						onChangeCommitted={(_event, value) =>
							run(() => commands.setWetnessLevel(Array.isArray(value) ? value[0]! : value))()
						}
						valueLabelDisplay="auto"
					/>
				</Stack>
			) : null}

			{failureElement}
		</PanelSection>
	);
}
