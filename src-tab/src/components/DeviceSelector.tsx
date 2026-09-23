/**
 * The device switcher in the tab's header.
 *
 * Renders nothing at all for a single device: a select with one option is furniture, not a
 * control, and most installations have exactly one robot. This mirrors what the existing widget
 * does (`renderGeraeteAuswahl` in `www/js/main.js`).
 */

import type React from "react";
import { MenuItem, TextField } from "@mui/material";
import { I18n } from "@iobroker/gui-components";
import type { DreameDevice } from "../devices/deviceList";

export interface DeviceSelectorProps {
	devices: DreameDevice[];
	selected: DreameDevice | null;
	onSelect: (did: string) => void;
}

export function DeviceSelector({ devices, selected, onSelect }: DeviceSelectorProps): React.JSX.Element | null {
	if (devices.length < 2 || !selected) return null;

	return (
		<TextField
			select
			size="small"
			variant="outlined"
			label={I18n.t("tab.device")}
			value={selected.did}
			onChange={event => onSelect(event.target.value)}
			sx={{ minWidth: 220 }}
		>
			{devices.map(device => (
				<MenuItem key={device.did} value={device.did}>
					{device.name}
				</MenuItem>
			))}
		</TextField>
	);
}
