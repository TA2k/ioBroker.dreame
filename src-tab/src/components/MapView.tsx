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
import { useEffect, useMemo, useRef, useState } from "react";
import { Box, IconButton, Stack, Tooltip, useTheme } from "@mui/material";
import { Add as AddIcon, Remove as RemoveIcon, FitScreen as FitScreenIcon } from "@mui/icons-material";

import { I18n } from "@iobroker/gui-components";

import { labelColour, renderFloor } from "../map/floorBitmap";
import { buildTrailPaths } from "../map/trail";
import type { LabelledRoom } from "../map/rooms";
import type { MapPackage } from "../map/mapPackage";
import { isSegment } from "../map/mapPackage";
import { sequencePosition } from "../panels/sequence";
import { FITTED, MAX_SCALE, MIN_SCALE, ZOOM_STEP, clampPan, isClick, isFitted, zoomAbout } from "../map/viewport";
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
	 * Absent means the map is not interactive, which is the normal state - rooms only respond
	 * while the sequence is being edited.
	 */
	onRoomClick?: (roomId: number) => void;
	/** Room ids in cleaning order, shown as numbered badges. Empty or absent draws none. */
	sequenceOrder?: readonly number[];
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
	interactive = true,
}: MapViewProps): React.JSX.Element {
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const boxRef = useRef<HTMLDivElement | null>(null);
	const outerRef = useRef<HTMLDivElement | null>(null);
	const [boxWidth, setBoxWidth] = useState(0);
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
	// label sized against a stale width is the kind of wrong that only shows up on someone else's
	// screen.
	useEffect(() => {
		const box = boxRef.current;
		if (!box) return;

		const observer = new ResizeObserver(entries => {
			const entry = entries[0];
			if (entry) setBoxWidth(entry.contentRect.width);
		});
		observer.observe(box);
		setBoxWidth(box.getBoundingClientRect().width);

		return () => observer.disconnect();
	}, []);

	useEffect(() => {
		const canvas = canvasRef.current;
		if (!canvas) return;

		const bitmap = renderFloor(map, hiddenRooms ? { hiddenLocally: hiddenRooms, hideOrphanedWalls: true } : {});

		canvas.width = bitmap.width;
		canvas.height = bitmap.height;

		const context = canvas.getContext("2d");
		if (!context) return;

		// Reset on every draw: resizing a canvas clears the context's settings, and a smoothed map
		// blurs the cell edges the pixel-per-cell approach exists to keep sharp.
		context.imageSmoothingEnabled = false;
		context.putImageData(new ImageData(bitmap.rgba, bitmap.width, bitmap.height), 0, 0);
	}, [map, hiddenRooms]);

	const trail = useMemo(() => buildTrailPaths(map), [map]);

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
	const fontSize = boxWidth > 0 ? (LABEL_PX * width) / (boxWidth * view.scale) : 0;

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

		const x = Math.floor(((clientX - rect.left) / rect.width) * width);
		const imageY = Math.floor(((clientY - rect.top) / rect.height) * height);
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
					aspectRatio: `${width} / ${height}`,
					maxWidth: "100%",
					maxHeight: "100%",
					// Without a width the flex parent gives an aspect-ratio box no size to start from.
					width: "100%",
					transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`,
					// Cell edges stay hard under magnification; the browser would otherwise smooth
					// the canvas as part of the transform.
					imageRendering: "pixelated",
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
				<svg
					viewBox={`0 0 ${width} ${height}`}
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
					{trail.mop ? (
						<path
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
									textAnchor="middle"
									dominantBaseline="central"
									fontSize={fontSize}
									// The room's own colour taken most of the way to black, so a label belongs
									// to its room by hue as well as by position, outlined in the page
									// background so it stays legible where it crosses a wall or the trail.
									fill={labelColour(room.id, map.meta.ha?.colorIndex)}
									stroke={theme.palette.background.default}
									strokeWidth={fontSize / 5}
									paintOrder="stroke"
									style={{ fontWeight: 800, letterSpacing: "0.2px" }}
								>
									{room.label}
								</text>
							))
						: null}

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
									<g key={`seq-${room.id}`}>
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
