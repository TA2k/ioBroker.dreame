/**
 * A Dreame robot as a tile in the devices app.
 *
 * Shows either the robot's status or its map, chosen in the tile's settings - by default the map on
 * a 2x2 tile, where there is room for one, and the status everywhere else. Captioned with the
 * robot's name - and the floor's, where the map is pinned to one - or a text of the user's, or not
 * at all. A click opens the full view in a dialog: map in 2D or 3D, floor, and every panel of the
 * admin tab.
 *
 * ## Split in two
 *
 * The class is what the devices app requires: a `WidgetGeneric` subclass that draws the tile's
 * frame in the app's own style and answers for its size. Everything inside the frame is
 * {@link TileBody}, a function component, because the views it reuses from the admin tab are
 * built on hooks and a class cannot call them.
 */

import type React from "react";
import { useEffect, useState } from "react";
import { Box, Typography } from "@mui/material";
import type { Theme } from "@mui/material";
import WidgetGeneric, {
	getTileStyles,
	type CustomWidgetPlugin,
	type WidgetGenericProps,
	type WidgetGenericState,
} from "@iobroker/dm-widgets";
import type { ConfigItemPanel, ConfigItemTabs } from "@iobroker/dm-utils";
import { I18n } from "@iobroker/gui-components";

import { SocketConnection } from "@dreame/connection/SocketConnection";
import type { TabConnection } from "@dreame/connection/types";
import { useResolvedDevice, DEFAULT_INSTANCE } from "@dreame/devices/useResolvedDevice";
import { parseFloorObjectId } from "@dreame/devices/deviceRef";
import { useDeviceStatus } from "@dreame/status/useDeviceStatus";
import { isWorking } from "@dreame/status/statusCodes";
import { asNumber } from "@dreame/connection/useStates";
import { resolveTileContent } from "@dreame/widgets/tileContent";
import { useTileCaption } from "@dreame/widgets/useTileCaption";
import type { CaptionMode, TileContent, TileSize } from "@dreame/widgets/tileContent";
import { remoteEntryUrl } from "@dreame/widgets/remoteEntry";
import { registerDreameTranslations } from "@dreame/i18n/dreameTranslations";
import { RobotDialog } from "@dreame/widgets/RobotDialog";
import { MapTile } from "@dreame/components/MapTile";
import { StatusTile } from "@dreame/components/StatusTile";
import { Centre } from "@dreame/components/Centre";
import { TileCaption } from "@dreame/components/TileCaption";

// Once, when the devices app first loads this tile: the shared views look their words up in the
// app's own `I18n`, unprefixed.
registerDreameTranslations();

/**
 * This bundle's entry, from which json-config loads the robot and floor fields of the settings.
 * The file name is the one `vite.config.ts` gives the federation entry.
 */
const ENTRY_URL = remoteEntryUrl(import.meta.url, "customDevices.js");

interface DreameTileSettings extends CustomWidgetPlugin {
	// `size` comes from the base settings; the schema below only widens its choices to 2x2.
	/** Object id of the robot, `dreame.<n>.<did>`; empty for the first robot of `dreame.0`. */
	device?: string;
	caption?: CaptionMode;
	/** The caption's text where `caption` is `custom`. */
	captionText?: string;
	content?: TileContent;
	/** Object id of a floor channel under `map.maps`; empty to follow the robot. */
	floor?: string;
	dialogMode?: "2d" | "3d";
}

interface DreameTileState extends WidgetGenericState {
	/** Mirrors whether the robot is out cleaning, so the frame can draw the tile as active. */
	working: boolean;
}

/** Width to height of each tile size, so the frame keeps the grid's proportions. */
const ASPECT: Record<TileSize, string> = {
	"1x1": "1",
	"2x0.5": "4",
	"2x1": "2",
	"2x2": "1",
};

/** The 2x2 frame style. Present on the app's real base class, absent from the compile-time stub. */
type HugeStyle = (theme: Theme) => React.CSSProperties;

export class DreameRobotComponent extends WidgetGeneric<DreameTileState, DreameTileSettings> {
	/** One per tile, for its whole life: the views take it as an effect dependency. */
	private readonly connection: TabConnection;

	public constructor(props: WidgetGenericProps<DreameTileSettings>) {
		super(props);
		this.connection = new SocketConnection(props.stateContext.getSocket());
		this.state = { ...this.state, working: false };
	}

