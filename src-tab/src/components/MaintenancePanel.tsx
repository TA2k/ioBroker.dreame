/**
 * Wear parts: how much life is left, and a way to reset the counter after a replacement.
 *
 * A part whose state the device does not report is left out rather than shown at zero - not every
 * model has every part, and a permanent "0 %" next to a part that does not exist is a maintenance
 * reminder for nothing.
 *
 * The reset is deliberately a small icon button rather than a prominent one: it does not change
 * anything physical, it tells the robot the part is new, and doing it by accident quietly costs
 * the user the warning they were relying on.
 */

import type React from "react";
import { Box, IconButton, LinearProgress, Stack, Tooltip, Typography } from "@mui/material";
import { RestartAlt as RestartAltIcon } from "@mui/icons-material";
import { I18n } from "@iobroker/gui-components";

import { PanelSection, useCommandRunner } from "./PanelSection";
import { asNumber, useStates } from "../connection/useStates";
import { DUST_BAG_STATE, WEAR_PARTS, dustBagSeverity, dustBagTextKey, wearSeverity } from "../panels/maintenance";
import type { TabConnection } from "../connection/types";
import type { DeviceCommands } from "../commands/commands";

export interface MaintenancePanelProps {
	connection: TabConnection;
	instanceId: string;
	did: string;
	commands: DeviceCommands;
	/** Rows the user hid in the settings, by state name. */
	hidden?: ReadonlySet<string>;
}

export function MaintenancePanel({
	connection,
	instanceId,
	did,
	commands,
	hidden,
}: MaintenancePanelProps): React.JSX.Element | null {
	const prefix = `${instanceId}.${did}.status.`;
	const ids = [...WEAR_PARTS.map(part => prefix + part.state), prefix + DUST_BAG_STATE];

	const values = useStates(connection, ids);
	const { run, failureElement } = useCommandRunner();

	const present = WEAR_PARTS.filter(part => !hidden?.has(part.state))
		.map(part => ({ part, percent: asNumber(values[prefix + part.state]) }))
		.filter(entry => entry.percent != null);
	const dustBag = asNumber(values[prefix + DUST_BAG_STATE]);
	const dustBagKey = hidden?.has(DUST_BAG_STATE) ? null : dustBagTextKey(dustBag);
	const dustBagLevel = dustBagSeverity(dustBag);

	// Nothing reported at all: the panel would be an empty heading.
	if (present.length === 0 && !dustBagKey) return null;

	return (
		<PanelSection title={I18n.t("panel.wartung.titel")}>
			{present.map(({ part, percent }) => {
				const severity = wearSeverity(percent);
				return (
					<Stack key={part.state} direction="row" spacing={1} sx={{ alignItems: "center" }}>
						<Typography variant="body2" sx={{ flex: "0 0 40%" }}>
							{I18n.t(part.nameKey)}
						</Typography>
						<Box sx={{ flex: "1 1 auto" }}>
							<LinearProgress
								variant="determinate"
								value={Math.max(0, Math.min(100, percent!))}
								color={severity === "bad" ? "error" : severity === "warn" ? "warning" : "primary"}
							/>
						</Box>
						<Typography variant="body2" sx={{ flex: "0 0 3.5em", textAlign: "right" }}>
							{percent} %
						</Typography>
						<Tooltip title={I18n.t("panel.wartung.reset")}>
							<IconButton
								size="small"
								aria-label={`${I18n.t("panel.wartung.reset")} – ${I18n.t(part.nameKey)}`}
								onClick={run(() => commands.resetWearPart(part.resetTrigger))}
							>
								<RestartAltIcon fontSize="small" />
							</IconButton>
						</Tooltip>
					</Stack>
				);
			})}

			{dustBagKey ? (
				<Stack direction="row" spacing={1} sx={{ justifyContent: "space-between" }}>
					<Typography variant="body2" color="text.secondary">
						{I18n.t("panel.wartung.saugbeutel.label")}
					</Typography>
					<Typography
						variant="body2"
						color={dustBagLevel === "bad" ? "error" : dustBagLevel === "warn" ? "warning" : undefined}
					>
						{I18n.t(dustBagKey)}
					</Typography>
				</Stack>
			) : null}

			{failureElement}
		</PanelSection>
	);
}
