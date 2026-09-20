/**
 * Faults and warnings the robot is reporting.
 *
 * Nothing at all is rendered when there is nothing wrong, rather than a reassuring "no errors"
 * line. A panel that is usually empty and occasionally not is read at a glance; one that always
 * says something has to be read properly every time to find out which.
 *
 * Placed at the top of the sidebar by {@link Sidebar} for the same reason.
 */

import type React from "react";
import { Alert, Stack } from "@mui/material";
import { I18n } from "@iobroker/gui-components";

import { asNumber, useStates } from "../connection/useStates";
import { MESSAGE_STATES, collectMessages } from "../panels/errors";
import type { TabConnection } from "../connection/types";

export interface ErrorsPanelProps {
	connection: TabConnection;
	instanceId: string;
	did: string;
}

export function ErrorsPanel({ connection, instanceId, did }: ErrorsPanelProps): React.JSX.Element | null {
	const prefix = `${instanceId}.${did}.status.`;

	// The two context states are read here rather than borrowed from the header: coupling two
	// panels together for two of a dozen fields costs more than reading them twice.
	const chargingId = `${prefix}charging-status`;
	const washId = `${prefix}self-wash-base-status`;

	const values = useStates(connection, [
		...MESSAGE_STATES.map(state => prefix + state),
		chargingId,
		washId,
	]);

	const byState: Record<string, number | null> = {};
	for (const state of MESSAGE_STATES) byState[state] = asNumber(values[prefix + state]);

	const messages = collectMessages(byState, {
		charging: asNumber(values[chargingId]),
		wash: asNumber(values[washId]),
	});

	if (messages.length === 0) return null;

	return (
		<Stack spacing={1} sx={{ py: 1 }}>
			{messages.map(message => (
				<Alert key={message.source} severity={message.severe ? "error" : "warning"}>
					{message.textKey
						? I18n.t(message.textKey)
						: `${I18n.t("panel.fehler.unbekannter-code-praefix")} ${message.unknownCode}`}
				</Alert>
			))}
		</Stack>
	);
}
