/**
 * The base station: empty the bin, wash the mop, dry the mop.
 *
 * Which buttons exist, when they may be pressed and what each says about itself is worked out in
 * `panels/station.ts`, from Home Assistant's rules as the widget ports them. This only draws them:
 * each with a tooltip that says what it does - or why it cannot be pressed just now, which is the
 * question a greyed-out button otherwise leaves open.
 *
 * A station with none of these jobs - a robot without one - shows no panel at all.
 */

import type React from "react";
import { Button, Stack, Tooltip } from "@mui/material";
import {
	DeleteSweep as EmptyIcon,
	WaterDrop as WashIcon,
	Air as DryIcon,
	Pause as PauseIcon,
	PlayArrow as ResumeIcon,
} from "@mui/icons-material";
import { I18n } from "@iobroker/gui-components";

import { PanelSection, useCommandRunner } from "./PanelSection";
import { asNumber } from "../connection/useStates";
import { isStarted } from "../status/statusCodes";
import { stationActions } from "../panels/station";
import type { StationAction, StationCommand } from "../panels/station";
import type { DeviceStatus } from "../status/useDeviceStatus";
import type { DeviceCommands } from "../commands/commands";

export interface StationPanelProps {
	status: DeviceStatus;
	commands: DeviceCommands;
	/** Buttons the user hid in the settings, by the ids of `StationAction`. */
	hidden?: ReadonlySet<string>;
}

function icon(action: StationAction): React.JSX.Element {
	if (action.command === "pauseWash") return <PauseIcon />;
	if (action.command === "resumeWash") return <ResumeIcon />;
	if (action.id === "empty") return <EmptyIcon />;
	if (action.id === "wash") return <WashIcon />;
	return <DryIcon />;
}

export function StationPanel({ status, commands, hidden }: StationPanelProps): React.JSX.Element | null {
	const { run, failureElement } = useCommandRunner();

	const number = (value: unknown): number | null => asNumber(value);
	const started = isStarted(number(status.taskStatus), number(status.robotStatus), Boolean(status.cleaningPaused));
	const actions = stationActions(
		{
			wash: number(status.washStatus),
			dustCollection: number(status.dustCollection),
			charging: number(status.charging),
			waterTank: number(status.waterTank),
			mopInStation: number(status.mopInStation),
			robotStatus: number(status.robotStatus),
			cleaningPaused: Boolean(status.cleaningPaused),
			drainage: number(status.drainage),
			autoEmpty: number(status.emptyStatus),
			state: number(status.state),
		},
		started,
	).filter(action => !hidden?.has(action.id));

	if (!actions.length) return null;

	const send: Record<StationCommand, () => Promise<void>> = {
		autoEmpty: () => commands.startAutoEmpty(),
		wash: () => commands.startWashing(),
		pauseWash: () => commands.pauseWashing(),
		resumeWash: () => commands.resumeWashing(),
		dry: () => commands.startDrying(),
		stopDry: () => commands.stopDrying(),
	};

	return (
		<PanelSection title={I18n.t("panel.station.titel")}>
			<Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
				{actions.map(action => (
					<Tooltip key={action.id} title={I18n.t(action.hintKey)}>
						{/* The span keeps the tooltip on a disabled button, which fires no events. */}
						<span>
							<Button
								size="small"
								variant="outlined"
								startIcon={icon(action)}
								disabled={action.disabled}
								onClick={run(send[action.command])}
							>
								{I18n.t(action.textKey)}
							</Button>
						</span>
					</Tooltip>
				))}
			</Stack>

			{failureElement}
		</PanelSection>
	);
}
