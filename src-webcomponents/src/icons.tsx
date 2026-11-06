/**
 * The icons of the element, as inline SVG in `currentColor` - the Material icons the native views take from
 * `@mui/icons-material`, and the robot the status tile draws itself (`src-tab/src/components/StatusTile.tsx`).
 */
import type { JSX } from "react";

const PATHS = {
	play: ["M8 5v14l11-7z"],
	pause: ["M6 19h4V5H6v14zm8-14v14h4V5h-4z"],
	stop: ["M6 6h12v12H6z"],
	dock: ["M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"],
	batteryFull: [
		"M15.67 4H14V2h-4v2H8.33C7.6 4 7 4.6 7 5.33v15.33C7 21.4 7.6 22 8.33 22h7.33c.74 0 1.34-.6 1.34-1.33V5.33C17 4.6 16.4 4 15.67 4z",
	],
	batteryCharging: [
		"M15.67 4H14V2h-4v2H8.33C7.6 4 7 4.6 7 5.33v15.33C7 21.4 7.6 22 8.33 22h7.33c.74 0 1.34-.6 1.34-1.33V5.33C17 4.6 16.4 4 15.67 4zM11 20v-5.5H9L13 7v5.5h2L11 20z",
	],
	batteryLow: [
		"M7 17v3.67C7 21.4 7.6 22 8.33 22h7.33c.74 0 1.34-.6 1.34-1.33V17H7z",
		"M17 5.33C17 4.6 16.4 4 15.67 4H14V2h-4v2H8.33C7.6 4 7 4.6 7 5.33V17h10V5.33z",
	],
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, className }: { name: IconName; className?: string }): JSX.Element {
	const paths = PATHS[name];
	return (
		<svg className={className} viewBox="0 0 24 24" aria-hidden="true">
			{paths.map((d, index) => (
				<path
					key={d}
					d={d}
					// the empty part of a low battery, as `Battery20` of MUI draws it
					fillOpacity={name === "batteryLow" && index === 1 ? 0.3 : undefined}
				/>
			))}
		</svg>
	);
}

/** A robot vacuum seen from above: body, bumper arc and lidar turret */
export function RobotIcon({ className }: { className?: string }): JSX.Element {
	return (
		<svg className={className} viewBox="0 0 24 24" aria-hidden="true">
			<circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="1.6" />
			<path
				d="M5.2 7.5 A8.2 8.2 0 0 1 18.8 7.5"
				fill="none"
				stroke="currentColor"
				strokeWidth="1.6"
				strokeLinecap="round"
			/>
			<circle cx="12" cy="10.5" r="2.6" fill="currentColor" />
		</svg>
	);
}
