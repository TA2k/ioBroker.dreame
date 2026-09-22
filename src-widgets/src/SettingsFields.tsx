/**
 * The widget's robot and floor fields in the vis-2 editor.
 *
 * vis-2 labels each field in a column of its own, so these draw only the list. The words come
 * from this widget set's translations, which vis-2 registers under the `dreame_` prefix.
 */

import type React from "react";
import { useMemo } from "react";
import { I18n } from "@iobroker/gui-components";
import type { Connection } from "@iobroker/gui-components";

import { SocketConnection } from "@dreame/connection/SocketConnection";
import { RobotSelect, FloorSelect } from "@dreame/widgets/settings/SettingsSelect";

interface FieldProps {
	socket: Connection;
	value: string;
	onChange: (value: string) => void;
}

function useConnection(socket: Connection): SocketConnection {
	return useMemo(() => new SocketConnection(socket), [socket]);
}

export function RobotField({ socket, value, onChange }: FieldProps): React.JSX.Element {
	const connection = useConnection(socket);
	return (
		<RobotSelect
			connection={connection}
			value={value}
			onChange={onChange}
			automaticLabel={I18n.t("dreame_device_auto")}
		/>
	);
}

export function FloorField({ socket, device, value, onChange }: FieldProps & { device: string }): React.JSX.Element {
	const connection = useConnection(socket);
	return (
		<FloorSelect
			connection={connection}
			device={device}
			value={value}
			onChange={onChange}
			followLabel={I18n.t("dreame_floor_follow")}
		/>
	);
}
