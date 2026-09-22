/**
 * A stored floor, shown as the picture the adapter rendered for it.
 *
 * Used for every floor the robot is not currently on: only the live floor has the raw map data
 * this project draws itself, so for the others the adapter's own picture is all there is. It is a
 * flat image - no path, no room labels from this renderer, no 3D - and the view says so rather
 * than presenting it as the live map.
 */

import type React from "react";
import { Box, Typography } from "@mui/material";
import { I18n } from "@iobroker/gui-components";

import { useStates } from "../connection/useStates";
import { Centre } from "./Centre";
import type { TabConnection } from "../connection/types";

export interface FloorImageProps {
	connection: TabConnection;
	/** The floor's `image` state, holding a `data:image/png` URL. */
	stateId: string;
	/** Adds a small caption saying this is a stored floor. Off in a tile, where space is short. */
	caption?: boolean;
}

export function FloorImage({ connection, stateId, caption = true }: FloorImageProps): React.JSX.Element {
	const values = useStates(connection, [stateId]);
	const src = values[stateId];

	// The adapter only writes pictures of other floors when "fetch all maps" is on in its settings;
	// without that there is nothing to show, and saying why beats an empty box.
	if (typeof src !== "string" || !src.startsWith("data:image/")) {
		return (
			<Centre>
				<Typography variant="body2" color="text.secondary">
					{I18n.t("tab.floor.keinBild")}
				</Typography>
			</Centre>
		);
	}

	return (
		<Box sx={{ position: "relative", width: "100%", height: "100%" }}>
			<Box
				component="img"
				src={src}
				alt=""
				sx={{
					width: "100%",
					height: "100%",
					objectFit: "contain",
					// One pixel per cell, like the live floor: smoothing would blur the cell edges.
					imageRendering: "pixelated",
					display: "block",
				}}
			/>
			{caption ? (
				<Typography
					variant="caption"
					color="text.secondary"
					sx={{ position: "absolute", left: 8, bottom: 8, bgcolor: "background.paper", px: 1, borderRadius: 1 }}
				>
					{I18n.t("tab.floor.gespeichert")}
				</Typography>
			) : null}
		</Box>
	);
}
