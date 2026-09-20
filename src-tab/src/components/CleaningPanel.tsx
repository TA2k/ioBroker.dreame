/**
 * Cleaning settings: mode, route, suction and wetness.
 *
 * The route list narrows with the mode, which is the one piece of behaviour here rather than
 * plumbing: intensive and deep are mopping intensities and the robot ignores them when it is only
 * vacuuming, so offering them would be offering a setting that does nothing.
 *
 * Wetness is a slider because the state is a 1..32 range, not a list of named steps - the widget
 * made the same choice for the same reason.
 */

import type React from "react";
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
} from "../panels/cleaningOptions";
import type { TabConnection } from "../connection/types";
import type { DeviceCommands } from "../commands/commands";

export interface CleaningPanelProps {
	connection: TabConnection;
	instanceId: string;
	did: string;
	commands: DeviceCommands;
}

export function CleaningPanel({ connection, instanceId, did, commands }: CleaningPanelProps): React.JSX.Element {
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

	const { options: routeOptions, stray: strayRoute } = routeChoice(mode, route);
	const routeValue = route != null && routeOptions.some(entry => entry.id === route) ? String(route) : "";

	return (
		<PanelSection title={I18n.t("panel.reinigung.titel")}>
			<Stack direction="row" spacing={1}>
				<TextField
					select
					fullWidth
					size="small"
					disabled={customized}
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
			</Stack>

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

			{/*
			 * Only shown while the mode actually mops, and only where the device has the state at
			 * all - not every model reports wetness, and a slider for a setting that goes nowhere is
			 * worse than no slider.
			 */}
			{wetness != null && mode != null && modeMops(mode) ? (
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
