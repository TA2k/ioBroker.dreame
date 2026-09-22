/**
 * A Dreame robot as a vis-2 widget.
 *
 * Three ways to show it, chosen in the widget's settings:
 *
 * - `status` - the robot's state, battery and progress; a click opens the full view in a dialog.
 * - `map` - the map of one floor, always 2D; a click opens the full view in a dialog.
 * - `full` - the full view right inside the widget, no dialog: map in 2D or 3D, floor, and every
 *   panel of the admin tab. For a view built around the robot.
 *
 * All three follow the widget's size: the views measure the box they are given, not the screen,
 * so a narrow widget stacks what a wide one lays out side by side.
 *
 * ## Split in two
 *
 * The class is what vis-2 requires: a `VisRxWidget` subclass that declares the settings and draws
 * the card. Everything inside the card is {@link WidgetBody}, a function component, because the
 * views it reuses from the admin tab are built on hooks and a class cannot call them.
 */

import type React from "react";
import { useState } from "react";
import { Box, Typography } from "@mui/material";
import { I18n } from "@iobroker/gui-components";
import type { RxRenderWidgetProps, RxWidgetInfo, VisRxWidgetProps, VisRxWidgetState } from "@iobroker/types-vis-2";
import type VisRxWidget from "@iobroker/types-vis-2/visRxWidget";

import { SocketConnection } from "@dreame/connection/SocketConnection";
import type { TabConnection } from "@dreame/connection/types";
import { useResolvedDevice } from "@dreame/devices/useResolvedDevice";
import { parseFloorObjectId } from "@dreame/devices/deviceRef";
import { registerDreameTranslations } from "@dreame/i18n/dreameTranslations";
import { RobotDialog } from "@dreame/widgets/RobotDialog";
import { DreameView } from "@dreame/components/DreameView";
import type { MapMode } from "@dreame/components/DreameView";
import { MapTile } from "@dreame/components/MapTile";
import { StatusTile } from "@dreame/components/StatusTile";
import { Centre } from "@dreame/components/Centre";
import { TileCaption } from "@dreame/components/TileCaption";
import { useTileCaption } from "@dreame/widgets/useTileCaption";
import type { TileCaptionSettings } from "@dreame/widgets/useTileCaption";
import type { CaptionMode } from "@dreame/widgets/tileContent";
import { RobotField, FloorField } from "./SettingsFields";

// Once, when vis-2 first loads the widget set: the shared views look their words up unprefixed,
// the way the admin tab registers them.
registerDreameTranslations();

/** How the widget shows the robot. */
export type WidgetMode = "status" | "map" | "full";

interface DreameRobotRxData {
	/** Object id of the robot, `dreame.<n>.<did>`; empty for the first robot of `dreame.0`. */
	device: string;
	mode: WidgetMode;
	/** Object id of a floor channel under `map.maps`; empty to follow the robot. */
	floor: string;
	/** The view the dialog - or, in `full` mode, the widget - starts in. */
	dialogMode: MapMode;
	noCard: boolean;
	/**
	 * In place of vis-2's usual `widgetTitle`, which only knows a text of the user's: the caption
	 * can also name the robot by itself - see {@link useTileCaption}.
	 */
	caption: CaptionMode;
	captionText: string;
}

/** Words of this widget set's own settings. vis-2 adds this prefix to every label below. */
const PREFIX = "dreame_";

/** A widget setting as a string; a new widget's fields are simply absent. */
function stringData(value: unknown): string {
	return typeof value === "string" ? value : "";
}

export default class DreameRobot extends (window.visRxWidget as typeof VisRxWidget)<
	DreameRobotRxData,
	VisRxWidgetState
