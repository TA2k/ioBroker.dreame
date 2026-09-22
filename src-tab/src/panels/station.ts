/**
 * What the base station offers right now: which buttons exist, which may be pressed, and why not.
 *
 * Home Assistant's rules (device.py) as the widget ports them (`www/js/panels/station.js`):
 *
 * - A button exists only for what the station has. Emptying needs `dust-collection`, washing and
 *   drying need `self-wash-base-status`. A station without a bin, or a robot without a washing
 *   station, shows fewer buttons - or none, and then no panel.
 * - A button that exists can still be off, with a hint saying why: no mop fitted, not at the
 *   station, the mop still being washed, a cleaning still under way.
 * - Washing is one button in three roles: start, pause a wash in progress, resume a paused one.
 *
 * Left out, as in the widget, for want of states to read: returning to wash, self-repair, and
 * Home Assistant's second rule that lets fifth-generation stations empty during a run.
 */

/** `self-wash-base-status`, Home Assistant's `DreameVacuumSelfWashBaseStatus`. */
export const WASH = { IDLE: 0, WASHING: 1, DRYING: 2, RETURNING: 3, PAUSED: 4, CLEAN_ADD_WATER: 5 } as const;
const EMPTY_ACTIVE = 1;
const STATUS_BACK_HOME = 3;
const STATE_RETURNING_AUTO_EMPTY = 28;

export interface StationValues {
	wash: number | null;
	dustCollection: number | null;
	charging: number | null;
	waterTank: number | null;
	mopInStation: number | null;
	robotStatus: number | null;
	cleaningPaused: boolean;
	drainage: number | null;
	autoEmpty: number | null;
	state: number | null;
}

export type StationCommand = "autoEmpty" | "wash" | "pauseWash" | "resumeWash" | "dry" | "stopDry";

export interface StationAction {
	/** Which button: the widget's ids, which its settings use to hide buttons. */
	id: "empty" | "wash" | "dry";
	textKey: string;
	/** Says what the button does, or why it cannot be pressed. */
	hintKey: string;
	disabled: boolean;
	command: StationCommand;
}

/** At the station: charging there, or in the middle of a wash or a drying. */
function docked(v: StationValues): boolean {
	return (
		v.charging === 1 || v.charging === 3 || v.wash === WASH.WASHING || v.wash === WASH.DRYING || v.wash === WASH.PAUSED
	);
}

/** A water tank or a mop pad is fitted. A tank state not reported counts as fitted, as in HA. */
function mopFitted(v: StationValues): boolean {
	return v.waterTank !== 0 || v.mopInStation === 1;
}

/**
 * The buttons, in the widget's order.
 *
 * @param started whether a task is under way - see `isStarted`
 */
export function stationActions(v: StationValues, started: boolean): StationAction[] {
	const actions: StationAction[] = [];
	const hasWashing = v.wash != null;

	if (v.dustCollection != null) {
		const running = v.autoEmpty === EMPTY_ACTIVE;
		const possible =
			v.dustCollection === 1 && v.state !== STATE_RETURNING_AUTO_EMPTY && v.wash !== WASH.WASHING && !v.drainage;
		actions.push({
			id: "empty",
			textKey: "panel.station.knopf.entleeren",
			hintKey: running
				? "panel.station.hinweis.laeuft"
				: possible
					? "panel.station.hinweis.entleeren-geht"
					: v.wash === WASH.WASHING
						? "panel.station.hinweis.erst-nach-mopp-waschen"
						: !docked(v)
							? "panel.station.hinweis.nur-an-station"
							: "panel.station.hinweis.gerade-nicht-moeglich",
			disabled: running || !possible,
			command: "autoEmpty",
		});
	}

	if (hasWashing) {
		const washing = v.wash === WASH.WASHING;
		const paused = v.wash === WASH.PAUSED;
		const canWash =
			mopFitted(v) &&
			!(washing || paused || v.wash === WASH.RETURNING || v.robotStatus === STATUS_BACK_HOME || v.cleaningPaused);
		actions.push({
			id: "wash",
			textKey: paused
				? "panel.station.knopf.fortsetzen"
				: washing
					? "panel.station.knopf.anhalten"
					: "panel.station.knopf.waschen",
			hintKey: paused
				? "panel.station.hinweis.waschgang-fortsetzen"
				: washing
					? "panel.station.hinweis.waschen-laeuft"
					: canWash
						? "panel.station.hinweis.wischpad-reinigen"
						: !mopFitted(v)
							? "panel.station.hinweis.kein-wischpad"
							: "panel.station.hinweis.gerade-nicht-moeglich",
			// Pausing and resuming are always possible; only a fresh start has conditions.
			disabled: paused || washing ? false : !canWash,
			command: paused ? "resumeWash" : washing ? "pauseWash" : "wash",
		});

		const drying = v.wash === WASH.DRYING;
		const canDry =
			mopFitted(v) && docked(v) && v.wash !== WASH.WASHING && v.wash !== WASH.PAUSED && !started && !v.drainage;
		actions.push({
			id: "dry",
			textKey: drying ? "panel.station.knopf.trocknen-beenden" : "panel.station.knopf.trocknen",
			hintKey: drying
				? "panel.station.hinweis.trocknung-abbrechen"
				: canDry
					? "panel.station.hinweis.wischpad-trocknen"
					: washing
						? "panel.station.hinweis.erst-nach-mopp-waschen"
						: !docked(v)
							? "panel.station.hinweis.nur-an-station"
							: started
								? "panel.station.hinweis.erst-nach-reinigung"
								: "panel.station.hinweis.gerade-nicht-moeglich",
			disabled: !drying && !canDry,
			command: drying ? "stopDry" : "dry",
		});
	}

	return actions;
}
