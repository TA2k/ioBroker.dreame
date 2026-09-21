/**
 * The status header: what the robot is doing, and the three things one usually wants to tell it.
 *
 * Deliberately the smallest useful slice of the widget's header panel - status, battery, progress
 * and Start/Stop/Dock. The rest of that panel (station, maintenance, water and mop, statistics)
 * are separate panels in the widget too, and each is worth its own step rather than one component
 * that grows until nobody can see what it does.
 */

import type React from "react";
import { Alert, Box, Button, LinearProgress, Snackbar, Stack, Typography } from "@mui/material";
import { PlayArrow as PlayArrowIcon, Stop as StopIcon, Home as HomeIcon } from "@mui/icons-material";
import { useState } from "react";
import { I18n } from "@iobroker/gui-components";

import { statusTextKey } from "../status/statusCodes";
import { asNumber } from "../connection/useStates";
import type { DeviceStatus } from "../status/useDeviceStatus";
import type { DeviceCommands } from "../commands/commands";

export interface StatusPanelProps {
	status: DeviceStatus;
	commands: DeviceCommands | null;
}

export function StatusPanel({ status, commands }: StatusPanelProps): React.JSX.Element {
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

	return (
		<Stack spacing={1.5} sx={{ py: 2 }}>
			<Box>
				<Typography variant="h6">{statusText}</Typography>
				<Typography variant="body2" color="text.secondary">
					{[
						battery != null ? `${battery} %` : null,
						area != null && area > 0 ? `${area} m²` : null,
						time != null && time > 0 ? `${time} min` : null,
					]
						.filter(Boolean)
						.join(" · ") || "–"}
				</Typography>
			</Box>

			{progress != null && progress > 0 && progress < 100 ? (
				<LinearProgress variant="determinate" value={progress} />
			) : null}

			<Stack direction="row" spacing={1}>
				<Button
					variant="contained"
					color="success"
					startIcon={<PlayArrowIcon />}
					disabled={!commands}
					onClick={commands ? run(() => commands.start()) : undefined}
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
