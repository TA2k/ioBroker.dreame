/**
 * The robot's status as a tile: what it is doing, and how much battery it has.
 *
 * Built for the 1x1 devices tile and vis-2's status mode, and meant to work from a small square
 * up to a wide strip. Sizes follow the tile through container query units (`cqmin`) rather than
 * fixed pixels, so the same component reads at 100 px and at 300 px without a breakpoint for
 * every tile size a host happens to offer; in a wide box the parts sit in a row instead of a
 * column.
 */

import type React from "react";
import { Box, LinearProgress, Typography } from "@mui/material";
import {
	BatteryChargingFull as BatteryChargingFullIcon,
	BatteryFull as BatteryFullIcon,
	Battery20 as Battery20Icon,
} from "@mui/icons-material";
import { I18n } from "@iobroker/gui-components";

import { asNumber } from "../connection/useStates";
import { useDeviceStatus } from "../status/useDeviceStatus";
import { isWorking, statusTextKey } from "../status/statusCodes";
import { useDeviceName } from "../devices/useDeviceName";
import type { TabConnection } from "../connection/types";

/** Below this the battery is drawn as low. The robot heads home on its own well before empty. */
const LOW_BATTERY = 20;

export interface StatusTileProps {
	connection: TabConnection;
	instanceId: string;
	did: string;
	/**
	 * The line above the state: left out for the robot's name from the device list, a text to
	 * replace it - a caption set on the widget - or null for no line at all.
	 */
	caption?: string | null;
}

/**
 * A robot vacuum seen from above: body, bumper arc and lidar turret.
 *
 * Drawn here rather than taken from the icon font, which has brooms and mops but no robot, and in
 * `currentColor` so it follows the tile's active or inactive colour like the text beside it.
 */
function RobotIcon({ working }: { working: boolean }): React.JSX.Element {
	return (
		<Box
			component="svg"
			viewBox="0 0 24 24"
			sx={{
				width: "clamp(22px, 26cqmin, 56px)",
				height: "clamp(22px, 26cqmin, 56px)",
				flex: "0 0 auto",
				color: working ? "primary.main" : "text.secondary",
			}}
			aria-hidden
		>
			<circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="1.6" />
			<path
				d="M5.2 7.5 A8.2 8.2 0 0 1 18.8 7.5"
				fill="none"
				stroke="currentColor"
				strokeWidth="1.6"
				strokeLinecap="round"
			/>
			<circle cx="12" cy="10.5" r="2.6" fill="currentColor" />
		</Box>
	);
}

export function StatusTile({ connection, instanceId, did, caption }: StatusTileProps): React.JSX.Element {
	const status = useDeviceStatus(connection, instanceId, did);
	const deviceName = useDeviceName(connection, instanceId, did);

	const state = asNumber(status.state);
	const key = statusTextKey(state);
	const stateText = key
		? I18n.t(key)
		: state != null
			? `${I18n.t("panel.kopf.status.unbekannter-code-praefix")} ${state}`
			: "–";

	const battery = asNumber(status.battery);
	const charging = asNumber(status.charging);
	const progress = asNumber(status.cleaningProgress);
	const working = isWorking(state);

	// Charging-status 1 is "charging"; a low battery is only worth a warning colour when it is not.
	const BatteryIcon =
		charging === 1
			? BatteryChargingFullIcon
			: battery != null && battery < LOW_BATTERY
				? Battery20Icon
				: BatteryFullIcon;

	return (
		<Box
			sx={{
				width: "100%",
				height: "100%",
				// The progress bar below is pinned to this box's bottom edge.
				position: "relative",
				containerType: "size",
				display: "flex",
				flexDirection: "column",
				alignItems: "center",
				justifyContent: "center",
				gap: "clamp(2px, 3cqmin, 8px)",
				p: "clamp(4px, 5cqmin, 12px)",
				overflow: "hidden",
				textAlign: "center",
				// Wide and short, as a 2x0.5 or 2x1 tile is: icon beside the text rather than above it.
				"@container (min-aspect-ratio: 3/2)": {
					flexDirection: "row",
					textAlign: "left",
					justifyContent: "flex-start",
				},
			}}
		>
			<RobotIcon working={working} />

			<Box sx={{ minWidth: 0, maxWidth: "100%", display: "flex", flexDirection: "column", gap: "1px" }}>
				{caption !== null ? (
					<Typography
						variant="caption"
						color="text.secondary"
						noWrap
						sx={{ fontSize: "clamp(9px, 7.5cqmin, 13px)", lineHeight: 1.2 }}
					>
						{caption || deviceName || did}
					</Typography>
				) : null}

				<Typography
					sx={{
						fontSize: "clamp(11px, 10cqmin, 18px)",
						fontWeight: 600,
						lineHeight: 1.15,
						// Two lines at most: a long status like "Returning to install mop" wraps once
						// rather than being cut to a meaningless first word.
						display: "-webkit-box",
						WebkitLineClamp: 2,
						WebkitBoxOrient: "vertical",
						overflow: "hidden",
					}}
				>
					{stateText}
				</Typography>

				{battery != null ? (
					<Box
						sx={{
							display: "flex",
							alignItems: "center",
							gap: "2px",
							justifyContent: "center",
							"@container (min-aspect-ratio: 3/2)": { justifyContent: "flex-start" },
							color: charging !== 1 && battery < LOW_BATTERY ? "warning.main" : "text.secondary",
						}}
						aria-label={`${I18n.t("tile.akku")} ${battery} %`}
					>
						<BatteryIcon sx={{ fontSize: "clamp(12px, 9cqmin, 18px)" }} />
						<Typography sx={{ fontSize: "clamp(10px, 8cqmin, 14px)", lineHeight: 1 }}>{battery} %</Typography>
					</Box>
				) : null}
			</Box>

			{working && progress != null && progress > 0 && progress < 100 ? (
				<LinearProgress
					variant="determinate"
					value={progress}
					sx={{
						position: "absolute",
						left: 0,
						right: 0,
						bottom: 0,
						height: 3,
					}}
				/>
			) : null}
		</Box>
	);
}
