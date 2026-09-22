/**
 * The full view of one robot: map, 2D/3D, floor, and every panel.
 *
 * ## Why this is its own component
 *
 * It is shown in four places - the admin tab, the dialog a devices tile opens, the dialog a vis-2
 * widget opens, and inline inside a vis-2 widget - and each of those is a different host with a
 * different socket and a different amount of room. This component knows none of that: it takes a
 * connection and a device, and fills whatever box it is put in.
 *
 * ## Responsive by container, not by screen
 *
 * The layout switches between side-by-side and stacked on the width of its **own box**, through a
 * CSS container query, rather than on the width of the window. A vis-2 widget 600 px wide on a
 * 2560 px monitor is a small space, and a breakpoint on the viewport would give it the wide layout
 * it has no room for. The same goes for a dialog on a phone turned sideways.
 */

import type React from "react";
import { Suspense, lazy, useMemo, useState } from "react";
import {
	Alert,
	Box,
	Chip,
	CircularProgress,
	IconButton,
	ThemeProvider,
	ToggleButton,
	ToggleButtonGroup,
	Tooltip,
	Typography,
} from "@mui/material";
import { Settings as SettingsIcon } from "@mui/icons-material";
import { I18n } from "@iobroker/gui-components";

import { SettingsDrawer } from "./SettingsDrawer";
import { ConnectionChip } from "./ConnectionChip";
import { useWidgetConfig } from "../settings/useWidgetConfig";
import { hiddenFields, normaliseRotation, withFieldHidden } from "../settings/widgetConfig";
import type { ConfigDelta } from "../settings/widgetConfig";
import { widgetPalette } from "../settings/theme";
import { buildPageTheme } from "../settings/pageTheme";
import { useDeviceType } from "../devices/useDeviceType";

import type { TabConnection } from "../connection/types";
import { useMapPackage } from "../map/useMapPackage";
import { asNumber, useStates } from "../connection/useStates";
import { isStarted } from "../status/statusCodes";
import { modeMops, modeVacuums } from "../panels/cleaningOptions";
import type { RoomBadges } from "../map/roomBadges";
import { parseOrder, toggleRoom } from "../panels/sequence";
import { switchForRoom, useRoomSelection } from "../panels/useRoomSelection";
import { clusterRooms, collectRooms, labelRooms } from "../map/rooms";
import { useDeviceStatus } from "../status/useDeviceStatus";
import { DeviceCommands } from "../commands/commands";
import { LIVE_FLOOR, floorSource } from "../floors/floors";
import { floorPrefix, useFloors } from "../floors/useFloors";
import { Centre } from "./Centre";
import { FloorImage } from "./FloorImage";
import { FloorSelector } from "./FloorSelector";
import { MapView } from "./MapView";
import { useLivePositions } from "../map/useLivePositions";
import { markerStatusOf, robotBadge, stationBadge } from "../map/markers";
import { Sidebar } from "./Sidebar";

/**
 * Loaded only when somebody switches to 3D.
 *
 * three.js is about half a megabyte, and this view is opened far more often for the 2D map than
 * for the 3D one. Imported like this, the bundler puts it in a chunk of its own, fetched on the
 * first switch and cached afterwards - in every host this view is built into.
 */
const Map3DView = lazy(async () => ({ default: (await import("./Map3DView")).Map3DView }));

/**
 * Rooms smaller than this are neither labelled nor counted as a block.
 *
 * At 50 mm per cell this is about a quarter of a square metre - below that a segment is a speck
 * of live-scan noise, and letting one count as a block would report a second floor that is really
 * four stray cells.
 */
export const MIN_LABELLED_CELLS = 100;

/**
 * Container width at which map and panels sit side by side.
 *
 * Below it the panels go under the map. Chosen so the map keeps at least about 500 px beside the
 * 300 px panel column - narrower than that and the map is too small to tap a room on.
 */
const SIDE_BY_SIDE_MIN_WIDTH = 820;

export type MapMode = "2d" | "3d";

