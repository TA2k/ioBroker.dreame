/**
 * Runs a {@link TrailPlayback} on animation frames for one map view.
 *
 * Each new map is fed in, each position report handed on, and frames are requested only while
 * something still moves - an idle map costs nothing. A user who asked the system for reduced
 * motion gets every change at once, as the widget's "smooth" switch turned off did.
 */

import { useEffect, useRef, useState } from "react";
import { TrailPlayback } from "./playback";
import type { PlaybackFrame, WorldPoint } from "./playback";
import type { MapPackage } from "./mapPackage";

const STILL: PlaybackFrame = { head: 0, robot: null, cut: null, moving: false };

function prefersReducedMotion(): boolean {
	return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

/**
 * @param live the live position state, where the adapter provides one; it moves the robot
 *   between maps.
 */
export function useTrailPlayback(map: MapPackage, live: WorldPoint | null): PlaybackFrame {
	const playbackRef = useRef<TrailPlayback | null>(null);
	playbackRef.current ??= new TrailPlayback();
	const [frame, setFrame] = useState<PlaybackFrame>(STILL);
	const requestRef = useRef<number | null>(null);

	const animate = (): void => {
		if (requestRef.current != null) return;
		const step = (): void => {
			requestRef.current = null;
			const playback = playbackRef.current!;
			// Reduced motion: jump straight to where the animation would end.
			const next = playback.frame(prefersReducedMotion() ? performance.now() + 60_000 : performance.now());
			setFrame(next);
			if (next.moving) requestRef.current = requestAnimationFrame(step);
		};
		requestRef.current = requestAnimationFrame(step);
	};

	useEffect(() => {
		const now = performance.now();
		const heading = map.meta.ha?.robotAngle ?? null;
		playbackRef.current!.feed(map.meta.trpts ?? [], heading, now);
		playbackRef.current!.report(map.header.robot, heading, now);
		animate();
		// `animate` only touches refs and a state setter, all stable.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [map]);

	useEffect(() => {
		if (!live) return;
		playbackRef.current!.report(live, map.meta.ha?.robotAngle ?? null, performance.now());
		animate();
		// A new map re-reports its own position above; this is for reports between maps.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [live?.x, live?.y]);

	useEffect(
		() => () => {
			if (requestRef.current != null) cancelAnimationFrame(requestRef.current);
		},
		[],
	);

	return frame;
}
