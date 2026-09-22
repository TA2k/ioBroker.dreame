/**
 * Whether the adapter is connected to the Dreame cloud: live, offline, or not known yet.
 *
 * The adapter's own `info.connection`, not the browser's socket - a page talking to ioBroker says
 * nothing about whether ioBroker is talking to the robot. The widget showed the same, beside its
 * gear.
 */

import type React from "react";
import { Chip } from "@mui/material";
import { FiberManualRecord as DotIcon } from "@mui/icons-material";
import { I18n } from "@iobroker/gui-components";

import { useStates } from "../connection/useStates";
import type { TabConnection } from "../connection/types";

export function ConnectionChip({
	connection,
	instanceId,
}: {
	connection: TabConnection;
	instanceId: string;
}): React.JSX.Element {
	const id = `${instanceId}.info.connection`;
	const value = useStates(connection, [id])[id];
	const known = value !== undefined && value !== null;
	const live = value === true || value === "true";

	return (
		<Chip
			size="small"
			variant="outlined"
			color={!known ? "warning" : live ? "success" : "error"}
			icon={<DotIcon />}
			label={I18n.t(!known ? "tab.verbindung.verbindet" : live ? "tab.verbindung.live" : "tab.verbindung.offline")}
		/>
	);
}