export interface DreameViewProps {
	connection: TabConnection;
	instanceId: string;
	did: string;
	/** Starting view. The user can switch; this only picks where they start. */
	defaultMode?: MapMode;
	/** Starting floor: {@link LIVE_FLOOR} or a floor id. */
	defaultFloor?: string;
	/**
	 * Placed at the start of the header row - the tab puts its device switcher here. Hosts that
	 * show a single, fixed device leave it out.
	 */
	headerStart?: React.ReactNode;
	/** Hides the panel column, for a host that wants the map alone. */
	hideSidebar?: boolean;
	/**
	 * `page` is the stand-alone page, which sets its own colours and whose gear can make a share
	 * link; `embedded` is any view inside a host - the admin, vis-2, a dialog - whose theme applies.
	 */
	settingsMode?: "page" | "embedded";
	/** False hides the gear - the kiosk link's `?gear=0`. The stored settings still apply. */
	showGear?: boolean;
	/** A share link's settings, laid over the stored ones; see `settings/widgetConfig.ts`. */
	configDelta?: ConfigDelta | null;
}

export function DreameView({
	connection,
	instanceId,
	did,
	defaultMode = "2d",
	defaultFloor = LIVE_FLOOR,
	headerStart,
	hideSidebar = false,
	settingsMode = "embedded",
	showGear = true,
	configDelta = null,
}: DreameViewProps): React.JSX.Element {
	const { map, loading, error } = useMapPackage(connection, instanceId, did);

	const settings = useWidgetConfig(connection, instanceId, did, configDelta);
	const layout = settings.config.layout;
	const rotation = normaliseRotation(layout.drehung);
	const [settingsOpen, setSettingsOpen] = useState(false);
	const robotType = useDeviceType(connection, instanceId, did);
	const pageTheme = useMemo(
		() => (settingsMode === "page" ? buildPageTheme(widgetPalette(layout)) : null),
		[settingsMode, layout],
	);

	// Computed here rather than inside the map view: the block count below needs the same list, and
	// deriving it twice would let the labels and the count disagree about what a room is.
	const rooms = useMemo(
		() =>
			map
				? labelRooms(collectRooms(map, { minCells: MIN_LABELLED_CELLS }), (key, ...args) => I18n.t(key, ...args))
				: [],
		[map],
	);
	const clusters = useMemo(() => clusterRooms(rooms), [rooms]);

	const status = useDeviceStatus(connection, instanceId, did);
	const live = useLivePositions(connection, instanceId, did);
	const markerStatus = markerStatusOf(status);
	const started = isStarted(asNumber(status.taskStatus), asNumber(status.robotStatus), Boolean(status.cleaningPaused));

	// The settings the room badges show.
	const modeId = `${instanceId}.${did}.remote.cleaning-mode`;
	const suctionId = `${instanceId}.${did}.remote.suction-level`;
	const wetnessId = `${instanceId}.${did}.remote.wetness-level`;
	const cleaningValues = useStates(connection, [modeId, suctionId, wetnessId]);

	// The sequence lives here rather than in either child: the map edits it and the panels show
	// it, so neither owns it.
	const sequenceOrderId = `${instanceId}.${did}.remote.cleaning-sequence.order`;
	const sequenceValues = useStates(connection, [sequenceOrderId]);
	const sequenceOrder = useMemo(() => parseOrder(sequenceValues[sequenceOrderId]), [sequenceValues, sequenceOrderId]);
	const [editingSequence, setEditingSequence] = useState(false);

	const [mode, setMode] = useState<MapMode>(defaultMode);
	const [floor, setFloor] = useState<string>(defaultFloor);
	const floors = useFloors(connection, instanceId, did);

	// Rebuilt only when the device changes, so the buttons never hand a stale device id to a
	// command after a switch.
	const commands = useMemo(() => new DeviceCommands(connection, instanceId, did), [connection, instanceId, did]);

	const liveMapId = map?.header.mapId ?? null;
	const source = floorSource(floor, liveMapId, floorPrefix(instanceId, did));

	// The rooms drawn belong to the map the robot is on, so that is the map they are picked on.
	const selection = useRoomSelection(connection, instanceId, did, liveMapId);

	// Badges on the rooms of the running job, or else on the rooms picked for the next start.
	const activeSegments = map?.meta.ha?.activeSegments;
	const roomBadges = useMemo((): RoomBadges => {
		const mode = asNumber(cleaningValues[modeId]);
		const suction = asNumber(cleaningValues[suctionId]);
		return {
			rooms: started ? new Set(activeSegments ?? []) : selection.selected,
			// The app counts suction from 1; the state from 0.
			suction: mode != null && modeVacuums(mode) && suction != null ? suction + 1 : null,
			wetness: mode != null && modeMops(mode) ? asNumber(cleaningValues[wetnessId]) : null,
		};
	}, [cleaningValues, modeId, suctionId, wetnessId, started, activeSegments, selection.selected]);

	/**
	 * A tap on a room.
	 *
	 * Normally it picks the room for the next start or drops it. While the sequence is edited it
	 * also places the room in the order or takes it out - and picks or drops it with that, since
	 * the adapter follows an order only for a pick of exactly its rooms. Either way only states
	 * are written; the map changes when they come back.
	 */
	const handleRoomClick = (roomId: number): void => {
		const roomSwitch = switchForRoom(selection, roomId);
		if (editingSequence) {
			const next = toggleRoom(sequenceOrder, roomId);
			void commands.setSequenceOrder(next).catch(() => undefined);
			if (roomSwitch) void commands.setRoomSelected(roomSwitch.stateId, next.includes(roomId)).catch(() => undefined);
			return;
		}
		if (roomSwitch) {
			void commands.setRoomSelected(roomSwitch.stateId, !selection.selected.has(roomId)).catch(() => undefined);
		}
	};

	/** Empties the order, and the pick that editing it made along the way. */
	const clearSequence = async (): Promise<void> => {
		const picked = sequenceOrder.map(roomId => switchForRoom(selection, roomId)).filter(entry => entry !== undefined);
		await commands.clearSequence();
		await Promise.all(picked.map(entry => commands.setRoomSelected(entry.stateId, false)));
	};
	// A stored floor is a flat picture; there is nothing to build 3D out of.
	const canShow3d = source.kind === "live";
	const showing3d = mode === "3d" && canShow3d;

	const renderMap = (): React.ReactNode => {
		if (source.kind === "image") return <FloorImage connection={connection} stateId={source.stateId} />;
		if (loading || source.kind === "pending") {
			return (
				<Centre>
					<CircularProgress />
				</Centre>
			);
		}
		if (error) {
			return (
				<Centre>
					<Alert severity="error">
						{I18n.t("tab.mapError")}: {error}
					</Alert>
				</Centre>
			);
		}
		if (!map) {
			return (
				<Centre>
					<Typography color="text.secondary">{I18n.t("tab.noMap")}</Typography>
				</Centre>
			);
		}
		if (showing3d) {
			return (
				<Suspense
					fallback={
						<Centre>
							<CircularProgress />
						</Centre>
					}
				>
					<Map3DView map={map} rooms={rooms} />
				</Suspense>
			);
		}
		return (
			<MapView
				map={map}
				rooms={rooms}
				sequenceOrder={sequenceOrder}
				selectedRooms={selection.selected}
				rotation={rotation}
				liveRobot={live.robot}
				liveCharger={live.charger}
				robotBadge={robotBadge(markerStatus)}
				stationBadge={stationBadge(markerStatus)}
				roomBadges={roomBadges}
				// Without switches for this map - an older adapter, a map not set up yet - a tap has
				// nothing to write outside sequence editing, and the map says so by not reacting.
				onRoomClick={editingSequence || selection.available ? handleRoomClick : undefined}
			/>
		);
	};

	const view = (
		<Box
			sx={{
				width: "100%",
				height: "100%",
				display: "flex",
				flexDirection: "column",
				overflow: "hidden",
				// See the module comment: the layout follows this box, not the window.
				containerType: "size",
				// The stand-alone page paints its own background; a host paints its own.
				...(pageTheme ? { bgcolor: "background.default", color: "text.primary" } : {}),
			}}
		>
			<Box
				sx={{
					p: 1,
					display: "flex",
					alignItems: "center",
					gap: 1.5,
					flex: "0 0 auto",
					// Wraps rather than overflowing: in a narrow widget the selectors go onto a second
					// line instead of pushing off the edge.
					flexWrap: "wrap",
				}}
			>
				{headerStart}

				{/*
				 * 2D and 3D are two views of one map, so a toggle rather than tabs. Only 2D takes room
				 * taps, and only the live floor has data for 3D - both are why the toggle sits with the
				 * floor selector and not in the panels.
				 */}
				<ToggleButtonGroup
					size="small"
					exclusive
					value={showing3d ? "3d" : "2d"}
					onChange={(_event, value: MapMode | null) => {
						// null arrives when the active button is pressed again; keeping the current view
						// beats ending up with neither selected.
						if (value) setMode(value);
					}}
				>
					<ToggleButton value="2d">{I18n.t("tab.ansicht.2d")}</ToggleButton>
					<Tooltip title={canShow3d ? "" : I18n.t("tab.floor.kein3d")}>
						{/* The span keeps the tooltip working on a disabled button, which fires no events. */}
						<span>
							<ToggleButton value="3d" disabled={!canShow3d} selected={showing3d}>
								{I18n.t("tab.ansicht.3d")}
							</ToggleButton>
						</span>
					</Tooltip>
				</ToggleButtonGroup>

				<FloorSelector floors={floors} value={floor} onChange={setFloor} liveMapId={liveMapId} />

				{clusters.length > 1 && source.kind === "live" ? (
					// A raster holding several blocks far apart is showing more than one stored map at
					// once, which looks like a duplicated home rather than a bug in the drawing.
					<Chip
						size="small"
						color="warning"
						variant="outlined"
						label={I18n.t("tab.multipleBlocks", String(clusters.length))}
					/>
				) : null}

				{/* Pushed to the end of the row, with the gear. */}
				<Box sx={{ ml: "auto", display: "flex", alignItems: "center", gap: 1 }}>
					<ConnectionChip connection={connection} instanceId={instanceId} />
					{showGear ? (
						<Tooltip title={I18n.t("tab.settings.oeffnen")}>
							<IconButton onClick={() => setSettingsOpen(true)} aria-label={I18n.t("tab.settings.oeffnen")}>
								<SettingsIcon />
							</IconButton>
						</Tooltip>
					) : null}
				</Box>
			</Box>

			{/*
			 * Map first in the source, panels second. Stacked, the whole body scrolls and the map keeps
			 * most of the height; side by side, each scrolls on its own. The map is what the view is
			 * for, so it keeps the space and the panels move rather than squeezing it.
			 */}
			<Box
				sx={{
					flex: "1 1 auto",
					minHeight: 0,
					display: "flex",
					flexDirection: "column",
					overflowY: "auto",
					gap: 1,
					p: 1,
					[`@container (min-width: ${SIDE_BY_SIDE_MIN_WIDTH}px)`]: {
						// The widget's sidebar setting: panels on the right, or on the left.
						flexDirection: layout.leiste === "links" ? "row-reverse" : "row",
						overflowY: "hidden",
					},
				}}
			>
				<Box
					sx={{
						position: "relative",
						minWidth: 0,
						// Stacked: most of the height, but never so little that a room cannot be tapped.
						flex: "0 0 auto",
						height: hideSidebar ? "100%" : "62cqh",
						minHeight: 220,
						[`@container (min-width: ${SIDE_BY_SIDE_MIN_WIDTH}px)`]: {
							flex: "1 1 auto",
							height: "auto",
							minHeight: 0,
						},
						...(pageTheme ? { bgcolor: widgetPalette(layout).map, borderRadius: 1 } : {}),
					}}
				>
					{renderMap()}
				</Box>

				{hideSidebar ? null : (
					<Box
						sx={{
							flex: "0 0 auto",
							width: "100%",
							// The widget's UI zoom scales the panels, not the map, which zooms by itself.
							zoom: layout.groesse,
							[`@container (min-width: ${SIDE_BY_SIDE_MIN_WIDTH}px)`]: {
								// Width in unzoomed pixels, as the setting says; zoom scales the content.
								width: layout.width / layout.groesse,
								overflowY: "auto",
							},
						}}
					>
						<Sidebar
							connection={connection}
							instanceId={instanceId}
							did={did}
							status={status}
							commands={commands}
							sequenceOrder={sequenceOrder}
							editingSequence={editingSequence}
							onEditingSequenceChange={setEditingSequence}
							selection={selection}
							onClearSequence={clearSequence}
							config={settings.config}
							robotType={robotType}
							editingSettings={settingsOpen}
							onToggleShortcut={shortcutId =>
								settings.update(config =>
									withFieldHidden(config, "shortcuts", shortcutId, !hiddenFields(config, "shortcuts").has(shortcutId)),
								)
							}
						/>
					</Box>
				)}
			</Box>

			{showGear ? (
				<SettingsDrawer
					open={settingsOpen}
					onClose={() => setSettingsOpen(false)}
					settings={settings}
					appearance={settingsMode === "page"}
					link={settingsMode === "page"}
				/>
			) : null}
		</Box>
	);

	return pageTheme ? <ThemeProvider theme={pageTheme}>{view}</ThemeProvider> : view;
}
