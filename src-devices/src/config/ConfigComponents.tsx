/**
 * The tile's robot and floor fields, as json-config custom components.
 *
 * The devices app renders a tile's settings with json-config, whose `custom` field loads its
 * component from a remote - this bundle, exposed as `./ConfigComponents`. The component is
 * handed json-config's field props and has to do three things a built-in field gets from its
 * base class: lay itself out in the form's grid, print its own label and help, and hide itself.
 * json-config evaluates `hidden` only for its own field types, not for custom ones.
 */

import type React from "react";
import { useMemo } from "react";
import { Grid } from "@mui/material";
import { I18n } from "@iobroker/gui-components";
import type { Connection } from "@iobroker/gui-components";

import { SocketConnection } from "@dreame/connection/SocketConnection";
import { RobotSelect, FloorSelect } from "@dreame/widgets/settings/SettingsSelect";
import { resolveTileContent } from "@dreame/widgets/tileContent";
import type { TileContent, TileSize } from "@dreame/widgets/tileContent";

/** The part of json-config's field props these fields use. */
interface ConfigFieldProps {
	oContext: { socket: Connection };
	/** Every setting of the tile, not only this field's. */
	data: Record<string, unknown>;
	attr?: string;
	schema: { label?: string; help?: string };
	/** Takes the whole settings object, as json-config's own fields hand it on. */
	onChange: (data: Record<string, unknown>) => void;
}

function useConnection(socket: Connection): SocketConnection {
	return useMemo(() => new SocketConnection(socket), [socket]);
}

function text(key: string | undefined): string | undefined {
	return key ? I18n.t(key) : undefined;
}

function stringSetting(data: Record<string, unknown>, key: string): string {
	const value = data[key];
	return typeof value === "string" ? value : "";
}

function DeviceField({ oContext, data, attr = "device", schema, onChange }: ConfigFieldProps): React.JSX.Element {
	const connection = useConnection(oContext.socket);
	const value = stringSetting(data, attr);

	return (
		<Grid size={{ xs: 12 }}>
			<RobotSelect
				connection={connection}
				value={value}
				// A floor belongs to one robot; kept across a change of robot, it would point at a map
				// the new one does not have.
				onChange={device => device !== value && onChange({ ...data, [attr]: device, floor: "" })}
				automaticLabel={I18n.t("dreame_device_auto")}
				label={text(schema.label)}
				helperText={text(schema.help)}
			/>
		</Grid>
	);
}

function FloorField({ oContext, data, attr = "floor", schema, onChange }: ConfigFieldProps): React.JSX.Element | null {
	const connection = useConnection(oContext.socket);

	// Only where the tile can end up showing the map - the same rule the tile itself follows.
	const content = resolveTileContent(data.content as TileContent | undefined, data.size as TileSize | undefined);
	if (content !== "map") return null;

	return (
		<Grid size={{ xs: 12 }}>
			<FloorSelect
				connection={connection}
				device={stringSetting(data, "device")}
				value={stringSetting(data, attr)}
				onChange={floor => onChange({ ...data, [attr]: floor })}
				followLabel={I18n.t("dreame_floor_follow")}
				label={text(schema.label)}
				helperText={text(schema.help)}
			/>
		</Grid>
	);
}

export default { DeviceField, FloorField };
