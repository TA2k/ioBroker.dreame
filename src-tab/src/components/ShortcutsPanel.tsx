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
import { Button, IconButton, Stack, Tooltip } from "@mui/material";
import {
	PlayArrow as PlayArrowIcon,
	HourglassTop as HourglassTopIcon,
	Visibility as VisibilityIcon,
	VisibilityOff as VisibilityOffIcon,
} from "@mui/icons-material";
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
	/** Shortcut ids the user hid. */
	hidden?: ReadonlySet<string>;
	/**
	 * While the settings are open every shortcut shows, with an eye to hide or show it - the
	 * widget's way, since shortcuts differ per robot and have no fixed place in the settings.
	 */
	editing?: boolean;
	onToggleHidden?: (shortcutId: string) => void;
}

export function ShortcutsPanel({
	connection,
	instanceId,
	did,
	commands,
	hidden,
	editing = false,
	onToggleHidden,
}: ShortcutsPanelProps): React.JSX.Element | null {
	const prefix = `${instanceId}.${did}.shortcuts.`;
	const values = useStatesByPattern(connection, `${prefix}*`);
	const { run, failureElement } = useCommandRunner();

	const shortcuts = parseShortcuts(values, prefix).filter(shortcut => editing || !hidden?.has(shortcut.id));
	if (shortcuts.length === 0) return null;

	return (
		<PanelSection title={I18n.t("panel.shortcuts.titel")}>
			<Stack spacing={1}>
				{shortcuts.map(shortcut => {
					const isHidden = hidden?.has(shortcut.id) === true;
					return (
						<Stack
							key={shortcut.id}
							direction="row"
							spacing={0.5}
							sx={{ alignItems: "center", opacity: isHidden ? 0.5 : 1 }}
						>
							<Button
								size="small"
								variant="outlined"
								disabled={shortcut.running || isHidden}
								startIcon={shortcut.running ? <HourglassTopIcon /> : <PlayArrowIcon />}
								onClick={run(() => commands.startShortcut(shortcut.id))}
								sx={{ justifyContent: "flex-start", textTransform: "none", flex: "1 1 auto" }}
							>
								{shortcut.name}
								{shortcut.running ? ` – ${I18n.t("panel.shortcuts.laeuft")}` : ""}
							</Button>
							{editing && onToggleHidden ? (
								<Tooltip title={I18n.t(isHidden ? "panel.shortcuts.einblenden" : "panel.shortcuts.ausblenden")}>
									<IconButton size="small" onClick={() => onToggleHidden(shortcut.id)}>
										{isHidden ? <VisibilityOffIcon fontSize="small" /> : <VisibilityIcon fontSize="small" />}
									</IconButton>
								</Tooltip>
							) : null}
						</Stack>
					);
				})}
			</Stack>

			{failureElement}
		</PanelSection>
	);
}