	public static override getConfigSchema(): { name: string; schema: ConfigItemPanel | ConfigItemTabs } {
		return {
			name: "DreameRobot",
			schema: {
				type: "panel",
				items: {
					// Replaces the app's own size field, which offers no 2x2: a map needs that tile.
					size: {
						type: "select",
						label: "dreame_size",
						options: [
							{ value: "1x1", label: "1×1" },
							{ value: "2x1", label: "2×1" },
							{ value: "2x0.5", label: "2×½" },
							{ value: "2x2", label: "2×2" },
						],
						default: "1x1",
						format: "radio",
						horizontal: true,
						noTranslation: true,
					},
					// A list of the robots there are, from this bundle - see ./config/ConfigComponents.
					device: {
						type: "custom",
						url: ENTRY_URL,
						name: "dreame/ConfigComponents/DeviceField",
						// The bundle shares nothing through federation, so json-config cannot tell from
						// its manifest what it was built against and has to be told.
						guiApi: 2,
						// The words are already there: the devices app loads `./translations` with the tile.
						i18n: false,
						label: "dreame_device",
						sm: 12,
					},
					caption: {
						type: "select",
						label: "dreame_caption",
						options: [
							{ value: "auto", label: "dreame_caption_auto" },
							{ value: "custom", label: "dreame_caption_custom" },
							{ value: "none", label: "dreame_caption_none" },
						],
						default: "auto",
						sm: 12,
					},
					captionText: {
						type: "text",
						label: "dreame_caption_text",
						help: "dreame_caption_text_help",
						hidden: "data.caption !== 'custom'",
						sm: 12,
					},
					content: {
						type: "select",
						label: "dreame_content",
						options: [
							{ value: "auto", label: "dreame_content_auto" },
							{ value: "status", label: "dreame_content_status" },
							{ value: "map", label: "dreame_content_map" },
						],
						default: "auto",
						sm: 12,
					},
					// The floors of the robot picked above. Hides itself where the tile shows no map.
					floor: {
						type: "custom",
						url: ENTRY_URL,
						name: "dreame/ConfigComponents/FloorField",
						guiApi: 2,
						i18n: false,
						label: "dreame_floor",
						help: "dreame_floor_help",
						sm: 12,
					},
					dialogMode: {
						type: "select",
						label: "dreame_dialog_mode",
						options: [
							{ value: "2d", label: "dreame_dialog_2d" },
							{ value: "3d", label: "dreame_dialog_3d" },
						],
						default: "2d",
						sm: 12,
					},
				},
			} as ConfigItemPanel,
		};
	}

	/** A tile is lit while the robot is out working, not merely while it has power. */
	protected override isTileActive(): boolean {
		return this.state.working;
	}

	private readonly onWorkingChange = (working: boolean): void => {
		if (working !== this.state.working) this.setState({ working });
	};

	private frameStyle(size: TileSize, theme: Theme): React.CSSProperties {
		if (size === "2x2") {
			const huge = (WidgetGeneric as unknown as { getStyleHuge?: HugeStyle }).getStyleHuge;
			return huge ? huge(theme) : WidgetGeneric.getStyleWideTall(theme);
		}
		if (size === "2x1") return WidgetGeneric.getStyleWideTall(theme);
		if (size === "2x0.5") return WidgetGeneric.getStyleWide(theme);
		return WidgetGeneric.getStyleCompact(theme);
	}

	private renderTile(size: TileSize): React.JSX.Element {
		const active = this.state.working;
		const accent = this.getAccentColor();
		const indicators = this.renderIndicators(this.renderSettingsButton());

		return (
			<Box
				id={String(this.props.widget.id)}
				className={this.getWidgetClass()}
				sx={theme => this.frameStyle(size, theme)}
			>
				<Box
					sx={theme => ({
						position: "relative",
						width: "100%",
						aspectRatio: ASPECT[size],
						overflow: "hidden",
						...(getTileStyles(theme, active, accent) as object),
						// The map reaches the tile's edges; the status keeps a margin of its own.
						padding: 0,
					})}
				>
					{/* Indicators and the settings button must not open the dialog underneath them. */}
					<div onClick={event => event.stopPropagation()} style={{ display: "contents" }}>
						{indicators}
					</div>
					<TileBody
						connection={this.connection}
						settings={this.props.settings}
						size={size}
						onWorkingChange={this.onWorkingChange}
					/>
				</Box>
			</Box>
		);
	}

	public override renderCompact(): React.JSX.Element {
		return this.renderTile("1x1");
	}

	public override renderWide(): React.JSX.Element {
		return this.renderTile("2x0.5");
	}

	public override renderWideTall(): React.JSX.Element {
		return this.renderTile("2x1");
	}

	/**
	 * The 2x2 tile.
	 *
	 * Not declared on the compile-time stub of the base class, so no `override` - but the devices app
	 * calls it on its real base class for this size, which is why the method has to exist.
	 */
	public renderHuge(): React.JSX.Element {
		return this.renderTile("2x2");
	}
}

interface TileBodyProps {
	connection: TabConnection;
	settings: DreameTileSettings;
	size: TileSize;
	onWorkingChange: (working: boolean) => void;
}

function TileBody({ connection, settings, size, onWorkingChange }: TileBodyProps): React.JSX.Element {
	const device = useResolvedDevice(connection, settings.device);
	const status = useDeviceStatus(connection, device?.instanceId ?? DEFAULT_INSTANCE, device?.did ?? null);
	const working = isWorking(asNumber(status.state));
	const [open, setOpen] = useState(false);

	const content = resolveTileContent(settings.content, size);
	const floor = parseFloorObjectId(settings.floor);
	// Only a map is pinned to a floor; the status is the robot's wherever it is.
	const { caption, title } = useTileCaption(connection, device, content === "map" ? floor : null, settings);

	useEffect(() => onWorkingChange(working), [working, onWorkingChange]);

	if (!device) {
		return (
			<Centre>
				<Typography variant="caption" color="text.secondary">
					{I18n.t("dreame_no_device")}
				</Typography>
			</Centre>
		);
	}

	return (
		<>
			<Box
				onClick={() => setOpen(true)}
				sx={{ width: "100%", height: "100%", cursor: "pointer", display: "flex", flexDirection: "column" }}
			>
				{content === "map" ? (
					<>
						<Box sx={{ flex: "1 1 auto", minHeight: 0 }}>
							<MapTile connection={connection} instanceId={device.instanceId} did={device.did} floor={floor} />
						</Box>
						{caption ? <TileCaption text={caption} /> : null}
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
				defaultMode={settings.dialogMode}
				defaultFloor={floor}
			/>
		</>
	);
}

export default DreameRobotComponent;
