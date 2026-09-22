/**
 * Fresh water and the mop.
 *
 * The tank figures come from the adapter's own bookkeeping under `<did>.config.tank.` rather than
 * from the robot: the device reports washes, not litres, so the adapter counts down from a
 * configured capacity - and says itself when that is getting low (`config.tank.status`), which
 * colours the bar and raises the warning. Below it the rows the device reports: tank, mop,
 * wetness, detergent, water temperature. Content and wording are the widget's; see
 * `panels/water.ts`.
 *
 * After a refill the counter has to be told, which is what the button is for.
 */

import type React from "react";
import { useMemo } from "react";
import { Alert, Box, Button, LinearProgress, Stack, Typography } from "@mui/material";
import { WaterDrop as RefillIcon } from "@mui/icons-material";
import { I18n } from "@iobroker/gui-components";

import { PanelSection, useCommandRunner } from "./PanelSection";
import { useStates } from "../connection/useStates";
import { useObjectStates } from "../connection/useObjectStates";
import { waterStateIds, waterValue, waterView } from "../panels/water";
import type { TabConnection } from "../connection/types";
import type { DeviceCommands } from "../commands/commands";

export interface WaterPanelProps {
	connection: TabConnection;
	instanceId: string;
	did: string;
	commands: DeviceCommands;
	/** Rows the user hid in the settings, by the ids of `WaterRow`, and `fuellstand` for the level. */
	hidden?: ReadonlySet<string>;
}

export function WaterPanel({
	connection,
	instanceId,
	did,
	commands,
	hidden,
}: WaterPanelProps): React.JSX.Element | null {
	const prefix = `${instanceId}.${did}.`;
	const ids = useMemo(() => waterStateIds(prefix), [prefix]);
	const values = useStates(connection, ids);
	const waterTankStates = useObjectStates(connection, `${prefix}status.water-tank`);
	const temperatureStates = useObjectStates(connection, `${prefix}remote.water-temperature`);
	const { run, failureElement } = useCommandRunner();

	const view = waterView(waterValue(values, prefix), { waterTankStates, temperatureStates }, key => I18n.t(key));
	const levelShown = view.level != null && !hidden?.has("fuellstand");
	const rows = view.rows.filter(row => !hidden?.has(row.id));

	// Nothing tracked and nothing reported: a robot without a water tank, or none configured.
	if (!levelShown && !rows.length) return null;

	const litres = (ml: number): string =>
		(ml / 1000).toLocaleString(I18n.getLanguage(), { minimumFractionDigits: 1, maximumFractionDigits: 1 });
	const levelColour =
		view.level?.status === "critical" ? "error" : view.level?.status === "warn" ? "warning" : "primary";

	return (
		<PanelSection title={I18n.t("panel.frischwasser.titel")}>
			{levelShown && view.level ? (
				<Box>
					<Typography
						variant="body2"
						sx={view.level.nearlyEmpty ? { fontWeight: 700, color: "error.main" } : undefined}
					>
						{litres(view.level.remainingMl)} / {litres(view.level.capacityMl)} L
					</Typography>
					<LinearProgress variant="determinate" value={view.level.percent} color={levelColour} />
				</Box>
			) : null}

			{rows.map(row => (
				<Stack key={row.id} direction="row" spacing={1} sx={{ justifyContent: "space-between" }}>
					<Typography variant="body2" color="text.secondary">
						{I18n.t(row.labelKey)}
					</Typography>
					<Typography variant="body2" sx={{ textAlign: "right" }}>
						{row.text}
					</Typography>
				</Stack>
			))}

			{levelShown && view.warningKey ? (
				<Alert severity={view.warningCritical ? "error" : "warning"}>{I18n.t(view.warningKey)}</Alert>
			) : null}

			<Box>
				<Button
					size="small"
					variant="outlined"
					startIcon={<RefillIcon />}
					onClick={run(() => commands.resetTankCounter())}
				>
					{I18n.t("panel.frischwasser.reset-knopf")}
				</Button>
			</Box>

			{failureElement}
		</PanelSection>
	);
}
