/**
 * The map as a tile: a picture of one floor, nothing to operate.
 *
 * Built for the 2x2 devices tile and vis-2's map mode. Every interaction a full view offers is
 * absent on purpose - no zoom, no panning, no room taps - because a click on the tile belongs to
 * the tile: it opens the full view. A map that also took drags would swallow half of those.
 *
 * Always 2D. A tile is small, it is rebuilt every few seconds while the robot cleans, and a 3D
 * scene per tile on a dashboard would cost a WebGL context each - browsers allow only a handful.
 */

import type React from "react";
import { useMemo } from "react";
import { CircularProgress, Typography } from "@mui/material";
import { I18n } from "@iobroker/gui-components";

import { useMapPackage } from "../map/useMapPackage";
import { collectRooms, labelRooms } from "../map/rooms";
import { LIVE_FLOOR, floorSource } from "../floors/floors";
import { floorPrefix } from "../floors/useFloors";
import type { TabConnection } from "../connection/types";
import { Centre } from "./Centre";
import { FloorImage } from "./FloorImage";
import { MapView } from "./MapView";
import { useLivePositions } from "../map/useLivePositions";
import { markerStatusOf, robotBadge, stationBadge } from "../map/markers";
import { useDeviceStatus } from "../status/useDeviceStatus";
import { MIN_LABELLED_CELLS } from "./DreameView";

export interface MapTileProps {
	connection: TabConnection;
	instanceId: string;
	did: string;
	/** {@link LIVE_FLOOR} or a floor id. */
	floor?: string;
}

export function MapTile({ connection, instanceId, did, floor = LIVE_FLOOR }: MapTileProps): React.JSX.Element {
	const { map, loading, error } = useMapPackage(connection, instanceId, did);
	const live = useLivePositions(connection, instanceId, did);
	const markerStatus = markerStatusOf(useDeviceStatus(connection, instanceId, did));

	const rooms = useMemo(
		() =>
			map
				? labelRooms(collectRooms(map, { minCells: MIN_LABELLED_CELLS }), (key, ...args) => I18n.t(key, ...args))
				: [],
		[map],
	);

	const source = floorSource(floor, map?.header.mapId ?? null, floorPrefix(instanceId, did));

	// No caption on a stored floor here: a tile has no room for it, and the full view says it.
	if (source.kind === "image") return <FloorImage connection={connection} stateId={source.stateId} caption={false} />;

	if (loading || source.kind === "pending") {
		return (
			<Centre>
				<CircularProgress size={24} />
			</Centre>
		);
	}

	if (error || !map) {
		return (
			<Centre>
				<Typography variant="caption" color="text.secondary">
					{error ? I18n.t("tab.mapError") : I18n.t("tab.noMap")}
				</Typography>
			</Centre>
		);
	}

	return (
		<MapView
			map={map}
			rooms={rooms}
			interactive={false}
			liveRobot={live.robot}
			liveCharger={live.charger}
			robotBadge={robotBadge(markerStatus)}
			stationBadge={stationBadge(markerStatus)}
		/>
	);
}
