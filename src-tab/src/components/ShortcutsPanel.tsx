/**
 * The app's shortcuts, one button each.
 *
 * Nothing is shown where the device has no shortcuts - they are created in the Dreame app, and
 * plenty of installations have none.
 *
 * A shortcut that is already running has its button disabled and says so. Pressing it again would
 * queue a second run of something the robot is in the middle of.
 */

import type React from "react";
import { Button, Stack } from "@mui/material";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import HourglassTopIcon from "@mui/icons-material/HourglassTop";
import { I18n } from "@iobroker/gui-components";

import { PanelSection, useCommandRunner } from "./PanelSection";
import { useStatesByPattern } from "../connection/useStates";
import { parseShortcuts } from "../panels/shortcuts";
import type { TabConnection } from "../connection/types";
import type { DeviceCommands } from "../commands/commands";

export interface ShortcutsPanelProps {
	connection: TabConnection;
	instanceId: string;
	did: string;
	commands: DeviceCommands;
}

export function ShortcutsPanel({
	connection,
	instanceId,
	did,
	commands,
}: ShortcutsPanelProps): React.JSX.Element | null {
	const prefix = `${instanceId}.${did}.shortcuts.`;
	const values = useStatesByPattern(connection, `${prefix}*`);
	const { run, failureElement } = useCommandRunner();

	const shortcuts = parseShortcuts(values, prefix);
	if (shortcuts.length === 0) return null;

	return (
		<PanelSection title={I18n.t("panel.shortcuts.titel")}>
			<Stack spacing={1}>
				{shortcuts.map(shortcut => (
					<Button
						key={shortcut.id}
						size="small"
						variant="outlined"
						disabled={shortcut.running}
						startIcon={shortcut.running ? <HourglassTopIcon /> : <PlayArrowIcon />}
						onClick={run(() => commands.startShortcut(shortcut.id))}
						sx={{ justifyContent: "flex-start", textTransform: "none" }}
					>
						{shortcut.name}
						{shortcut.running ? ` – ${I18n.t("panel.shortcuts.laeuft")}` : ""}
					</Button>
				))}
			</Stack>

			{failureElement}
		</PanelSection>
	);
}
