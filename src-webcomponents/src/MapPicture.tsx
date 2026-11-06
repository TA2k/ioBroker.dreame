/**
 * The live map of one floor as a picture: floor, carpets, zones, walls, furniture, the trail, the rooms' names, the
 * charger and the robot - what `MapView` of the native views draws with `interactive={false}` for a tile
 * (`src-tab/src/components/MapView.tsx`), without MUI.
 *
 * Everything the picture is made of comes from the pure modules of the views (`src-tab/src/map/`), compiled in: the
 * decoded package, the floor pixels, the overlays, the trail and its playback, the rooms. Only the drawing is new.
 *
 * ## No measuring
 *
 * The box keeps the map's shape by container units of the map area around it (`.map-area`, `container-type: size`):
 * as wide as the area or as its height allows, whichever is less. Canvas, SVG and labels fill that box, so they lie
 * on each other by construction. The labels are HTML over it, sized in container units, so they stay sharp and
 * readable whatever the scale.
 *
 * ## The robot and the charger
 *
 * Drawn as vector shapes here, not with the pictures of Home Assistant the native views carry (`haIcons.ts`, 150 kB
 * of data URLs) - the module stays small. The robot turns with its heading and carries a dot in the color of its
 * state.
 */
import { useEffect, useId, useMemo, useRef, type CSSProperties, type JSX } from "react";

import { renderFloor } from "../../src-tab/src/map/floorBitmap";
import type { MapPackage } from "../../src-tab/src/map/mapPackage";
import {
	buildOverlays,
	carpetBitmap,
	carpetCells,
	CURTAIN_STROKE,
	mopMaskBitmap,
	OVERLAY_COLOURS,
	VIRTUAL_WALL_STROKE,
	ZONE_STROKE,
} from "../../src-tab/src/map/overlays";
import type { WorldPoint } from "../../src-tab/src/map/playback";
import type { LabelledRoom } from "../../src-tab/src/map/rooms";
import { buildTrailPaths, worldToImage } from "../../src-tab/src/map/trail";
import { useTrailPlayback } from "../../src-tab/src/map/useTrailPlayback";

import { FURNITURE_DIR, markerSizes } from "./constants";

/** The furniture types the build put a picture of next to the module (`vite.config.ts`) */
declare const __DREAME_FURNITURE__: number[];

/**
 * Where this module was loaded from. In a variable, so that the bundler leaves `new URL(..., base)` alone instead
 * of inlining the pictures: they are files next to the module, `webcomponents/furniture/<type>.png`, which web and
 * admin serve under `/adapter/dreame/` for every host.
 */
const MODULE_URL: string = import.meta.url;

const FURNITURE = new Set(__DREAME_FURNITURE__);

function furnitureUrl(type: number): string | null {
	return FURNITURE.has(type) ? new URL(`${FURNITURE_DIR}/${type}.png`, MODULE_URL).href : null;
}

/** The state of the robot, for the dot on its marker */
export type RobotBadge = "working" | "charging" | "error" | null;

export interface MapPictureProps {
	map: MapPackage;
	rooms: LabelledRoom[];
	/** Live positions between maps, where the adapter reports them (`map.robot`, `map.charger`) */
	liveRobot: WorldPoint | null;
	liveCharger: WorldPoint | null;
	badge: RobotBadge;
}

/** Paints RGBA pixels into a canvas, sized to them; nothing where the browser has no 2D context */
function paint(
	canvas: HTMLCanvasElement | null,
	bitmap: { width: number; height: number; rgba: Uint8ClampedArray<ArrayBuffer> } | null,
): void {
	if (!canvas) {
		return;
	}
	if (!bitmap) {
		canvas.width = 0;
		canvas.height = 0;
		return;
	}
	canvas.width = bitmap.width;
	canvas.height = bitmap.height;
	const context = canvas.getContext("2d");
	if (!context) {
		return;
	}
	// resizing a canvas resets its context: smoothing would blur the cell edges again
	context.imageSmoothingEnabled = false;
	context.putImageData(new ImageData(bitmap.rgba, bitmap.width, bitmap.height), 0, 0);
}

