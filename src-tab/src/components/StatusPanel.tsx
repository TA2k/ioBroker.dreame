/**
 * The status header: what the robot is doing, and the three things one usually wants to tell it.
 *
 * The widget's header panel: the state, below it what only matters while it lasts (run time,
 * drying progress), a row of battery, cleaning progress and area, and Start/Stop/Dock.
 *
 * ## Progress and area only while a task runs
 *
 * The robot keeps no "last cleaning" figures: once it is back, cleaned area and progress are
 * whatever it left in them, often 0. A number there would read as a result it is not, so they show
 * a dash until a task is under way - the widget made the same call.
 *
 * ## Start cleans the picked rooms, or everything
 *
 * With rooms picked on the map, Start cleans just those, through the adapter's room cleaning, and
 * clears the pick once the adapter has taken it. With none picked it cleans the whole home.
 */

import type React from "react";
import { Alert, Box, Button, LinearProgress, Snackbar, Stack, Typography } from "@mui/material";
import { PlayArrow as PlayArrowIcon, Stop as StopIcon, Home as HomeIcon } from "@mui/icons-material";
import { useState } from "react";
import { I18n } from "@iobroker/gui-components";

import { DRYING_STATES, isStarted, isWorking, statusTextKey } from "../status/statusCodes";
import { asNumber } from "../connection/useStates";
import type { DeviceStatus } from "../status/useDeviceStatus";
import type { DeviceCommands } from "../commands/commands";
import type { RoomSelection } from "../panels/useRoomSelection";

export interface StatusPanelProps {
	status: DeviceStatus;
	commands: DeviceCommands | null;
	/** Rooms picked on the map. Absent or empty: Start cleans everything. */
	selection?: RoomSelection;
}

export function StatusPanel({ status, commands, selection }: StatusPanelProps): React.JSX.Element {
	// A command that fails must say so. It is a write to a state over a socket; it can be refused,
	// and a button that silently does nothing is worse than an error.
	const [failure, setFailure] = useState<string | null>(null);

	const run = (action: () => Promise<void>) => (): void => {
		void action().catch((error: unknown) => {
			setFailure(error instanceof Error ? error.message : String(error));
		});
	};

	const state = asNumber(status.state);
	const key = statusTextKey(state);
	const statusText = key
		? I18n.t(key)
		: state != null
			? `${I18n.t("panel.kopf.status.unbekannter-code-praefix")} ${state}`
			: "–";

	const battery = asNumber(status.battery);
	const progress = asNumber(status.cleaningProgress);
	const area = asNumber(status.cleanedArea);
	const time = asNumber(status.cleaningTime);
	const drying = asNumber(status.dryingProgress);
	const started = isStarted(asNumber(status.taskStatus), asNumber(status.robotStatus), Boolean(status.cleaningPaused));

	const details = [
		isWorking(state) && time != null && time > 0 ? `${time} min` : null,
		state != null && DRYING_STATES.has(state) && drying != null && drying > 0
			? `${I18n.t("panel.kopf.trocknung-praefix")} ${drying} %`
			: null,
	].filter(Boolean);

	const figures = [
		{ label: I18n.t("tab.info.akku"), value: battery != null ? `${battery} %` : "–" },
		{ label: I18n.t("tab.info.reinigung"), value: started && progress != null ? `${progress} %` : "–" },
		{ label: I18n.t("tab.info.flaeche"), value: started && area != null ? `${area} m²` : "–" },
	];

	const start = (): Promise<void> => {
		if (!commands) return Promise.resolve();
		if (selection && selection.mapId != null && selection.selected.size > 0) {
			return commands.startSelectedRooms(
				selection.mapId,
				selection.switches.map(entry => entry.stateId),
			);
		}
		return commands.start();
	};

	return (
		<Stack spacing={1.5} sx={{ py: 2 }}>
			<Box>
				<Typography variant="h6">{statusText}</Typography>
				<Typography variant="body2" color="text.secondary">
					{details.length ? details.join(" · ") : "–"}
				</Typography>
			</Box>

			<Stack direction="row" spacing={2}>
				{figures.map(figure => (
					<Box key={figure.label} sx={{ minWidth: 0 }}>
						<Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
							{figure.value}
						</Typography>
						<Typography variant="caption" color="text.secondary">
							{figure.label}
						</Typography>
					</Box>
				))}
			</Stack>

			{started && progress != null && progress > 0 && progress < 100 ? (
				<LinearProgress variant="determinate" value={progress} />
			) : null}

			<Stack direction="row" spacing={1}>
				<Button
					variant="contained"
					color="success"
					startIcon={<PlayArrowIcon />}
					disabled={!commands}
					onClick={run(start)}
				>
					{I18n.t("panel.kopf.start-knopf")}
				</Button>
				<Button
					variant="contained"
					color="error"
					disabled={!commands}
					onClick={commands ? run(() => commands.stop()) : undefined}
					aria-label={I18n.t("tab.stop")}
				>
					<StopIcon />
				</Button>
				<Button
					variant="contained"
					disabled={!commands}
					onClick={commands ? run(() => commands.returnToDock()) : undefined}
					aria-label={I18n.t("tab.dock")}
				>
					<HomeIcon />
				</Button>
			</Stack>

			<Snackbar
				open={failure !== null}
				autoHideDuration={6000}
				onClose={() => setFailure(null)}
				anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
			>
				<Alert severity="error" onClose={() => setFailure(null)}>
					{I18n.t("tab.commandFailed")}: {failure}
				</Alert>
			</Snackbar>
		</Stack>
	);
}
