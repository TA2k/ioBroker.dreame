/**
 * The admin tab's body: a device switcher, and the full view of the chosen device.
 *
 * Everything below the switcher is {@link DreameView}, the same component the devices and vis-2
 * widgets open. What is left here is only what is particular to the tab - that it can show any of
 * the instance's robots, where a widget is configured for one.
 */

import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { CircularProgress, Typography } from "@mui/material";

import { DeviceList } from "../devices/deviceList";
import type { DeviceListSnapshot } from "../devices/deviceList";
import type { TabConnection } from "../connection/types";
import { Centre } from "./Centre";
import { DeviceSelector } from "./DeviceSelector";
import { DreameView } from "./DreameView";
import type { DreameViewProps } from "./DreameView";
import type { ConfigDelta } from "../settings/widgetConfig";

export interface DeviceWorkspaceProps {
	connection: TabConnection;
	instanceId: string;
	/** Device named in the tab's URL, or null. */
	requestedDid: string | null;
	/** Shown when the adapter reports no devices at all. */
	emptyMessage: React.ReactNode;
	/** Passed on to the view; see `DreameViewProps`. */
	settingsMode?: DreameViewProps["settingsMode"];
	showGear?: boolean;
	configDelta?: ConfigDelta | null;
}

export function DeviceWorkspace({
	connection,
	instanceId,
	requestedDid,
	emptyMessage,
	settingsMode,
	showGear,
	configDelta,
}: DeviceWorkspaceProps): React.JSX.Element {
	const [snapshot, setSnapshot] = useState<DeviceListSnapshot>({ devices: [], selected: null });
	const [listReady, setListReady] = useState(false);

	const deviceList = useMemo(
		() => new DeviceList(connection, instanceId, requestedDid),
		[connection, instanceId, requestedDid],
	);

	useEffect(() => {
		let cancelled = false;

		const unsubscribe = deviceList.onChange(next => {
			if (!cancelled) setSnapshot(next);
		});

		void deviceList.start().then(initial => {
			if (cancelled) return;
			setSnapshot(initial);
			setListReady(true);
		});

		return () => {
			cancelled = true;
			unsubscribe();
			deviceList.stop();
		};
	}, [deviceList]);

	if (!listReady) {
		return (
			<Centre>
				<CircularProgress />
			</Centre>
		);
	}

	const selected = snapshot.selected;
	if (snapshot.devices.length === 0 || !selected) {
		return <Centre>{emptyMessage}</Centre>;
	}

	return (
		<DreameView
			// Keyed on the device, so switching robots starts the view fresh - 2D, following the
			// robot - rather than carrying one robot's chosen floor over to another's map.
			key={selected.did}
			connection={connection}
			instanceId={instanceId}
			did={selected.did}
			settingsMode={settingsMode}
			showGear={showGear}
			configDelta={configDelta}
			headerStart={
				<>
					<DeviceSelector devices={snapshot.devices} selected={selected} onSelect={did => deviceList.select(did)} />
					<Typography variant="h6">{selected.name}</Typography>
				</>
			}
		/>
	);
}
