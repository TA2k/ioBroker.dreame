/**
 * What the element draws: the tile - status, map or, with `auto`, whichever fits the box - and the larger view of
 * the dialog a click on the tile opens.
 *
 * The tile is what the native widgets show on a dashboard (`StatusTile` and `MapTile` of the views), plus the three
 * buttons of the status panel of the full view - start or pause, stop, dock - where the box has room for them. The
 * dialog is the map with the status panel beside it: state, battery, progress, area and the buttons.
 *
 * Plain React and CSS (`styles.ts`); which parts show is decided by container queries on the size of the box.
 */
import type { JSX } from "react";

import type { MapPackage } from "../../src-tab/src/map/mapPackage";
import type { WorldPoint } from "../../src-tab/src/map/playback";
import type { LabelledRoom } from "../../src-tab/src/map/rooms";

import type { RobotCommand, RobotContent } from "./constants";
import { Icon, RobotIcon } from "./icons";
import type { Words } from "./i18n";
import { MapPicture, type RobotBadge } from "./MapPicture";

/** Below this the battery is drawn as low, unless it is charging */
const LOW_BATTERY = 20;

/** What the element shows of the robot, read from its states */
export interface RobotValues {
	/** The caption line; null for none */
	caption: string | null;
	stateText: string;
	/** Out doing a job, not docked, charging or idle */
	working: boolean;
	/** A task is under way, paused or not: progress and area mean something */
	started: boolean;
	error: boolean;
	battery: number | null;
	charging: boolean;
	/** Percent */
	progress: number | null;
	/** Square metres */
	area: number | null;
	/** What only matters while it lasts: run time, drying progress */
	details: string[];
}

/** What there is to show of the map */
export type MapData =
	| { kind: "loading" }
	| { kind: "message"; text: string }
	| {
			kind: "live";
			map: MapPackage;
			rooms: LabelledRoom[];
			robot: WorldPoint | null;
			charger: WorldPoint | null;
	  }
	| { kind: "image"; src: string; caption: string };

interface CommonProps {
	values: RobotValues;
	map: MapData;
	editMode: boolean;
	words: Words;
	/** The text of a command that failed, shown for a moment; null otherwise */
	failure: string | null;
	onCommand: (command: RobotCommand) => void;
}

export interface RobotTileProps extends CommonProps {
	content: RobotContent;
	controls: boolean;
	onOpen: () => void;
}

/** A hint instead of the robot: none found, or the ID is not one */
export function Hint({ text, editMode }: { text: string; editMode: boolean }): JSX.Element {
	return (
		<div className={`tile hint${editMode ? " edit" : ""}`}>
			<RobotIcon className="hint-icon" />
			<span>{text}</span>
		</div>
	);
}

function badgeOf(values: RobotValues): RobotBadge {
	if (values.error) {
		return "error";
	}
	if (values.working) {
		return "working";
	}
	return values.charging ? "charging" : null;
}

function Battery({ values, words }: { values: RobotValues; words: Words }): JSX.Element | null {
	if (values.battery == null) {
		return null;
	}
	const low = !values.charging && values.battery < LOW_BATTERY;
	return (
		<span className={`battery${low ? " low" : ""}`} title={`${words.view("tab.info.akku")} ${values.battery} %`}>
			<Icon name={values.charging ? "batteryCharging" : low ? "batteryLow" : "batteryFull"} />
			<span>{values.battery} %</span>
		</span>
	);
}

/** Start or pause, stop, dock; labelled in the dialog, icons only on the tile */
function Controls({
	values,
	editMode,
	words,
	onCommand,
	labels,
}: Pick<CommonProps, "values" | "editMode" | "words" | "onCommand"> & { labels?: boolean }): JSX.Element {
	const main: RobotCommand = values.working ? "pause" : "start";
	const buttons: { command: RobotCommand; icon: "play" | "pause" | "stop" | "dock"; label: string }[] = [
		{
			command: main,
			icon: main === "pause" ? "pause" : "play",
			label: main === "pause" ? words.own("pause") : words.view("panel.kopf.start-knopf"),
		},
		{ command: "stop", icon: "stop", label: words.view("tab.stop") },
		{ command: "dock", icon: "dock", label: words.view("tab.dock") },
	];
	return (
		// a press on a button is no click on the tile, which opens the dialog
		<div className={`controls${labels ? " labelled" : ""}`} onClick={event => event.stopPropagation()}>
			{buttons.map(button => (
				<button
					key={button.command}
					type="button"
					className={`command ${button.command}`}
					title={button.label}
					aria-label={button.label}
					disabled={editMode}
					onClick={() => onCommand(button.command)}
				>
					<Icon name={button.icon} />
					{labels ? <span>{button.label}</span> : null}
				</button>
			))}
		</div>
	);
}

