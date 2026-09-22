/**
 * Plays the trail back as the robot drives it, instead of letting it jump.
 *
 * The robot sends a map every few seconds. Drawn as it comes, the trail grows by half a metre at
 * once and the robot marker jumps to the end of it. The widget plays each new piece instead: the
 * trail grows only behind the robot, and the robot drives along it, facing where it goes, turning
 * to the reported heading when it arrives - so that it arrives just as the next map comes in.
 * Without a trail - driving home, which reports positions but no path - it glides from one
 * reported position to the next.
 *
 * Ported from the widget (`www/js/karte/render.js`, playhead and glide), whose measurements on
 * real frames the constants below keep. Time is passed in rather than read, so the whole thing
 * can be tested without an animation frame.
 *
 * Coordinates are world millimetres throughout; the view converts them.
 */

import { PathType } from "./trail";
import type { TrailCut } from "./trail";
import type { PathPoint } from "./mapPackage";

/**
 * Longest distance still played rather than jumped, in millimetres.
 *
 * The first map after loading brings the whole trail so far, and a map switch mid-job brings a
 * new one; playing either would send the robot racing across the home. Real frames add about
 * 530 mm, 902 at most, so 2500 leaves ample room.
 */
export const MAX_DRIVE_MM = 2500;
/** A frame's duration stays within these bounds, whatever the measured gap between maps. */
export const MIN_DURATION_MS = 1000;
export const MAX_DURATION_MS = 5000;
/** How quickly the displayed heading follows the target, as a time constant. */
const TURN_TAU_MS = 90;
/**
 * Share of a glide after which the new heading has been reached.
 *
 * A robot with two driven wheels cannot move sideways: it turns first and then drives. Spreading
 * the turn over the whole glide, the obvious choice, is the one never right.
 */
const GLIDE_TURN_SHARE = 0.3;
/** Reported positions closer than this to the displayed one are not worth a glide. */
const GLIDE_MIN_MM = 5;

export interface WorldPoint {
	x: number;
	y: number;
}

/** Where the robot is drawn, and which way it faces in degrees - null while unknown. */
export interface RobotPose extends WorldPoint {
	heading: number | null;
}

/** Whether a point starts a new section: the robot got there without drawing a line. */
export function startsSection(point: PathPoint): boolean {
	return point[2] !== PathType.CONTINUE;
}

/**
 * Distance along the trail up to each point.
 *
 * Repositioning moves count: the robot does drive them, the device merely leaves them out of the
 * drawing.
 */
export function cumulativeDistances(points: readonly PathPoint[]): number[] {
	const distances = new Array<number>(points.length);
	if (points.length) distances[0] = 0;
	for (let i = 1; i < points.length; i++) {
		const a = points[i - 1]!;
		const b = points[i]!;
		distances[i] = distances[i - 1]! + Math.hypot(b[0] - a[0], b[1] - a[1]);
	}
	return distances;
}

/** How many points two trails share from the start. */
export function commonPrefix(a: readonly PathPoint[], b: readonly PathPoint[]): number {
	const n = Math.min(a.length, b.length);
	let i = 0;
	while (i < n && a[i]![0] === b[i]![0] && a[i]![1] === b[i]![1] && a[i]![2] === b[i]![2]) i++;
	return i;
}

/** A point on the trail, at a distance along it. */
export interface TrailPosition extends WorldPoint {
	/** Index of the point the position is heading for. */
	index: number;
	/** Direction of travel in degrees, counter-clockwise from +x; null where it has none. */
	heading: number | null;
	/** True on a repositioning move: the robot drives it, but it leaves no line. */
	onBreak: boolean;
}

