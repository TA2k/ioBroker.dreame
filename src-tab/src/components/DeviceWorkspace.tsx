/**
 * Everything below the admin's chrome: the device switcher and the selected device's map.
 *
 * Kept separate from `App` because `App` is a class component tied to `GenericApp`, and the state
 * this needs - a device list that updates itself, a map that decodes asynchronously - is far
 * easier to express with hooks. `App` supplies the connection and stays out of the way.
 */

import type React from "react";
import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import {
	Alert,
	Box,
	Chip,
	CircularProgress,
	Stack,
	ToggleButton,
	ToggleButtonGroup,
	Typography,
} from "@mui/material";
import { I18n } from "@iobroker/gui-components";

import { DeviceList } from "../devices/deviceList";
import type { DeviceListSnapshot } from "../devices/deviceList";
import type { TabConnection } from "../connection/types";
import { useMapPackage } from "../map/useMapPackage";
import { useStates } from "../connection/useStates";
import { parseOrder, toggleRoom } from "../panels/sequence";
import { clusterRooms, collectRooms, labelRooms } from "../map/rooms";
import { DeviceSelector } from "./DeviceSelector";
import { MapView } from "./MapView";

/**
 * Loaded only when somebody switches to 3D.
 *
 * three.js is about half a megabyte, and the tab is opened far more often for the 2D map than
 * for the 3D one. Bundled, every admin session would download it to look at a floor plan;
 * imported like this, Vite puts it in a chunk of its own that is fetched on the first switch and
 * cached afterwards.
 */
const Map3DView = lazy(async () => ({ default: (await import("./Map3DView")).Map3DView }));
import { Sidebar } from "./Sidebar";
import { useDeviceStatus } from "../status/useDeviceStatus";
import { DeviceCommands } from "../commands/commands";

/**
 * Rooms smaller than this are neither labelled nor counted as a block.
 *
 * At 50 mm per cell this is about a quarter of a square metre - below that a segment is a speck
 * of live-scan noise, and letting one count as a block would report a second floor that is really
 * four stray cells.
 */
const MIN_LABELLED_CELLS = 100;

export interface DeviceWorkspaceProps {
	connection: TabConnection;
	instanceId: string;
	/** Device named in the tab's URL, or null. */
	requestedDid: string | null;
	/** Shown when the adapter reports no devices at all. */
	emptyMessage: React.ReactNode;
}

