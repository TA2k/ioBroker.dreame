/**
 * The base station: empty the bin, wash the mop, dry the mop.
 *
 * Each action is offered only while the station is idle. The states that say so are the widget's
 * (`www/js/panels/station.js`): a non-zero `auto-empty-status`, `self-wash-base-status` or
 * `drainage-status` means that job is already running, and asking again during one is at best
 * ignored.
 *
 * Drying is the exception with two buttons, because it is the one job a user routinely wants to
 * end early - the others finish in under a minute.
 */

import type React from "react";
import { Button, Stack, Typography } from "@mui/material";
import { I18n } from "@iobroker/gui-components";

import { PanelSection, useCommandRunner } from "./PanelSection";
import { asNumber, useStates } from "../connection/useStates";
import type { TabConnection } from "../connection/types";
import type { DeviceCommands } from "../commands/commands";

/** Status codes at which the robot is drying its mop. From the widget's header panel. */
const DRYING_STATES = new Set([8, 35]);

export interface StationPanelProps {
	connection: TabConnection;
	instanceId: string;
	did: string;
	commands: DeviceCommands;
}

export function StationPanel({ connection, instanceId, did, commands }: StationPanelProps): React.JSX.Element {
	const status = (suffix: string): string => `${instanceId}.${did}.status.${suffix}`;

	const emptyId = status("auto-empty-status");
	const washId = status("self-wash-base-status");
	const drainId = status("drainage-status");
	const stateId = status("state");

	const values = useStates(connection, [emptyId, washId, drainId, stateId]);
	const { run, failureElement } = useCommandRunner();

	const emptying = (asNumber(values[emptyId]) ?? 0) !== 0;
	const washing = (asNumber(values[washId]) ?? 0) !== 0;
	const draining = (asNumber(values[drainId]) ?? 0) !== 0;
	const state = asNumber(values[stateId]);
	const drying = state != null && DRYING_STATES.has(state);

	// Any station job blocks the others: they share one mechanism.
	const busy = emptying || washing || draining;

	return (
		<PanelSection title={I18n.t("panel.station.titel")}>
			<Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
				<Button
					size="small"
					variant="outlined"
					disabled={busy}
					onClick={run(() => commands.startAutoEmpty())}
				>
					{I18n.t("panel.station.knopf.entleeren")}
				</Button>
				<Button size="small" variant="outlined" disabled={busy} onClick={run(() => commands.startWashing())}>
					{I18n.t("panel.station.knopf.waschen")}
				</Button>
				{drying ? (
					<Button size="small" variant="outlined" onClick={run(() => commands.stopDrying())}>
						{I18n.t("panel.station.knopf.trocknen-beenden")}
					</Button>
				) : (
					<Button size="small" variant="outlined" disabled={busy} onClick={run(() => commands.startDrying())}>
						{I18n.t("panel.station.knopf.trocknen")}
					</Button>
				)}
			</Stack>

			{busy ? (
				<Typography variant="body2" color="text.secondary">
					{I18n.t("panel.station.hinweis.laeuft")}
				</Typography>
			) : null}

			{failureElement}
		</PanelSection>
	);
}