export function positionAt(
	points: readonly PathPoint[],
	distances: readonly number[],
	distance: number,
): TrailPosition | null {
	if (!points.length) return null;
	const first = points[0]!;
	if (distance <= 0) return { x: first[0], y: first[1], index: 0, heading: null, onBreak: false };

	for (let i = 1; i < points.length; i++) {
		if (distances[i]! < distance) continue;
		const a = points[i - 1]!;
		const b = points[i]!;
		const onBreak = startsSection(b);
		const length = distances[i]! - distances[i - 1]!;
		if (length <= 0) return { x: b[0], y: b[1], index: i, heading: null, onBreak };
		const t = (distance - distances[i - 1]!) / length;
		return {
			x: a[0] + (b[0] - a[0]) * t,
			y: a[1] + (b[1] - a[1]) * t,
			index: i,
			heading: (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI,
			onBreak,
		};
	}

	const last = points[points.length - 1]!;
	return { x: last[0], y: last[1], index: points.length - 1, heading: null, onBreak: false };
}

/**
 * Where the head stands once a new trail has arrived.
 *
 * It never moves back: the robot's latest point hangs off the end of every trail and is replaced
 * in the next, so pulling the head back to the last shared point would make the robot drive
 * forward, jump back and drive forward again. A trail sharing nothing with the old one is a new
 * job, which starts from its beginning; the first trail at all, or a gap too long to drive, is
 * jumped to its end.
 */
export function headAfterUpdate(
	oldPoints: readonly PathPoint[],
	oldHead: number,
	newPoints: readonly PathPoint[],
	newDistances: readonly number[],
): number {
	const total = newDistances.length ? newDistances[newDistances.length - 1]! : 0;
	let head = commonPrefix(oldPoints, newPoints) === 0 && oldPoints.length ? 0 : Math.min(oldHead, total);
	if (!oldPoints.length || total - head > MAX_DRIVE_MM) head = total;
	return head;
}

/** Shortest-way interpolation between two headings. */
export function interpolateHeading(from: number | null, to: number | null, t: number): number | null {
	if (from == null) return to;
	if (to == null) return from;
	return from + shortestTurn(from, to) * t;
}

/** Signed difference from one heading to another, the short way round, in (-180, 180]. */
export function shortestTurn(from: number, to: number): number {
	let d = to - from;
	while (d > 180) d -= 360;
	while (d <= -180) d += 360;
	return d;
}

/** One animation frame's worth of output. */
export interface PlaybackFrame {
	/** Distance along the trail drawn so far; the whole trail when nothing is being played. */
	head: number;
	robot: RobotPose | null;
	/** Where the drawn trail stops; null for the whole trail. */
	cut: TrailCut | null;
	/** True while another frame would still change something. */
	moving: boolean;
}

export class TrailPlayback {
	private points: readonly PathPoint[] = [];
	private distances: number[] = [];
	private head = 0;

	private playing = false;
	private from = 0;
	private to = 0;
	private startedAt = 0;
	private duration = 3000;

	private frameGap = 3000;
	private lastMapAt = 0;

	/** Reported heading of the previous map and of the current one; played between them. */
	private headingFrom: number | null = null;
	private headingTo: number | null = null;

	private shown: RobotPose | null = null;
	private lastFrameAt = 0;

	private glide: {
		from: WorldPoint;
		to: WorldPoint;
		headingFrom: number | null;
		headingTo: number;
		startedAt: number;
	} | null = null;

	/**
	 * A new map has arrived.
	 *
	 * @param reportedHeading the heading in the map's header, which holds for the moment the map
	 *   was taken - the end of the piece about to be played.
	 */
	public feed(points: readonly PathPoint[], reportedHeading: number | null, now: number): void {
		if (reportedHeading != null) {
			this.headingFrom = this.headingTo ?? reportedHeading;
			this.headingTo = reportedHeading;
		}

		const distances = cumulativeDistances(points);
		this.head = headAfterUpdate(this.points, this.head, points, distances);
		this.points = points;
		this.distances = distances;

		// Each piece lasts as long as maps are apart, so the robot arrives as the next one comes.
		if (this.lastMapAt) {
			const gap = now - this.lastMapAt;
			if (gap > 500 && gap < 15000) this.frameGap = this.frameGap * 0.7 + gap * 0.3;
		}
		this.lastMapAt = now;

		const total = this.total();
		this.from = this.head;
		this.to = total;
		this.startedAt = now;
		this.duration = Math.max(MIN_DURATION_MS, Math.min(MAX_DURATION_MS, this.frameGap));
		this.playing = this.to > this.from;
		if (this.playing) {
			this.glide = null;
		} else {
			this.head = total;
		}
	}

	/**
	 * A position report: the map's header, or the live position state.
	 *
	 * While a piece is being played the playhead leads the marker and the report is left alone;
	 * two sources pulling at one marker would make it shake.
	 */
	public report(position: WorldPoint | null, heading: number | null, now: number): void {
		if (!position || this.playing) return;
		const start = this.shown;
		if (!start) {
			this.shown = { ...position, heading };
			return;
		}
		if (Math.hypot(position.x - start.x, position.y - start.y) < GLIDE_MIN_MM) {
			if (heading != null && !this.glide) this.shown = { ...start, heading };
			return;
		}

		// Facing the way it drives - or away from it, where the reported heading says it reverses,
		// which it does when parking.
		const travel = (Math.atan2(position.y - start.y, position.x - start.x) * 180) / Math.PI;
		const reversing = heading != null && Math.abs(shortestTurn(travel, heading)) > 90;
		const target = reversing ? travel + 180 : travel;
		this.glide = {
			from: { x: start.x, y: start.y },
			to: { ...position },
			headingFrom: start.heading ?? target,
			headingTo: target,
			startedAt: now,
		};
		this.duration = Math.max(MIN_DURATION_MS, Math.min(MAX_DURATION_MS, this.frameGap));
	}

	public frame(now: number): PlaybackFrame {
		if (this.playing) return this.playFrame(now);
		if (this.glide) return this.glideFrame(now);
		return { head: this.total(), robot: this.shown, cut: null, moving: false };
	}

	/** The trail up to the head, or null where the head is at its end. */
	private cut(): TrailCut | null {
		if (this.head >= this.total()) return null;
		let lastIndex = 0;
		while (lastIndex + 1 < this.distances.length && this.distances[lastIndex + 1]! <= this.head) lastIndex++;
		const at = positionAt(this.points, this.distances, this.head);
		return { lastIndex, head: at && !at.onBreak ? { x: at.x, y: at.y, index: at.index } : null };
	}

	private playFrame(now: number): PlaybackFrame {
		const t = Math.min(1, (now - this.startedAt) / this.duration);
		this.head = this.from + (this.to - this.from) * t;
		const at = positionAt(this.points, this.distances, this.head);
		if (!at) {
			this.playing = false;
			return { head: this.head, robot: this.shown, cut: null, moving: false };
		}

		// Along the way the trail's own direction; at the end, the heading the device reported.
		const target = at.heading == null || t >= 1 ? interpolateHeading(this.headingFrom, this.headingTo, t) : at.heading;

		// Followed smoothly rather than taken: within a trail segment the direction is constant and
		// it jumps at every point - by a median of 45 degrees of grid noise on real trails.
		const dt = this.lastFrameAt ? Math.min(200, now - this.lastFrameAt) : 16;
		this.lastFrameAt = now;
		let heading = this.shown?.heading ?? target;
		if (heading != null && target != null) {
			const d = shortestTurn(heading, target);
			heading = Math.abs(d) < 0.3 ? target : heading + d * (1 - Math.exp(-dt / TURN_TAU_MS));
		}
		this.shown = { x: at.x, y: at.y, heading };

		const turned = heading == null || target == null || Math.abs(shortestTurn(heading, target)) < 0.3;
		const moving = t < 1 || !turned;
		if (!moving) this.playing = false;
		return { head: this.head, robot: this.shown, cut: this.cut(), moving };
	}

	private glideFrame(now: number): PlaybackFrame {
		const glide = this.glide!;
		const t = Math.min(1, (now - glide.startedAt) / this.duration);
		this.shown = {
			x: glide.from.x + (glide.to.x - glide.from.x) * t,
			y: glide.from.y + (glide.to.y - glide.from.y) * t,
			heading: interpolateHeading(glide.headingFrom, glide.headingTo, Math.min(1, t / GLIDE_TURN_SHARE)),
		};
		if (t >= 1) this.glide = null;
		return { head: this.total(), robot: this.shown, cut: null, moving: t < 1 };
	}

	private total(): number {
		return this.distances.length ? this.distances[this.distances.length - 1]! : 0;
	}
}