function Progress({ values }: { values: RobotValues }): JSX.Element | null {
	return values.working && values.progress != null && values.progress > 0 && values.progress < 100 ? (
		<div className="progress">
			<div style={{ width: `${values.progress}%` }} />
		</div>
	) : null;
}

/** The map, or what there is instead of it */
function MapArea({ map, values }: { map: MapData; values: RobotValues }): JSX.Element {
	let inner: JSX.Element;
	if (map.kind === "live") {
		inner = (
			<MapPicture
				map={map.map}
				rooms={map.rooms}
				liveRobot={map.robot}
				liveCharger={map.charger}
				badge={badgeOf(values)}
			/>
		);
	} else if (map.kind === "image") {
		inner = <img className="floor-image" src={map.src} alt={map.caption} title={map.caption} />;
	} else if (map.kind === "loading") {
		inner = <div className="spinner" />;
	} else {
		inner = <span className="map-message">{map.text}</span>;
	}
	return <div className="map-area">{inner}</div>;
}

function Failure({ text, words }: { text: string | null; words: Words }): JSX.Element | null {
	return text ? (
		<div className="failure" role="alert">
			{words.view("tab.commandFailed")}: {text}
		</div>
	) : null;
}

/** The tile: the status, the map, or - `auto` - the map where the box is large enough and the status elsewhere */
export function RobotTile(props: RobotTileProps): JSX.Element {
	const { content, values, map, controls, editMode, words, failure, onOpen } = props;
	const showStatus = content !== "map";
	const showMap = content !== "status";
	return (
		<div
			className={`tile ${content}${editMode ? " edit" : ""}${values.working ? " working" : ""}`}
			title={editMode ? undefined : words.own("details")}
			onClick={editMode ? undefined : onOpen}
		>
			{showStatus ? (
				<div className="status-view">
					<RobotIcon className="robot-icon" />
					<div className="texts">
						{values.caption != null ? <div className="caption">{values.caption}</div> : null}
						<div className="state">{values.stateText}</div>
						<Battery values={values} words={words} />
					</div>
					{controls ? <Controls {...props} /> : null}
					<Progress values={values} />
				</div>
			) : null}
			{showMap ? (
				<div className="map-view">
					{values.caption != null || values.battery != null ? (
						<div className="map-head">
							<span className="caption">{values.caption}</span>
							<Battery values={values} words={words} />
						</div>
					) : null}
					<MapArea map={map} values={values} />
					<div className="map-foot">
						<span className="state">{values.stateText}</span>
						{controls ? <Controls {...props} /> : null}
					</div>
					<Progress values={values} />
				</div>
			) : null}
			<Failure text={failure} words={words} />
		</div>
	);
}

/** The view of the dialog: the map, and beside or below it the status panel of the full view */
export function RobotDetail(props: CommonProps): JSX.Element {
	const { values, map, words, failure } = props;
	const figures = [
		{ label: words.view("tab.info.akku"), value: values.battery != null ? `${values.battery} %` : "–" },
		{
			label: words.view("tab.info.reinigung"),
			value: values.started && values.progress != null ? `${values.progress} %` : "–",
		},
		{
			label: words.view("tab.info.flaeche"),
			value: values.started && values.area != null ? `${values.area} m²` : "–",
		},
	];
	return (
		<div className="detail">
			<MapArea map={map} values={values} />
			<div className="panel">
				<div className="panel-state">{values.stateText}</div>
				<div className="panel-details">{values.details.length ? values.details.join(" · ") : "–"}</div>
				<div className="figures">
					{figures.map(figure => (
						<div key={figure.label} className="figure">
							<div className="figure-value">{figure.value}</div>
							<div className="figure-label">{figure.label}</div>
						</div>
					))}
				</div>
				{values.started && values.progress != null && values.progress > 0 && values.progress < 100 ? (
					<div className="progress inline">
						<div style={{ width: `${values.progress}%` }} />
					</div>
				) : null}
				<Controls {...props} labels />
				<Failure text={failure} words={words} />
			</div>
		</div>
	);
}