function Robot({ size, heading, badge }: { size: number; heading: number | null; badge: RobotBadge }): JSX.Element {
	const r = size / 2;
	return (
		<>
			{/* the y axis of the image points down, the world's up: a counter-clockwise heading turns negative */}
			<g transform={heading != null ? `rotate(${(-heading).toFixed(1)})` : undefined}>
				<circle r={r} fill="#ffffff" stroke="#5f6368" strokeWidth={size * 0.07} />
				<path
					d={`M${r * 0.35} ${-r * 0.55} A${r * 0.65} ${r * 0.65} 0 0 1 ${r * 0.35} ${r * 0.55}`}
					fill="none"
					stroke="#9aa0a6"
					strokeWidth={size * 0.08}
					strokeLinecap="round"
				/>
				<circle cx={-r * 0.1} r={r * 0.32} fill="#3c4043" />
			</g>
			{badge ? (
				<circle className={`badge ${badge}`} cx={r * 0.72} cy={-r * 0.72} r={r * 0.36} strokeWidth={size * 0.06} />
			) : null}
		</>
	);
}

function Charger({ size }: { size: number }): JSX.Element {
	const s = size / 2;
	return (
		<>
			<rect
				x={-s}
				y={-s}
				width={size}
				height={size}
				rx={size * 0.22}
				fill="#ffffff"
				stroke="#5f6368"
				strokeWidth={size * 0.06}
			/>
			<path
				d={`M${s * 0.15} ${-s * 0.72} L${-s * 0.42} ${s * 0.12} H${-s * 0.02} L${-s * 0.15} ${s * 0.72} L${s * 0.42} ${-s * 0.12} H${s * 0.02} Z`}
				fill="#1e8e3e"
			/>
		</>
	);
}

