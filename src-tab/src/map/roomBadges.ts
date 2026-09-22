/**
 * The badge under a room's name: what the room is in for, in symbols.
 *
 * Suction level and water amount, each only where the mode uses it - no drop means no mopping.
 * Shown, as in the widget, on the rooms picked for the next start, or during a job on the rooms of
 * that job, never on every room: badges everywhere make a busy map.
 *
 * The values are the global ones. The widget shows them for every room too: its editor for
 * per-room settings was never built, so there are no per-room values to show.
 *
 * Icons: Lucide (ISC License, https://lucide.dev) - `droplet`, and the widget's "suction" derived
 * from Lucide's `air-vent`. Drawn in a 24 by 24 grid with a round 2px stroke.
 */

export const SUCTION_ICON = [
	"M18 17.5a2.5 2.5 0 1 1-4 2.03v-6",
	"m12 13.5 2-2 2 2",
	"M6 12H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2",
	"M6 8h12",
	"M6.6 15.572A2 2 0 1 0 10 17v-5.5",
	"m8 13.5 2-2 2 2",
] as const;

export const WATER_ICON = [
	"M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z",
] as const;

/** What the badges show. */
export interface RoomBadges {
	rooms: ReadonlySet<number>;
	/** Suction level as the app counts it, 1 to 4; null where the mode does not vacuum. */
	suction: number | null;
	/** Water amount, 1 to 32; null where the mode does not mop. */
	wetness: number | null;
}

/** The widget's badge metrics, in screen pixels. */
export const BADGE = { height: 22, icon: 14, digit: 7, gap: 2, spacing: 8, margin: 8, scale: 1.05 } as const;

export interface BadgePart {
	icon: readonly string[];
	value: string;
	/** Left edge of the icon, relative to the badge's centre. */
	x: number;
}

/** Lays out a badge's parts around its centre; null where it would be empty. */
export function layoutBadge(badges: RoomBadges): { width: number; parts: BadgePart[] } | null {
	const entries: { icon: readonly string[]; value: string }[] = [];
	if (badges.suction != null) entries.push({ icon: SUCTION_ICON, value: String(badges.suction) });
	if (badges.wetness != null) entries.push({ icon: WATER_ICON, value: String(badges.wetness) });
	if (!entries.length) return null;

	let width = BADGE.margin * 2 - BADGE.spacing;
	for (const entry of entries) width += BADGE.icon + BADGE.spacing + BADGE.gap + entry.value.length * BADGE.digit;

	const parts: BadgePart[] = [];
	let x = -width / 2 + BADGE.margin;
	for (const entry of entries) {
		parts.push({ ...entry, x });
		x += BADGE.icon + BADGE.gap + entry.value.length * BADGE.digit + BADGE.spacing;
	}
	return { width, parts };
}
