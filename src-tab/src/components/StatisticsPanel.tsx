/**
 * Lifetime totals: how often, how much, how long, and since when.
 *
 * Read-only, and a figure the device does not report is left out rather than shown as zero - a
 * robot that has never been asked for its totals is not a robot that has cleaned nothing.
 */

import type React from "react";
import { Stack, Typography } from "@mui/material";
import { I18n } from "@iobroker/gui-components";

import { PanelSection } from "./PanelSection";
import { asNumber, useStates } from "../connection/useStates";
import { STATISTICS } from "../panels/statistics";
import type { TabConnection } from "../connection/types";

export interface StatisticsPanelProps {
	connection: TabConnection;
	instanceId: string;
	did: string;
}

export function StatisticsPanel({
	connection,
	instanceId,
	did,
}: StatisticsPanelProps): React.JSX.Element | null {
	const prefix = `${instanceId}.${did}.status.`;
	const values = useStates(
		connection,
		STATISTICS.map(entry => prefix + entry.state),
	);

	// The admin's language decides how numbers and dates are grouped, not the browser's: the user
	// picked one in ioBroker and expects the page to use it throughout.
	const locale = I18n.getLanguage();

	const rows = STATISTICS.map(entry => ({
		entry,
		value: asNumber(values[prefix + entry.state]),
	})).filter(row => row.value != null);

	if (rows.length === 0) return null;

	return (
		<PanelSection title={I18n.t("panel.statistik.titel")}>
			{rows.map(({ entry, value }) => (
				<Stack key={entry.state} direction="row" spacing={1} sx={{ justifyContent: "space-between" }}>
					<Typography variant="body2" color="text.secondary">
						{I18n.t(entry.nameKey)}
					</Typography>
					<Typography variant="body2">{entry.format(value!, locale)}</Typography>
				</Stack>
			))}
		</PanelSection>
	);
}
