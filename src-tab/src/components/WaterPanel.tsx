/**
 * Fresh water and the mop.
 *
 * The tank figures come from the adapter's own bookkeeping under `<did>.config.tank.` rather than
 * from the robot: the device reports washes, not litres, so the adapter counts down from a
 * configured capacity. That is why the numbers exist even on models with no level sensor - and
 * why the panel stays out of sight entirely where the adapter has nothing configured.
 *
 * The low-water flag is a separate state and is shown on its own, because a robot can report
 * "low" long before the counted remainder reaches zero, and vice versa after a refill that was
 * not registered.
 */

import type React from "react";
import { Alert, LinearProgress, Stack, Typography } from "@mui/material";
import { I18n } from "@iobroker/gui-components";

import { PanelSection } from "./PanelSection";
import { asBoolean, asNumber, useStates } from "../connection/useStates";
import type { TabConnection } from "../connection/types";

export interface WaterPanelProps {
	connection: TabConnection;
	instanceId: string;
	did: string;
}

export function WaterPanel({ connection, instanceId, did }: WaterPanelProps): React.JSX.Element | null {
	const base = `${instanceId}.${did}.`;
	const capacityId = `${base}config.tank.capacity-ml`;
	const remainingId = `${base}config.tank.remaining-ml`;
	const washesId = `${base}config.tank.remaining-washes`;
	const counterId = `${base}config.tank.wash-counter`;
	const lowId = `${base}status.clean-water-tank-low`;

	const values = useStates(connection, [capacityId, remainingId, washesId, counterId, lowId]);

	const capacity = asNumber(values[capacityId]);
	const remaining = asNumber(values[remainingId]);
	const washes = asNumber(values[washesId]);
	const counter = asNumber(values[counterId]);
	const low = asBoolean(values[lowId]);

	// Nothing configured and nothing reported: the adapter is not tracking a tank for this device.
	if (capacity == null && remaining == null && washes == null && low == null) return null;

	const percent =
		capacity != null && capacity > 0 && remaining != null
			? Math.max(0, Math.min(100, (remaining / capacity) * 100))
			: null;

	return (
		<PanelSection title={I18n.t("panel.frischwasser.titel")}>
			{remaining != null && capacity != null ? (
				<Typography variant="body2">
					{(remaining / 1000).toFixed(1)} / {(capacity / 1000).toFixed(1)} L
				</Typography>
			) : null}

			{percent != null ? (
				<LinearProgress variant="determinate" value={percent} color={low ? "warning" : "primary"} />
			) : null}

			{counter != null || washes != null ? (
				<Stack direction="row" spacing={1} sx={{ justifyContent: "space-between" }}>
					<Typography variant="body2" color="text.secondary">
						{I18n.t("panel.frischwasser.wasch-zyklen.label")}
					</Typography>
					<Typography variant="body2">
						{[
							counter != null ? String(counter) : null,
							washes != null ? `~${washes}` : null,
						]
							.filter(Boolean)
							.join(" / ")}
					</Typography>
				</Stack>
			) : null}

			{low ? <Alert severity="warning">{I18n.t("panel.frischwasser.tank-leer")}</Alert> : null}
		</PanelSection>
	);
}