export function DeviceWorkspace({
	connection,
	instanceId,
	requestedDid,
	emptyMessage,
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

	const did = snapshot.selected?.did ?? null;
	const { map, loading, error } = useMapPackage(connection, instanceId, did);

	// Computed here rather than inside the map view: the block count below needs the same list, and
	// deriving it twice would let the labels and the count disagree about what a room is.
	const rooms = useMemo(
		() => (map ? labelRooms(collectRooms(map, { minCells: MIN_LABELLED_CELLS }), (key, ...args) => I18n.t(key, ...args)) : []),
		[map],
	);
	const clusters = useMemo(() => clusterRooms(rooms), [rooms]);

	const status = useDeviceStatus(connection, instanceId, did);

	// The sequence lives here rather than in either child: the map edits it and the sidebar shows
	// it, so neither owns it.
	const sequenceOrderId = did ? `${instanceId}.${did}.remote.cleaning-sequence.order` : null;
	const sequenceValues = useStates(connection, sequenceOrderId ? [sequenceOrderId] : []);
	const sequenceOrder = useMemo(
		() => (sequenceOrderId ? parseOrder(sequenceValues[sequenceOrderId]) : []),
		[sequenceValues, sequenceOrderId],
	);
	const [editingSequence, setEditingSequence] = useState(false);
	// 2D stays the default: it is the view that supports tapping rooms, and the one that works
	// without a GPU.
	const [threeD, setThreeD] = useState(false);
	// Rebuilt only when the device changes, so the buttons do not hand a stale device id to a
	// command after a switch.
	const commands = useMemo(
		() => (did ? new DeviceCommands(connection, instanceId, did) : null),
		[connection, instanceId, did],
	);

	if (!listReady) {
		return (
			<Centre>
				<CircularProgress />
			</Centre>
		);
	}

	if (snapshot.devices.length === 0) {
		return <Centre>{emptyMessage}</Centre>;
	}

	return (
		<Stack sx={{ width: "100%", height: "100%", overflow: "hidden" }}>
			<Box sx={{ p: 1, display: "flex", alignItems: "center", gap: 2, flex: "0 0 auto" }}>
				<DeviceSelector
					devices={snapshot.devices}
					selected={snapshot.selected}
					onSelect={did => deviceList.select(did)}
				/>
				<Typography variant="h6">{snapshot.selected?.name}</Typography>

				{/*
				 * 2D and 3D are two views of one map, not two pages, so a toggle rather than tabs.
				 * Only 2D takes room taps, so switching to 3D leaves sequence editing behind - which
				 * is why the toggle sits next to the device name and not in the sidebar.
				 */}
				<ToggleButtonGroup
					size="small"
					exclusive
					value={threeD ? "3d" : "2d"}
					onChange={(_event, value) => {
						// null arrives when the active button is pressed again; keeping the current
						// view is better than ending up with neither selected.
						if (value) setThreeD(value === "3d");
					}}
				>
					<ToggleButton value="2d">{I18n.t("tab.ansicht.2d")}</ToggleButton>
					<ToggleButton value="3d">{I18n.t("tab.ansicht.3d")}</ToggleButton>
				</ToggleButtonGroup>

				{clusters.length > 1 ? (
					// Worth saying out loud: a raster holding several blocks far apart is showing more than
					// one stored map at once, which looks like a duplicated home rather than a bug in the
					// drawing. The count tells the user what they are looking at.
					<Chip
						size="small"
						color="warning"
						variant="outlined"
						label={I18n.t("tab.multipleBlocks", String(clusters.length))}
					/>
				) : null}
			</Box>

			{/*
			 * Map first in the source, sidebar second, and the row wraps to a column on a narrow
			 * window: an admin tab is opened on laptops and on phones, and the map is what the page
			 * is for, so it keeps the space and the controls move below it rather than squeezing it.
			 */}
			<Box
				sx={{
					flex: "1 1 auto",
					minHeight: 0,
					display: "flex",
					flexDirection: { xs: "column", md: "row" },
					gap: 1,
					p: 1,
				}}
			>
				<Box sx={{ flex: "1 1 auto", minHeight: 0, minWidth: 0, position: "relative" }}>
					{loading ? (
						<Centre>
							<CircularProgress />
						</Centre>
					) : error ? (
						<Centre>
							<Alert severity="error">
								{I18n.t("tab.mapError")}: {error}
							</Alert>
						</Centre>
					) : !map ? (
						<Centre>
							<Typography color="text.secondary">{I18n.t("tab.noMap")}</Typography>
						</Centre>
					) : threeD ? (
						<Suspense
							fallback={
								<Centre>
									<CircularProgress />
								</Centre>
							}
						>
							<Map3DView map={map} rooms={rooms} />
						</Suspense>
					) : (
						<MapView
							map={map}
							rooms={rooms}
							sequenceOrder={sequenceOrder}
							onRoomClick={
								editingSequence && commands
									? roomId => {
											// Writes the next order and waits for it to come back; nothing
											// local changes, so the map can never show an order the adapter
											// does not have.
											void commands.setSequenceOrder(toggleRoom(sequenceOrder, roomId));
										}
									: undefined
							}
						/>
					)}
				</Box>

				{did && commands ? (
					<Box sx={{ flex: "0 0 auto", minHeight: 0 }}>
						<Sidebar
							connection={connection}
							instanceId={instanceId}
							did={did}
							status={status}
							commands={commands}
							sequenceOrder={sequenceOrder}
							editingSequence={editingSequence}
							onEditingSequenceChange={setEditingSequence}
						/>
					</Box>
				) : null}
			</Box>
		</Stack>
	);
}

/** Centres a single child in the space it is given. */
function Centre({ children }: { children: React.ReactNode }): React.JSX.Element {
	return (
		<Box
			sx={{
				width: "100%",
				height: "100%",
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
			}}
		>
			{children}
		</Box>
	);
}
