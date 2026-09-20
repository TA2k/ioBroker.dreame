/**
 * The cleaning sequence: turn editing on, then tap rooms on the map.
 *
 * This panel is only the switch and the summary - the editing itself happens on the map, because
 * the order is spatial and a list of room names beside a map is a second thing to keep in
 * agreement with the first.
 *
 * ## Why the state goes out and comes back
 *
 * A tap writes the new order to `remote.cleaning-sequence.order` and changes nothing locally. The
 * numbers on the map move when the adapter sends the order back. That round trip is the point:
 * the same state can be written by a script or by a second browser tab, and an optimistic local
 * copy would disagree with both.
 */

import type React from "react";
import { Button, FormControlLabel, Stack, Switch, Typography } from "@mui/material";
import { I18n } from "@iobroker/gui-components";

import { PanelSection, useCommandRunner } from "./PanelSection";
import type { DeviceCommands } from "../commands/commands";

export interface SequencePanelProps {
	/** Room ids in cleaning order, as the adapter reports them. */
	order: readonly number[];
	/** Whether tapping rooms on the map currently edits the sequence. */
	editing: boolean;
	onEditingChange: (editing: boolean) => void;
	commands: DeviceCommands;
}

export function SequencePanel({
	order,
	editing,
	onEditingChange,
	commands,
}: SequencePanelProps): React.JSX.Element {
	const { run, failureElement } = useCommandRunner();

	return (
		<PanelSection title={I18n.t("tab.sequence.titel")}>
			<FormControlLabel
				control={
					<Switch size="small" checked={editing} onChange={event => onEditingChange(event.target.checked)} />
				}
				label={<Typography variant="body2">{I18n.t("tab.sequence.bearbeiten")}</Typography>}
			/>

			<Typography variant="body2" color="text.secondary">
				{order.length === 0
					? I18n.t("tab.sequence.leer")
					: I18n.t("tab.sequence.anzahl", String(order.length))}
			</Typography>

			{editing ? (
				<Stack direction="row" spacing={1}>
					<Button size="small" variant="outlined" disabled={order.length === 0} onClick={run(() => commands.clearSequence())}>
						{I18n.t("tab.sequence.zuruecksetzen")}
					</Button>
				</Stack>
			) : null}

			{failureElement}
		</PanelSection>
	);
}
