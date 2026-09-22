/**
 * Picks the floor to show: the one the robot is on, or a stored one.
 *
 * Renders nothing for a device with fewer than two stored floors. With one floor, "follow the
 * robot" and "that floor" are the same thing, and a select offering the same choice twice is a
 * control that does nothing.
 */

import type React from "react";
import { MenuItem, TextField } from "@mui/material";
import { I18n } from "@iobroker/gui-components";

import { LIVE_FLOOR } from "../floors/floors";
import type { Floor } from "../floors/floors";

export interface FloorSelectorProps {
	floors: readonly Floor[];
	/** {@link LIVE_FLOOR} or a floor id. */
	value: string;
	onChange: (value: string) => void;
	/** Map id of the live package, to mark which floor the robot is on. */
	liveMapId: number | null;
}

export function FloorSelector({ floors, value, onChange, liveMapId }: FloorSelectorProps): React.JSX.Element | null {
	if (floors.length < 2) return null;

	// A pinned floor that has since been deleted in the app falls back to following the robot,
	// rather than leaving the select blank on a value it cannot show.
	const current = value === LIVE_FLOOR || floors.some(floor => floor.id === value) ? value : LIVE_FLOOR;

	return (
		<TextField
			select
			size="small"
			label={I18n.t("tab.floor.label")}
			value={current}
			onChange={event => onChange(event.target.value)}
			sx={{ minWidth: 180 }}
		>
			<MenuItem value={LIVE_FLOOR}>{I18n.t("tab.floor.live")}</MenuItem>
			{floors.map(floor => (
				<MenuItem key={floor.id} value={floor.id}>
					{floor.name}
					{liveMapId != null && String(liveMapId) === floor.id ? ` • ${I18n.t("tab.floor.roboterHier")}` : ""}
				</MenuItem>
			))}
		</TextField>
	);
}