export function MapPicture({ map, rooms, liveRobot, liveCharger, badge }: MapPictureProps): JSX.Element {
	const floorRef = useRef<HTMLCanvasElement | null>(null);
	const carpetRef = useRef<HTMLCanvasElement | null>(null);
	// unique per picture: a page can hold several maps, and the ids of SVG are those of the document
	const maskId = `dreame-mop-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
	const { width, height } = map.header;

	useEffect(() => paint(floorRef.current, renderFloor(map)), [map]);

	// carpets: a canvas of their own at twice the resolution, for the checkerboard of half cells
	useEffect(() => paint(carpetRef.current, carpetBitmap(map, carpetCells(map))), [map]);

	// the rooms the mopping band may cover, as a picture for an SVG mask; none where the browser cannot paint one
	const maskUrl = useMemo(() => {
		const canvas = document.createElement("canvas");
		paint(canvas, mopMaskBitmap(map));
		return canvas.width && canvas.getContext("2d") ? canvas.toDataURL() : null;
	}, [map]);

	const overlays = useMemo(() => buildOverlays(map), [map]);

	// the trail as far as the robot has driven it, and the robot where the playback has it
	const playback = useTrailPlayback(map, liveRobot);
	const trail = useMemo(() => buildTrailPaths(map, playback.cut), [map, playback.cut]);
	const sizes = markerSizes(width);
	const charger = liveCharger ?? map.header.charger;
	const chargerAt = charger ? worldToImage(charger.x, charger.y, map.header) : null;
	const robotAt = playback.robot ? worldToImage(playback.robot.x, playback.robot.y, map.header) : null;

	return (
		<div className="map-fit" style={{ "--map-w": width, "--map-h": height } as CSSProperties}>
			<canvas ref={floorRef} className="map-layer" />
			<canvas ref={carpetRef} className="map-layer" />
			<svg
				className="map-layer"
				viewBox={`0 0 ${width} ${height}`}
				// follows the box exactly, as the canvas does: the trail and the markers stay on the floor below
				preserveAspectRatio="none"
			>
				{maskUrl ? (
					<defs>
						<mask id={maskId} maskUnits="userSpaceOnUse" x={0} y={0} width={width} height={height}>
							<image href={maskUrl} x={0} y={0} width={width} height={height} style={{ imageRendering: "pixelated" }} />
						</mask>
					</defs>
				) : null}

				{/* rules about the floor first, under everything done on it - as Home Assistant layers them */}
				{overlays.noGo.map((zone, index) => (
					<rect
						key={`nogo-${index}`}
						{...zone}
						fill={OVERLAY_COLOURS.noGoFill}
						stroke={OVERLAY_COLOURS.noGoLine}
						strokeWidth={ZONE_STROKE}
					/>
				))}
				{overlays.noMop.map((zone, index) => (
					<rect
						key={`nomop-${index}`}
						{...zone}
						fill={OVERLAY_COLOURS.noMopFill}
						stroke={OVERLAY_COLOURS.noMopLine}
						strokeWidth={ZONE_STROKE}
					/>
				))}
				{overlays.virtualWalls.map((wall, index) => (
					<line
						key={`wall-${index}`}
						{...wall}
						stroke={OVERLAY_COLOURS.virtualWall}
						strokeWidth={VIRTUAL_WALL_STROKE}
						strokeLinecap="round"
					/>
				))}
				{overlays.furniture.map((piece, index) => {
					const href = furnitureUrl(piece.type);
					return href ? (
						<image
							key={`furniture-${index}`}
							href={href}
							x={piece.cx - piece.width / 2}
							y={piece.cy - piece.height / 2}
							width={piece.width}
							height={piece.height}
							opacity={235 / 255}
							preserveAspectRatio="none"
							transform={`rotate(${piece.angle} ${piece.cx} ${piece.cy})`}
						/>
					) : null;
				})}
				{overlays.curtains.map((points, index) => (
					<polyline
						key={`curtain-${index}`}
						points={points}
						fill="none"
						stroke={OVERLAY_COLOURS.curtain}
						strokeWidth={CURTAIN_STROKE}
						strokeLinejoin="round"
						strokeLinecap="round"
					/>
				))}

				{/* mopping band first, vacuum line on top: a run that does both shows the line in the band */}
				{trail.mop ? (
					<path
						mask={maskUrl ? `url(#${maskId})` : undefined}
						d={trail.mop}
						fill="none"
						stroke="#ffffff"
						strokeWidth={8}
						strokeLinejoin="round"
						strokeLinecap="butt"
						opacity={0.33}
					/>
				) : null}
				{trail.vacuum ? (
					<path
						d={trail.vacuum}
						fill="none"
						stroke="#ffffff"
						strokeWidth={1.1}
						strokeLinejoin="round"
						strokeLinecap="round"
						opacity={0.85}
					/>
				) : null}

				{/* the charger first, so that a robot standing in it is drawn on top */}
				{chargerAt ? (
					<g transform={`translate(${chargerAt.x.toFixed(2)} ${chargerAt.y.toFixed(2)})`}>
						<Charger size={sizes.charger} />
					</g>
				) : null}
				{robotAt && playback.robot ? (
					<g transform={`translate(${robotAt.x.toFixed(2)} ${robotAt.y.toFixed(2)})`}>
						<Robot size={sizes.robot} heading={playback.robot.heading} badge={badge} />
					</g>
				) : null}
			</svg>
			<div className="map-layer labels">
				{rooms.map(room => (
					<span
						key={room.id}
						className="room-label"
						style={{ left: `${(room.centre.x / width) * 100}%`, top: `${(room.centre.y / height) * 100}%` }}
					>
						{room.label}
					</span>
				))}
			</div>
		</div>
	);
}
