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
import { Box, Stack } from "@mui/material";

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
import type { RoomSelection } from "../panels/useRoomSelection";
import { hiddenFields, panelVisible } from "../settings/widgetConfig";
import type { PanelId, WidgetConfig } from "../settings/widgetConfig";

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
	/** Rooms picked on the map, owned by the workspace for the same reason as the sequence. */
	selection: RoomSelection;
	onClearSequence: () => Promise<void>;
	/** Which panels and rows show; see `settings/widgetConfig.ts`. */
	config: WidgetConfig;
	/** `vacuum` or `mower`; a mower has no use for several panels. */
	robotType: string | null;
	/** The settings are open: hidden shortcuts show, with the eye to bring them back. */
	editingSettings: boolean;
	onToggleShortcut: (shortcutId: string) => void;
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
	selection,
	onClearSequence,
	config,
	robotType,
	editingSettings,
	onToggleShortcut,
}: SidebarProps): React.JSX.Element {
	const shared = { connection, instanceId, did };
	const show = (id: PanelId): boolean => panelVisible(config, id, robotType);
	const hidden = (id: PanelId): ReadonlySet<string> => hiddenFields(config, id);

	return (
		<Box sx={{ width: "100%", px: 2, pb: 2 }}>
			{/*
			 * Lines between the panels drawn in CSS rather than with Stack's `divider`: several panels
			 * render nothing when they have nothing to show, and Stack would still put a divider on
			 * either side of each, stacking up empty lines. CSS only sees what was actually drawn.
			 */}
			<Stack sx={{ "& > * + *": { borderTop: 1, borderColor: "divider" } }}>
				{/* Faults first: the panel is empty unless something is wrong, so it costs nothing
				    when all is well and is impossible to miss when it is not. */}
				<ErrorsPanel {...shared} />
				<StatusPanel status={status} commands={commands} selection={selection} />
				{show("reinigung") ? (
					<CleaningPanel
						{...shared}
						commands={commands}
						status={status}
						selection={selection}
						hidden={hidden("reinigung")}
					/>
				) : null}
				{show("sequence") ? (
					<SequencePanel
						order={sequenceOrder}
						editing={editingSequence}
						onEditingChange={onEditingSequenceChange}
						selected={selection.selected}
						onClear={onClearSequence}
					/>
				) : null}
				{show("station") ? <StationPanel status={status} commands={commands} hidden={hidden("station")} /> : null}
				{show("frischwasser") ? <WaterPanel {...shared} commands={commands} hidden={hidden("frischwasser")} /> : null}
				{show("shortcuts") ? (
					<ShortcutsPanel
						{...shared}
						commands={commands}
						hidden={hidden("shortcuts")}
						editing={editingSettings}
						onToggleHidden={onToggleShortcut}
					/>
				) : null}
				{show("termine") ? <SchedulesPanel {...shared} commands={commands} /> : null}
				{show("wartung") ? <MaintenancePanel {...shared} commands={commands} hidden={hidden("wartung")} /> : null}
				{show("statistik") ? <StatisticsPanel {...shared} hidden={hidden("statistik")} /> : null}
			</Stack>
		</Box>
	);
}
