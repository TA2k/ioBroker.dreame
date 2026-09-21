/**
 * The column of panels beside the map.
 *
 * Order follows the widget's, which follows how often each is reached for: what the robot is
 * doing now, what to tell it to do, the station, water, wear, totals.
 *
 * Several panels return null where the device reports nothing for them, so a mower or a basic
 * model shows a shorter column rather than a list of empty headings. That decision sits in each
 * panel, which knows what "nothing" means for its own states, rather than here.
 */

import type React from "react";
import { Box, Divider, Stack } from "@mui/material";

import { ErrorsPanel } from "./ErrorsPanel";
import { StatusPanel } from "./StatusPanel";
import { SequencePanel } from "./SequencePanel";
import { CleaningPanel } from "./CleaningPanel";
import { StationPanel } from "./StationPanel";
import { WaterPanel } from "./WaterPanel";
import { MaintenancePanel } from "./MaintenancePanel";
import { ShortcutsPanel } from "./ShortcutsPanel";
import { SchedulesPanel } from "./SchedulesPanel";
import { StatisticsPanel } from "./StatisticsPanel";
import type { DeviceStatus } from "../status/useDeviceStatus";
import type { TabConnection } from "../connection/types";
import type { DeviceCommands } from "../commands/commands";

export interface SidebarProps {
	connection: TabConnection;
	instanceId: string;
	did: string;
	status: DeviceStatus;
	commands: DeviceCommands;
	/** Cleaning order, owned by the workspace because the map edits it and this shows it. */
	sequenceOrder: readonly number[];
	editingSequence: boolean;
	onEditingSequenceChange: (editing: boolean) => void;
}

export function Sidebar({
	connection,
	instanceId,
	did,
	status,
	commands,
	sequenceOrder,
	editingSequence,
	onEditingSequenceChange,
}: SidebarProps): React.JSX.Element {
	const shared = { connection, instanceId, did };

	return (
		<Box sx={{ width: "100%", px: 2, pb: 2 }}>
			<Stack divider={<Divider flexItem />}>
				{/* Faults first: the panel is empty unless something is wrong, so it costs nothing
				    when all is well and is impossible to miss when it is not. */}
				<ErrorsPanel {...shared} />
				<StatusPanel status={status} commands={commands} />
				<CleaningPanel {...shared} commands={commands} />
				<SequencePanel
					order={sequenceOrder}
					editing={editingSequence}
					onEditingChange={onEditingSequenceChange}
					commands={commands}
				/>
				<StationPanel {...shared} commands={commands} />
				<WaterPanel {...shared} />
				<ShortcutsPanel {...shared} commands={commands} />
				<SchedulesPanel {...shared} commands={commands} />
				<MaintenancePanel {...shared} commands={commands} />
				<StatisticsPanel {...shared} />
			</Stack>
		</Box>
	);
}
