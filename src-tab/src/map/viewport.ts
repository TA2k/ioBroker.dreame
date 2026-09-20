/**
 * Zoom and pan arithmetic for the map.
 *
 * Pure functions over a {@link Viewport}, so the fiddly parts - keeping the point under the
 * cursor still while zooming, and stopping the map being dragged off the screen - can be checked
 * without a browser. Getting either subtly wrong produces a map that works until somebody zooms
 * into a corner.
 *
 * ## The model
 *
 * The map sits centred in its container and is drawn with `transform: translate(x, y) scale(s)`
 * about its own centre. So `x` and `y` are an offset of the map's centre from the container's
 * centre, in screen pixels, and they are *not* scaled by `s` - CSS applies the translation after
 * the scale in this order.
 */

/** Current zoom and offset. */
export interface Viewport {
	/** 1 means the map fits its container exactly. */
	scale: number;
	/** Offset of the map's centre from the container's centre, in screen pixels. */
	x: number;
	y: number;
}

/** The starting view: fitted, centred. */
export const FITTED: Viewport = { scale: 1, x: 0, y: 0 };

/**
 * Zoom limits.
 *
 * Below 1 the map would be smaller than the space it has, which is only ever a way to lose it.
 * The upper bound is where a 50 mm cell fills most of a finger - past that there is nothing more
 * to see, because the data has no more detail.
 */
export const MIN_SCALE = 1;
export const MAX_SCALE = 12;

/** How far the view moves per button press. */
export const ZOOM_STEP = 1.4;

export function clampScale(scale: number): number {
	if (!Number.isFinite(scale)) return MIN_SCALE;
	return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

/**
 * Zooms while holding one point still.
 *
 * Derivation, with `d` the cursor's offset from the container's centre: a point under the cursor
 * sits at `(d - x) / s` in the map's own coordinates. After the zoom it must still be under the
 * cursor, so `x' = d - s' * (d - x) / s`.
 *
 * Without this the map zooms about its centre, and zooming into a corner walks the thing you
 * were looking at off the screen.
 *
 * @param view Current viewport.
 * @param nextScale Desired scale; clamped.
 * @param d Cursor offset from the container's centre, in screen pixels.
 */
export function zoomAbout(view: Viewport, nextScale: number, d: { x: number; y: number }): Viewport {
	const scale = clampScale(nextScale);
	if (scale === view.scale) return view;

	const ratio = scale / view.scale;
	return {
		scale,
		x: d.x - ratio * (d.x - view.x),
		y: d.y - ratio * (d.y - view.y),
	};
}

/**
 * Keeps the map from being dragged out of its container.
 *
 * At scale 1 the map fits, so there is nowhere to go and the offset is forced to zero - otherwise
 * a stray drag leaves the map sitting off-centre with no way to tell that it is. Beyond that the
 * offset is limited to the overhang, which keeps an edge of the map against an edge of the
 * container rather than letting it drift into empty space.
 *
 * @param content The map's fitted size in screen pixels, i.e. at scale 1.
 */
export function clampPan(
	view: Viewport,
	content: { width: number; height: number },
): Viewport {
	if (view.scale <= MIN_SCALE) return { scale: view.scale, x: 0, y: 0 };

	// How far the scaled map extends past its fitted size, halved because the offset is measured
	// from the centre in both directions.
	const limitX = (content.width * (view.scale - 1)) / 2;
	const limitY = (content.height * (view.scale - 1)) / 2;

	return {
		scale: view.scale,
		x: Math.min(limitX, Math.max(-limitX, view.x)),
		y: Math.min(limitY, Math.max(-limitY, view.y)),
	};
}

/** Moves the view by a drag delta, in screen pixels. */
export function panBy(view: Viewport, delta: { x: number; y: number }): Viewport {
	return { scale: view.scale, x: view.x + delta.x, y: view.y + delta.y };
}

/** True where the view is untouched, i.e. the fit button would do nothing. */
export function isFitted(view: Viewport): boolean {
	return view.scale === FITTED.scale && view.x === FITTED.x && view.y === FITTED.y;
}

/**
 * How far a pointer may travel and still count as a click rather than a drag.
 *
 * A few pixels of movement between press and release is a steady hand missing, not an attempt to
 * pan - and on a touch screen it is unavoidable. Without this, tapping a room while the sequence
 * is being edited would frequently do nothing.
 */
export const CLICK_SLOP_PX = 4;

/** True where a press and release that far apart should be treated as a click. */
export function isClick(from: { x: number; y: number }, to: { x: number; y: number }): boolean {
	return Math.hypot(to.x - from.x, to.y - from.y) <= CLICK_SLOP_PX;
}