> {
	/** One per widget, for its whole life: the views take it as an effect dependency. */
	private readonly connection: TabConnection;

	public constructor(props: VisRxWidgetProps) {
		super(props);
		this.connection = new SocketConnection(props.context.socket);
	}

	public static getI18nPrefix(): string {
		return PREFIX;
	}

	public static getWidgetInfo(): RxWidgetInfo {
		return {
			id: "tplDreameRobot",
			visSet: "dreame",
			visSetLabel: "set_label",
			visSetColor: "#1f6fb2",
			visName: "Dreame robot",
			visWidgetLabel: "DreameRobot",
			visAttrs: [
				{
					name: "common",
					fields: [
						// Lists of the robots and floors there are, instead of the object browser - see
						// ./SettingsFields.
						{
							name: "device",
							label: "device",
							type: "custom",
							component: (_field, data, setData, props) => (
								<RobotField
									socket={props.context.socket}
									value={stringData(data.device)}
									// A floor belongs to one robot; kept across a change of robot, it would point
									// at a map the new one does not have.
									onChange={device => device !== stringData(data.device) && setData({ device, floor: "" })}
								/>
							),
						},
						{
							name: "mode",
							label: "mode",
							type: "select",
							options: [
								{ value: "status", label: "mode_status" },
								{ value: "map", label: "mode_map" },
								{ value: "full", label: "mode_full" },
							],
							default: "status",
						},
						{
							name: "floor",
							label: "floor",
							tooltip: "floor_help",
							type: "custom",
							component: (_field, data, setData, props) => (
								<FloorField
									socket={props.context.socket}
									device={stringData(data.device)}
									value={stringData(data.floor)}
									onChange={floor => setData({ floor })}
								/>
							),
							// The status shows no map, so there is no floor to pick for it.
							hidden: "data.mode === 'status'",
						},
						{
							name: "dialogMode",
							label: "dialogMode",
							type: "select",
							options: [
								{ value: "2d", label: "mode_2d" },
								{ value: "3d", label: "mode_3d" },
							],
							default: "2d",
						},
						{
							name: "noCard",
							label: "noCard",
							type: "checkbox",
						},
						{
							name: "caption",
							label: "caption",
							type: "select",
							options: [
								{ value: "auto", label: "caption_auto" },
								{ value: "custom", label: "caption_custom" },
								{ value: "none", label: "caption_none" },
							],
							default: "auto",
						},
						{
							name: "captionText",
							label: "captionText",
							tooltip: "captionText_help",
							hidden: "data.caption !== 'custom'",
						},
					],
				},
			],
			visDefaultStyle: {
				width: 320,
				height: 320,
				position: "relative",
			},
			visPrev: "widgets/dreame/img/prev_dreame.png",
		};
	}

	public getWidgetInfo(): RxWidgetInfo {
		return DreameRobot.getWidgetInfo();
	}

	public renderWidgetBody(props: RxRenderWidgetProps): React.JSX.Element | React.JSX.Element[] | null {
		super.renderWidgetBody(props);

		const { device, mode, floor, dialogMode, noCard, caption, captionText } = this.state.rxData;

		const content = (
			<div
				style={{
					width: "100%",
					height: "100%",
					// Inside the card this is a flex item of the card's content box; on its own the flex
					// properties are simply ignored. The card shows no title of its own - the caption is
					// drawn in here, see WidgetBody.
					flex: "1 1 auto",
					minHeight: 0,
					position: "relative",
					// What the caption's size is measured against; vis-2's own widget box is no container.
					containerType: "inline-size",
					// In the editor the widget is dragged and resized, not used: the map must not zoom
					// under the wheel, and a click must select the widget, not open a dialog.
					pointerEvents: this.props.editMode ? "none" : undefined,
				}}
			>
				<WidgetBody
					connection={this.connection}
					device={device}
					mode={mode || "status"}
					floor={floor}
					dialogMode={dialogMode || "2d"}
					caption={caption}
					captionText={captionText}
				/>
			</div>
		);

		if (noCard || props.widget.usedInWidget) return content;

		return this.wrapContent(content, null, {
			boxSizing: "border-box",
			height: "100%",
			// The views bring their own spacing; the card's default padding would only take room
			// from the map.
			padding: 8,
			paddingBottom: 8,
		});
	}
}

interface WidgetBodyProps extends TileCaptionSettings {
	connection: TabConnection;
	device: string;
	mode: WidgetMode;
	floor: string;
	dialogMode: MapMode;
}

function WidgetBody({
	connection,
	device: deviceId,
	mode,
	floor,
	dialogMode,
	...settings
}: WidgetBodyProps): React.JSX.Element {
	const device = useResolvedDevice(connection, deviceId);
	const startFloor = parseFloorObjectId(floor);
	// Only the map mode is pinned to its floor; the full view starts on it but lets the user switch.
	const { caption, title } = useTileCaption(connection, device, mode === "map" ? startFloor : null, settings);
	const [open, setOpen] = useState(false);

	if (!device) {
		return (
			<Centre>
				<Typography variant="caption" color="text.secondary">
					{I18n.t(`${PREFIX}no_device`)}
				</Typography>
			</Centre>
		);
	}

	if (mode === "full") {
		return (
			<DreameView
				// A different robot is a different view, not the same one with new props: its floor,
				// mode and selections belong to the old robot.
				key={`${device.instanceId}.${device.did}`}
				connection={connection}
				instanceId={device.instanceId}
				did={device.did}
				defaultMode={dialogMode}
				defaultFloor={startFloor}
				// Where the admin tab names the robot.
				headerStart={
					caption ? (
						<Typography variant="h6" noWrap title={caption} sx={{ minWidth: 0 }}>
							{caption}
						</Typography>
					) : null
				}
			/>
		);
	}

	return (
		<>
			<Box
				onClick={() => setOpen(true)}
				sx={{ width: "100%", height: "100%", cursor: "pointer", display: "flex", flexDirection: "column" }}
			>
				{mode === "map" ? (
					<>
						{caption ? <TileCaption text={caption} placement="top" /> : null}
						<Box sx={{ flex: "1 1 auto", minHeight: 0 }}>
							<MapTile connection={connection} instanceId={device.instanceId} did={device.did} floor={startFloor} />
						</Box>
					</>
				) : (
					<StatusTile connection={connection} instanceId={device.instanceId} did={device.did} caption={caption} />
				)}
			</Box>

			<RobotDialog
				open={open}
				onClose={() => setOpen(false)}
				connection={connection}
				instanceId={device.instanceId}
				did={device.did}
				title={title}
				defaultMode={dialogMode}
				defaultFloor={startFloor}
			/>
		</>
	);
}
