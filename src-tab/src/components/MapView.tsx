/**
 * The map: floor pixels with room labels over them.
 *
 * ## Why two layers rather than one canvas
 *
 * The canvas holds one pixel per map cell, which is what makes the floor crisp when it is scaled
 * up. Text drawn into that canvas would be scaled by the same factor and turn to mush. So the
 * labels live in an SVG on top, sharing the canvas's coordinate space through a `viewBox` and
 * staying sharp at any size.
 *
 * Both layers fill a box that carries the map's aspect ratio, so neither needs `objectFit` and
 * the two can never drift apart - a label is where the pixel under it is, by construction.
 *
 * ## Why the rooms are passed in
 *
 * This component draws; it does not decide what a room is. The caller already needs the room list
 * for other things, and computing it here as well would either duplicate the work or require a
 * callback back up - and a callback whose identity changes each render turns an effect into a
 * render loop. Passing the finished list avoids both.
 */

import type React from "react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Box, IconButton, Stack, Tooltip, useTheme } from "@mui/material";
import { Add as AddIcon, Remove as RemoveIcon, FitScreen as FitScreenIcon } from "@mui/icons-material";

import { I18n } from "@iobroker/gui-components";

import { renderFloor } from "../map/floorBitmap";
import { buildTrailPaths, worldToImage } from "../map/trail";
import { HA_ICONS } from "../map/haIcons";
import { badgeBox, markerSizes } from "../map/markers";
import type { Badge } from "../map/markers";
import { useTrailPlayback } from "../map/useTrailPlayback";
import {
	CURTAIN_STROKE,
	OVERLAY_COLOURS,
	VIRTUAL_WALL_STROKE,
	ZONE_STROKE,
	buildOverlays,
	carpetBitmap,
	carpetCells,
	mopMaskBitmap,
} from "../map/overlays";
import { furnitureImage } from "../map/furnitureImages";
import { BADGE, layoutBadge } from "../map/roomBadges";
import type { RoomBadges } from "../map/roomBadges";
import type { WorldPoint } from "../map/playback";
import type { LabelledRoom } from "../map/rooms";
import type { MapPackage } from "../map/mapPackage";
import { isSegment } from "../map/mapPackage";
import { sequencePosition } from "../panels/sequence";
import {
	FITTED,
	MAX_SCALE,
	MIN_SCALE,
	ZOOM_STEP,
	clampPan,
	fitMap,
	isClick,
	isFitted,
	unrotate,
	zoomAbout,
} from "../map/viewport";
import type { Viewport } from "../map/viewport";

/** Label size on screen, matching the widget's `.rlabel`. */
const LABEL_PX = 13;

export interface MapViewProps {
	map: MapPackage;
	/** Rooms to label. Every room gets one; the naming rule always yields something. */
	rooms: LabelledRoom[];
	hiddenRooms?: ReadonlySet<number>;
	/**
	 * Called with the segment id of the room under a click, when one was hit.
	 *
	 * Absent means rooms do not respond to taps; the map still zooms and pans.
	 */
	onRoomClick?: (roomId: number) => void;
	/** Room ids in cleaning order, shown as numbered badges. Empty or absent draws none. */
	sequenceOrder?: readonly number[];
	/**
	 * Rooms picked for the next start. Empty or absent means all rooms; a partial pick pales the
	 * rooms it leaves out, and their labels with them.
	 */
	selectedRooms?: ReadonlySet<number>;
	/** Live positions between maps, where the adapter reports them; see `useLivePositions`. */
	liveRobot?: WorldPoint | null;
	liveCharger?: WorldPoint | null;
	/** Status badges on the robot and the charger; see `map/markers.ts`. */
	robotBadge?: Badge | null;
	stationBadge?: Badge | null;
	/** Suction and water under the names of the rooms about to be, or being, cleaned. */
	roomBadges?: RoomBadges | null;
	/**
	 * Turns the map clockwise by 0, 90, 180 or 270 degrees, as the widget's setting did. Labels and
	 * badges stay upright; the robot turns with the map, since its heading is part of it.
	 */
	rotation?: 0 | 90 | 180 | 270;
	/**
	 * False turns the map into a picture: no zoom, no panning, no room taps, no controls.
	 *
	 * For a tile, where a click belongs to the tile - it opens the full view - and a map that also
	 * wanted to be dragged would swallow half the clicks meant for it.
	 */
	interactive?: boolean;
}

