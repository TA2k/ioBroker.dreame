/**
 * The schedules set up in the app, each with a switch.
 *
 * The switch is the only thing editable here. Creating and editing a schedule means choosing
 * rooms, modes and repeat counts, which is the app's job; turning one off for a week is the thing
 * one actually wants from a dashboard.
 *
 * A schedule pointing at a shortcut that no longer exists is shown with its switch locked. The
 * adapter marks it `orphan`, and enabling it would arm a schedule that cannot run - the widget
 * makes the same choice, so that neither view quietly offers the same dead switch.
 */

import type React from "react";
import { Chip, Stack, Switch, Typography } from "@mui/material";
import { I18n } from "@iobroker/gui-components";

import { PanelSection, useCommandRunner } from "./PanelSection";
import { useStatesByPattern } from "../connection/useStates";
import { formatSettings, parseSchedules, scheduleKind } from "../panels/schedules";
import type { Schedule } from "../panels/schedules";
import { parseShortcuts, shortcutName } from "../panels/shortcuts";
import type { Shortcut } from "../panels/shortcuts";
import type { TabConnection } from "../connection/types";
import type { DeviceCommands } from "../commands/commands";

export interface SchedulesPanelProps {
	connection: TabConnection;
	instanceId: string;
	did: string;
	commands: DeviceCommands;
}

export function SchedulesPanel({
	connection,
	instanceId,
	did,
	commands,
}: SchedulesPanelProps): React.JSX.Element | null {
	const schedulePrefix = `${instanceId}.${did}.schedule.`;
	const shortcutPrefix = `${instanceId}.${did}.shortcuts.`;

	const scheduleValues = useStatesByPattern(connection, `${schedulePrefix}*`);
	// Read as well as the schedules: a shortcut schedule shows the shortcut's name, and the id on
	// its own says nothing to anybody.
	const shortcutValues = useStatesByPattern(connection, `${shortcutPrefix}*`);
	const { run, failureElement } = useCommandRunner();

	const schedules = parseSchedules(scheduleValues, schedulePrefix);
	const shortcuts = parseShortcuts(shortcutValues, shortcutPrefix);

	if (schedules.length === 0) return null;

	return (
		<PanelSection title={I18n.t("termine.titel")}>
			<Stack spacing={1.5}>
				{schedules.map(schedule => (
					<ScheduleRow
						key={schedule.id}
						schedule={schedule}
						shortcuts={shortcuts}
						onToggle={enabled => run(() => commands.setScheduleEnabled(schedule.id, enabled))()}
					/>
				))}
			</Stack>

			{failureElement}
		</PanelSection>
	);
}

function ScheduleRow({
	schedule,
	shortcuts,
	onToggle,
}: {
	schedule: Schedule;
	shortcuts: readonly Shortcut[];
	onToggle: (enabled: boolean) => void;
}): React.JSX.Element {
	const kind = scheduleKind(schedule);
	const locked = kind === "shortcut" && schedule.orphan;

	return (
		<Stack spacing={0.25}>
			<Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
				<Typography variant="body2" sx={{ fontWeight: 600, minWidth: "3.5em" }}>
					{schedule.time}
				</Typography>
				<Typography variant="body2" color="text.secondary" sx={{ flex: "1 1 auto", minWidth: 0 }}>
					{schedule.weekdays}
					{/* Shown as the adapter wrote it, already in its language; only never branched on. */}
					{schedule.typeText ? ` · ${schedule.typeText}` : ""}
				</Typography>
				<Switch
					size="small"
					checked={schedule.enabled}
					disabled={locked}
					onChange={event => onToggle(event.target.checked)}
					slotProps={{ input: { "aria-label": `${schedule.time} ${schedule.weekdays}` } }}
				/>
			</Stack>

			<ScheduleDetails schedule={schedule} shortcuts={shortcuts} />

			{locked ? (
				<Chip size="small" color="warning" variant="outlined" label={I18n.t("termine.verwaist")} />
			) : null}
		</Stack>
	);
}

function ScheduleDetails({
	schedule,
	shortcuts,
}: {
	schedule: Schedule;
	shortcuts: readonly Shortcut[];
}): React.JSX.Element | null {
	const translate = (key: string): string => I18n.t(key);

	switch (scheduleKind(schedule)) {
		case "rooms":
			return (
				<Stack spacing={0}>
					{schedule.rooms!.map((room, index) => (
						<Typography key={index} variant="caption" color="text.secondary">
							{room.roomName ?? "?"} · {formatSettings(room, translate)}
						</Typography>
					))}
				</Stack>
			);

		case "all_rooms":
			return (
				<Typography variant="caption" color="text.secondary">
					{formatSettings(schedule.parameters!, translate)}
				</Typography>
			);

		case "shortcut": {
			const name = shortcutName(shortcuts, schedule.shortcutId!);
			return (
				<Typography variant="caption" color="text.secondary">
					{name ?? `#${schedule.shortcutId}`}
				</Typography>
			);
		}

		default:
			// The adapter created none of the three field groups; nothing reliable to show.
			return null;
	}
}
