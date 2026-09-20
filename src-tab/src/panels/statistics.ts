/**
 * Lifetime statistics.
 *
 * Ported from the widget (`www/js/panels/statistik.js`). The formatting is the part worth having
 * here rather than in the component: total cleaning time arrives in minutes but is shown in
 * hours, and the first-cleaning date arrives as a Unix timestamp in **seconds**, which is the
 * kind of unit that produces a date in 1970 when it is read as milliseconds.
 */

/** One statistic. */
export interface Statistic {
	/** State suffix under `<did>.status.`. */
	state: string;
	nameKey: string;
	/** Renders the raw value for display. */
	format: (value: number, locale: string) => string;
}

export const STATISTICS: readonly Statistic[] = [
	{
		state: "cleaning-count",
		nameKey: "panel.statistik.reinigungen.label",
		format: value => String(value),
	},
	{
		state: "total-cleaned-area",
		nameKey: "panel.statistik.flaeche.label",
		format: (value, locale) => `${value.toLocaleString(locale)} m²`,
	},
	{
		state: "total-cleaning-time",
		nameKey: "panel.statistik.dauer.label",
		// Reported in minutes; hours is the only unit in which the number stays readable once a
		// robot has been running for a year.
		format: (value, locale) => `${Math.round(value / 60).toLocaleString(locale)} h`,
	},
	{
		state: "first-cleaning-date",
		nameKey: "panel.statistik.seit.label",
		// Seconds, not milliseconds. Passing it straight to `Date` yields January 1970.
		format: (value, locale) => new Date(value * 1000).toLocaleDateString(locale),
	},
];