export function MapView({
	map,
	rooms,
	hiddenRooms,
	onRoomClick,
	sequenceOrder,
	selectedRooms,
	liveRobot,
	liveCharger,
	robotBadge,
	stationBadge,
	roomBadges,
	rotation = 0,
	interactive = true,
}: MapViewProps): React.JSX.Element {
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const carpetRef = useRef<HTMLCanvasElement | null>(null);
	// Unique per view: a page can hold several maps, and SVG ids are document-wide.
	const maskId = `mop-mask-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
	const [maskUrl, setMaskUrl] = useState<string | null>(null);
	const boxRef = useRef<HTMLDivElement | null>(null);
	const outerRef = useRef<HTMLDivElement | null>(null);
	const [space, setSpace] = useState({ width: 0, height: 0 });
	const [view, setView] = useState<Viewport>(FITTED);
	// A ref rather than state: it changes on every pointer move and nothing renders from it.
	const dragRef = useRef<{
		startX: number;
		startY: number;
		originX: number;
		originY: number;
		pointerId: number;
	} | null>(null);
	const theme = useTheme();
	const { width, height } = map.header;

	// A different map is a different place; keeping the old zoom would drop the user into a
	// corner of a floor they have not seen.
	useEffect(() => setView(FITTED), [map.header.width, map.header.height]);

	/**
	 * Wheel zoom, registered by hand because it has to be non-passive.
	 *
	 * React attaches wheel listeners passively, and a passive listener may not call
	 * `preventDefault` - so the admin page behind the map would scroll along with every zoom.
	 */
	useEffect(() => {
		const outer = outerRef.current;
		if (!outer || !interactive) return;

		const onWheel = (event: WheelEvent): void => {
			event.preventDefault();
			const rect = outer.getBoundingClientRect();
			const d = {
				x: event.clientX - (rect.left + rect.width / 2),
				y: event.clientY - (rect.top + rect.height / 2),
			};
			// Exponential in the wheel delta, so a trackpad's many small events and a mouse's few
			// large ones travel at about the same rate.
			const factor = Math.exp(-event.deltaY / 400);
			setView(current => {
				const box = boxRef.current;
				const content = box ? { width: box.offsetWidth, height: box.offsetHeight } : { width: 0, height: 0 };
				return clampPan(zoomAbout(current, current.scale * factor, d), content);
			});
		};

		outer.addEventListener("wheel", onWheel, { passive: false });
		return () => outer.removeEventListener("wheel", onWheel);
	}, [interactive]);

	// Watched rather than measured once: the admin's sidebar collapses, the window resizes, and a
	// map sized against a stale box is the kind of wrong that only shows up on someone else's
	// screen.
	useEffect(() => {
		const outer = outerRef.current;
		if (!outer) return;

		const measure = (rect: { width: number; height: number }): void =>
			setSpace(current =>
				current.width === rect.width && current.height === rect.height
					? current
					: { width: rect.width, height: rect.height },
			);

		const observer = new ResizeObserver(entries => {
			const entry = entries[0];
			if (entry) measure(entry.contentRect);
		});
		observer.observe(outer);
		measure(outer.getBoundingClientRect());

		return () => observer.disconnect();
	}, []);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;

		const bitmap = renderFloor(map, {
			...(hiddenRooms ? { hiddenLocally: hiddenRooms, hideOrphanedWalls: true } : {}),
			selectedRooms,
		});

		canvas.width = bitmap.width;
		canvas.height = bitmap.height;

		const context = canvas.getContext("2d");
		if (!context) return;

		// Reset on every draw: resizing a canvas clears the context's settings, and a smoothed map
		// blurs the cell edges the pixel-per-cell approach exists to keep sharp.
		context.imageSmoothingEnabled = false;
		context.putImageData(new ImageData(bitmap.rgba, bitmap.width, bitmap.height), 0, 0);
	}, [map, hiddenRooms, selectedRooms]);

	// Carpets: a canvas of their own at twice the resolution, for the checkerboard of half cells.
	useEffect(() => {
		const canvas = carpetRef.current;
		if (!canvas) return;
		const bitmap = carpetBitmap(map, carpetCells(map), hiddenRooms);
		const context = canvas.getContext("2d");
		if (!bitmap || !context) {
			canvas.width = 0;
			canvas.height = 0;
			return;
		}
		canvas.width = bitmap.width;
		canvas.height = bitmap.height;
		context.putImageData(new ImageData(bitmap.rgba, bitmap.width, bitmap.height), 0, 0);
	}, [map, hiddenRooms]);

	// The rooms the mopping band may cover, as an image for an SVG mask.
	useEffect(() => {
		const bitmap = mopMaskBitmap(map, hiddenRooms);
		const canvas = document.createElement("canvas");
		canvas.width = bitmap.width;
		canvas.height = bitmap.height;
		const context = canvas.getContext("2d");
		if (!context) return;
		context.putImageData(new ImageData(bitmap.rgba, bitmap.width, bitmap.height), 0, 0);
		setMaskUrl(canvas.toDataURL());
	}, [map, hiddenRooms]);

	const overlays = useMemo(() => buildOverlays(map, hiddenRooms), [map, hiddenRooms]);

	// The trail as far as the robot has driven it, and the robot where the playback has it.
	const playback = useTrailPlayback(map, liveRobot ?? null);
	const trail = useMemo(() => buildTrailPaths(map, playback.cut), [map, playback.cut]);
	// The adapter sends no map rotation (`mra`), so the width is always the side that counts.
	const sizes = markerSizes(width, height);
	const charger = liveCharger ?? map.header.charger;

	/**
	 * Label size in cell units, so that it comes out at {@link LABEL_PX} on screen.
	 *
	 * The labels are sized in screen pixels rather than map units, the way the widget's `.rlabel`
	 * is. Scaling them with the map instead looks fine on one map and wrong on the next: the same
	 * fraction of a small single room and of a whole floor are wildly different amounts of text.
	 *
	 * Until the box has been measured there is nothing sensible to scale against, so the labels
	 * wait one frame rather than appearing at the wrong size and jumping.
	 */
	// Divided by the zoom as well: the labels keep a constant size on screen, so zooming in shows
	// more map rather than bigger words. The widget does the same through `skaliereMarken`.
	const sideways = rotation === 90 || rotation === 270;

	// Both sides in pixels, so that canvas and overlay are drawn on exactly the same rectangle.
	const fit = fitMap(space, width, height, sideways);

	// One map cell is `fit.scale` pixels before zooming; the labels keep their size on screen.
	const fontSize = fit.scale > 0 ? LABEL_PX / (fit.scale * view.scale) : 0;
	/** Turns a label or badge back upright about its own centre. */
	const upright = (x: number, y: number): string | undefined =>
		rotation ? `rotate(${-rotation} ${x.toFixed(2)} ${y.toFixed(2)})` : undefined;

	/**
	 * Finds the room at a point.
	 *
	 * Works off the box's *current* rectangle, which already includes the zoom and pan, because a
	 * CSS transform moves what `getBoundingClientRect` reports. So this needs to know nothing
	 * about the viewport - and cannot disagree with it.
	 *
	 * The y flip is the floor renderer's, applied in reverse: without it a click near the top
	 * would select the room at the bottom.
	 */
	const roomAt = (clientX: number, clientY: number): number | null => {
		const box = boxRef.current;
		if (!box) return null;

		const rect = box.getBoundingClientRect();
		if (rect.width === 0 || rect.height === 0) return null;

		// The box is upright; the map inside it may be turned. Back to the map's own fractions first.
		const onMap = unrotate((clientX - rect.left) / rect.width, (clientY - rect.top) / rect.height, rotation);
		const x = Math.floor(onMap.x * width);
		const imageY = Math.floor(onMap.y * height);
		if (x < 0 || x >= width || imageY < 0 || imageY >= height) return null;

		const cell = map.cells[(height - 1 - imageY) * width + x];
		// Walls, floor and empty space are not rooms; a press there is not a miss to report.
		return cell != null && isSegment(cell) ? cell : null;
	};

	/** The map's fitted size, which is what the pan limits are measured against. */
	const contentSize = (): { width: number; height: number } => {
		const box = boxRef.current;
		if (!box) return { width: 0, height: 0 };
		return { width: box.offsetWidth, height: box.offsetHeight };
	};

	const applyZoom = (nextScale: number, cursor?: { clientX: number; clientY: number }): void => {
		const outer = outerRef.current;
		if (!outer) return;

		const rect = outer.getBoundingClientRect();
		// Offset from the container's centre, which is what `zoomAbout` is written against.
		const d = cursor
			? { x: cursor.clientX - (rect.left + rect.width / 2), y: cursor.clientY - (rect.top + rect.height / 2) }
			: { x: 0, y: 0 };

		setView(current => clampPan(zoomAbout(current, nextScale, d), contentSize()));
	};

	const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>): void => {
		// Only the primary button drags; a right-click belongs to the browser.
		if (event.button !== 0) return;
		dragRef.current = {
			startX: event.clientX,
			startY: event.clientY,
			originX: view.x,
			originY: view.y,
			pointerId: event.pointerId,
		};
		event.currentTarget.setPointerCapture(event.pointerId);
	};

	const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>): void => {
		const drag = dragRef.current;
		if (!drag || drag.pointerId !== event.pointerId) return;

		const delta = { x: event.clientX - drag.startX, y: event.clientY - drag.startY };
		setView(current =>
			clampPan({ scale: current.scale, x: drag.originX + delta.x, y: drag.originY + delta.y }, contentSize()),
		);
	};

	const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>): void => {
		const drag = dragRef.current;
		dragRef.current = null;
		if (!drag || drag.pointerId !== event.pointerId) return;

		// A press that barely moved is a click on a room, not a pan that went nowhere. Without the
		// tolerance, tapping a room on a touch screen would almost never register.
		if (onRoomClick && isClick({ x: drag.startX, y: drag.startY }, { x: event.clientX, y: event.clientY })) {
			const room = roomAt(event.clientX, event.clientY);
			if (room != null) onRoomClick(room);
		}
	};

	return (
		<Box
			ref={outerRef}
			onPointerDown={interactive ? handlePointerDown : undefined}
			onPointerMove={interactive ? handlePointerMove : undefined}
			onPointerUp={interactive ? handlePointerUp : undefined}
			onPointerCancel={() => {
				dragRef.current = null;
			}}
			sx={{
				position: "relative",
				width: "100%",
				height: "100%",
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				// The zoomed map must not spill over the sidebar or the page.
				overflow: "hidden",
				// Otherwise a drag selects the page text behind the map, and on a touch screen the
				// browser pans its own scroll container instead of the map.
				userSelect: "none",
				// Only while the map takes gestures itself. As a picture it must let them through, or on a
				// phone the dashboard around a map tile could no longer be scrolled.
				touchAction: interactive ? "none" : "auto",
				// A picture has no cursor of its own; the tile around it decides.
				cursor: !interactive ? "inherit" : onRoomClick ? "pointer" : "grab",
				// Through CSS rather than from `dragRef`, which is a ref and so does not re-render.
				"&:active": { cursor: "grabbing" },
			}}
		>
			<Box
				ref={boxRef}
				sx={{
					position: "relative",
					// Both sides in pixels, so the map keeps its shape - see `fit` above.
					width: fit.width,
					height: fit.height,
					flex: "0 0 auto",
					transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
					// Cell edges stay hard under magnification; the browser would otherwise smooth
					// the canvas as part of the transform.
					imageRendering: "pixelated",
				}}
			>
				{/*
				 * The map itself, turned inside the box. For a quarter turn it is as wide as the box is
				 * high and the other way round, which the percentages below work out.
				 */}
				<Box
					sx={{
						position: "absolute",
						left: "50%",
						top: "50%",
						width: sideways ? `${(width / height) * 100}%` : "100%",
						height: sideways ? `${(height / width) * 100}%` : "100%",
						transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
					}}
				>
					<canvas
						ref={canvasRef}
						style={{
							width: "100%",
							height: "100%",
							display: "block",
							imageRendering: "pixelated",
						}}
					/>
					<canvas
						ref={carpetRef}
						style={{
							position: "absolute",
							inset: 0,
							width: "100%",
							height: "100%",
							imageRendering: "pixelated",
							pointerEvents: "none",
						}}
					/>
					<svg
						viewBox={`0 0 ${width} ${height}`}
						// Follows the box exactly, as the canvas does. With the default, any difference
						// between the box's shape and the map's would letterbox the overlay and set the
						// trail, the rooms and the markers off against the floor underneath.
						preserveAspectRatio="none"
						style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}
					>
						{/*
						 * Mopping band first, vacuum line on top. A section that does both is in each, and
						 * that overlap - the thin line running along the middle of the wide band - is what
						 * makes a vacuum-and-mop run recognisable.
						 *
						 * Widths are in map cells, so they scale with the map instead of the viewport. The
						 * band is 8 cells because Home Assistant's ratio against its own much thinner
						 * vacuum line would come out at about 11 cells here, which at 50 mm per cell is
						 * over half a metre of paint.
						 */}
						{maskUrl ? (
							<defs>
								<mask id={maskId} maskUnits="userSpaceOnUse" x={0} y={0} width={width} height={height}>
									<image
										href={maskUrl}
										x={0}
										y={0}
										width={width}
										height={height}
										style={{ imageRendering: "pixelated" }}
									/>
								</mask>
							</defs>
						) : null}

						{/* Zones and walls first, as Home Assistant layers them: rules about the floor, under everything done on it. */}
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
							const href = furnitureImage(piece.type);
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
						{fontSize > 0
							? rooms.map(room => (
									<text
										key={room.id}
										x={room.centre.x}
										y={room.centre.y}
										transform={upright(room.centre.x, room.centre.y)}
										textAnchor="middle"
										dominantBaseline="central"
										fontSize={fontSize}
										// The page's text colour outlined in its background, as the widget's
										// `.rlabel` does: legible on every room colour, on walls and on the trail,
										// in a light theme and a dark one alike. A room left out of a partial pick
										// fades with its fill, so the pick reads from the labels as well.
										fill={theme.palette.text.primary}
										stroke={theme.palette.background.default}
										strokeWidth={fontSize / 5}
										strokeLinejoin="round"
										paintOrder="stroke"
										opacity={selectedRooms && selectedRooms.size > 0 && !selectedRooms.has(room.id) ? 0.65 : 1}
										style={{ fontWeight: 800, letterSpacing: "0.2px" }}
									>
										{room.label}
									</text>
								))
							: null}

						{fontSize > 0 && roomBadges
							? rooms.map(room =>
									roomBadges.rooms.has(room.id) && !hiddenRooms?.has(room.id) ? (
										<RoomBadge
											key={`badge-${room.id}`}
											at={room.centre}
											pixel={fontSize / LABEL_PX}
											rotation={rotation}
											badges={roomBadges}
											fill={theme.palette.background.paper}
											line={theme.palette.divider}
											text={theme.palette.text.primary}
										/>
									) : null,
								)
							: null}

						{/* Above the labels, as in the widget. Charger first, so a robot standing in it is drawn on top. */}
						{charger ? (
							<Marker
								at={worldToImage(charger.x, charger.y, map.header)}
								icon={HA_ICONS.charger}
								size={sizes.charger}
								badge={stationBadge ?? null}
								rotation={rotation}
							/>
						) : null}
						{playback.robot ? (
							<Marker
								at={worldToImage(playback.robot.x, playback.robot.y, map.header)}
								icon={HA_ICONS.robot}
								size={sizes.robot}
								heading={playback.robot.heading}
								badge={robotBadge ?? null}
								rotation={rotation}
							/>
						) : null}

						{/*
						 * Sequence badges sit above the label rather than replacing it: the order only
						 * means something once you know which room it applies to. Drawn last so they are
						 * never hidden behind a label of a neighbouring room.
						 */}
						{fontSize > 0 && sequenceOrder && sequenceOrder.length > 0
							? rooms.map(room => {
									const position = sequencePosition(sequenceOrder, room.id);
									if (position == null) return null;
									return (
										<g key={`seq-${room.id}`} transform={upright(room.centre.x, room.centre.y)}>
											<circle
												cx={room.centre.x}
												cy={room.centre.y - fontSize * 1.4}
												r={fontSize * 0.75}
												fill={theme.palette.primary.main}
												stroke={theme.palette.background.default}
												strokeWidth={fontSize / 8}
											/>
											<text
												x={room.centre.x}
												y={room.centre.y - fontSize * 1.4}
												textAnchor="middle"
												dominantBaseline="central"
												fontSize={fontSize * 0.9}
												fill={theme.palette.primary.contrastText}
												style={{ fontWeight: 700 }}
											>
												{position}
											</text>
										</g>
									);
								})
							: null}
					</svg>
				</Box>
			</Box>

			{/*
			 * Controls sit outside the transformed box, so they keep their size and place while
			 * the map moves under them. Bottom right, where the widget puts them. Absent on a picture.
			 */}
			{interactive ? (
				<Stack
					spacing={0.5}
					sx={{ position: "absolute", right: 12, bottom: 12, zIndex: 1 }}
					// The buttons are inside the element that handles dragging, so a press on one would
					// otherwise start a pan as well.
					onPointerDown={event => event.stopPropagation()}
				>
					<Tooltip title={I18n.t("tab.zoom.rein")} placement="left">
						<span>
							<IconButton
								size="small"
								disabled={view.scale >= MAX_SCALE}
								onClick={() => applyZoom(view.scale * ZOOM_STEP)}
								sx={{ bgcolor: "background.paper", "&:hover": { bgcolor: "background.paper" } }}
							>
								<AddIcon fontSize="small" />
							</IconButton>
						</span>
					</Tooltip>
					<Tooltip title={I18n.t("tab.zoom.raus")} placement="left">
						<span>
							<IconButton
								size="small"
								disabled={view.scale <= MIN_SCALE}
								onClick={() => applyZoom(view.scale / ZOOM_STEP)}
								sx={{ bgcolor: "background.paper", "&:hover": { bgcolor: "background.paper" } }}
							>
								<RemoveIcon fontSize="small" />
							</IconButton>
						</span>
					</Tooltip>
					<Tooltip title={I18n.t("tab.zoom.einpassen")} placement="left">
						<span>
							<IconButton
								size="small"
								disabled={isFitted(view)}
								onClick={() => setView(FITTED)}
								sx={{ bgcolor: "background.paper", "&:hover": { bgcolor: "background.paper" } }}
							>
								<FitScreenIcon fontSize="small" />
							</IconButton>
						</span>
					</Tooltip>
				</Stack>
			) : null}
		</Box>
	);
}

interface MarkerProps {
	/** Centre, in image cells. */
	at: { x: number; y: number };
	icon: string;
	/** Edge length in cells. */
	size: number;
	/** Degrees counter-clockwise; the icon is drawn facing 0 and turned by it. */
	heading?: number | null;
	badge: Badge | null;
	/** The map's turn, undone for the badge so that "above" stays above on screen. */
	rotation: number;
}

/**
 * A robot or charger icon with its status badge.
 *
 * The badge is placed as the widget places it - behind the icon, in its corner or above it - and
 * turned with nothing: a warning sign lying on its side would read as something else.
 */
function Marker({ at, icon, size, heading, badge, rotation }: MarkerProps): React.JSX.Element {
	const box = badge ? badgeBox(badge.placement, size) : null;
	const badgeImage =
		badge && box ? (
			<image
				href={HA_ICONS[badge.icon]}
				x={box.x}
				y={box.y}
				width={box.size}
				height={box.size}
				transform={rotation ? `rotate(${-rotation})` : undefined}
			/>
		) : null;

	return (
		<g transform={`translate(${at.x.toFixed(2)} ${at.y.toFixed(2)})`}>
			{badge?.placement === "behind" ? badgeImage : null}
			<image
				href={icon}
				x={-size / 2}
				y={-size / 2}
				width={size}
				height={size}
				// The image's y axis points down, the world's up: a counter-clockwise heading is a
				// negative rotation here.
				transform={heading != null ? `rotate(${(-heading).toFixed(1)})` : undefined}
			/>
			{badge && badge.placement !== "behind" ? badgeImage : null}
		</g>
	);
}

interface RoomBadgeProps {
	at: { x: number; y: number };
	/** One screen pixel in map cells, so the badge keeps its size on screen like the labels. */
	pixel: number;
	badges: RoomBadges;
	fill: string;
	line: string;
	text: string;
	/** The map's turn, undone so the badge reads upright and sits under its label on screen. */
	rotation: number;
}

/** A pill under a room's name, laid out in screen pixels as the widget lays it out. */
function RoomBadge({ at, pixel, badges, fill, line, text, rotation }: RoomBadgeProps): React.JSX.Element | null {
	const layout = layoutBadge(badges);
	if (!layout) return null;
	return (
		<g
			transform={`translate(${at.x} ${at.y}) rotate(${-rotation}) scale(${pixel}) translate(0 ${BADGE.height}) scale(${BADGE.scale})`}
		>
			<rect
				x={-layout.width / 2}
				y={-BADGE.height / 2}
				width={layout.width}
				height={BADGE.height}
				rx={BADGE.height / 2}
				fill={fill}
				stroke={line}
				strokeWidth={1}
				opacity={0.96}
			/>
			{layout.parts.map(part => (
				<g key={part.x}>
					<g
						transform={`translate(${part.x} ${-BADGE.icon / 2}) scale(${BADGE.icon / 24})`}
						fill="none"
						stroke={text}
						// Thicker than Lucide's 2: at 14 pixels the thin stroke all but disappears.
						strokeWidth={2.4}
						strokeLinecap="round"
						strokeLinejoin="round"
					>
						{part.icon.map(d => (
							<path key={d} d={d} />
						))}
					</g>
					<text
						x={part.x + BADGE.icon + BADGE.gap}
						y={0}
						dominantBaseline="central"
						fontSize={12}
						fill={text}
						style={{ fontWeight: 800 }}
					>
						{part.value}
					</text>
				</g>
			))}
		</g>
	);
}
