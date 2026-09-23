/**
 * Maps the robot's status code to the translation key describing it.
 *
 * Ported verbatim from the widget (`www/js/panels/kopf.js`, `STATUS_TEXT_KEY`) so that both
 * views name the same state the same way, and so the 70 translations that already exist in all
 * 11 language files are reused rather than written a second time. Every key in this table was
 * checked against `www/i18n/de.json` when it was ported; none was missing.
 *
 * An unknown code is not an error - the fleet gains states faster than tables are updated - so
 * {@link statusTextKey} reports the code itself instead of pretending to know it.
 */
export const STATUS_TEXT_KEY: Readonly<Record<number, string>> = {
	1: "panel.kopf.status.reinigung",
	2: "panel.kopf.status.standby",
	3: "panel.kopf.status.pausiert",
	4: "panel.kopf.status.fehler",
	5: "panel.kopf.status.zurueck-zum-aufladen",
	6: "panel.kopf.status.laden",
	7: "panel.kopf.status.wischen",
	8: "panel.kopf.status.mopp-trocknung",
	9: "panel.kopf.status.mopp-reinigung",
	10: "panel.kopf.status.rueckkehr-zum-reinigen",
	11: "panel.kopf.status.karte-wird-erstellt",
	12: "panel.kopf.status.beim-reinigen",
	13: "panel.kopf.status.laden-beendet",
	14: "panel.kopf.status.aktualisieren",
	15: "panel.kopf.status.reinigung-rufen",
	16: "panel.kopf.status.automatische-reparatur",
	17: "panel.kopf.status.zurueckkehren-mopp-installieren",
	18: "panel.kopf.status.zurueckkehren-mopp-entfernen",
	19: "panel.kopf.status.selbsttest-wasser",
	20: "panel.kopf.status.wischmopp-reinigen-wasser-nachfuellen",
	21: "panel.kopf.status.mopp-reinigung-pausiert",
	22: "panel.kopf.status.automatische-entleerung",
	23: "panel.kopf.status.ferngesteuerte-reinigung",
	24: "panel.kopf.status.intelligentes-aufladen",
	25: "panel.kopf.status.zweite-reinigung",
	26: "panel.kopf.status.folgend",
	27: "panel.kopf.status.partielle-reinigung",
	28: "panel.kopf.status.rueckfahrt-staubsammlung",
	29: "panel.kopf.status.auf-aufgaben-warten",
	30: "panel.kopf.status.reinigung-waschplattenbasis",
	31: "panel.kopf.status.rueckfahrt-wasserablassen",
	32: "panel.kopf.status.wasser-wird-abgelassen",
	33: "panel.kopf.status.wasserzufuhr-ableitung-entleeren",
	34: "panel.kopf.status.staubbehaelter-wird-entleert",
	35: "panel.kopf.status.trocknung-staubbehaelter-beutel",
	36: "panel.kopf.status.trocknen-staubbehaelter-beutel-angehalten",
	37: "panel.kopf.status.weiter-zusaetzlicher-reinigungsbereich",
	38: "panel.kopf.status.zusaetzliche-reinigung",
	95: "panel.kopf.status.haustiersuche-pausiert",
	96: "panel.kopf.status.haustiersuche",
	97: "panel.kopf.status.shortcut-laeuft",
	98: "panel.kopf.status.kamerauberwachung-laeuft",
	99: "panel.kopf.status.kamerauberwachung-pausiert",
	101: "panel.kopf.status.anfaengliche-tiefenreinigung",
	102: "panel.kopf.status.anfaengliche-tiefenreinigung-pausiert",
	103: "panel.kopf.status.desinfizieren",
	104: "panel.kopf.status.desinfizieren-mit-trocknen",
	105: "panel.kopf.status.wischmopp-wird-gewechselt",
	106: "panel.kopf.status.umschalten-wischmopp-pausiert",
	107: "panel.kopf.status.pflege-im-gange",
	108: "panel.kopf.status.pflege-pausiert",
	109: "panel.kopf.status.gegenstand-wird-aufgenommen",
	113: "panel.kopf.status.gegenstaende-werden-einsortiert",
	114: "panel.kopf.status.haustier-ueberwachung",
	115: "panel.kopf.status.haustier-ueberwachung-pausiert",
	116: "panel.kopf.status.wischmopp-wird-angebracht",
	117: "panel.kopf.status.wischmopp-wird-abgenommen",
	118: "panel.kopf.status.intelligentes-nachladen",
	120: "panel.kopf.status.unterstuetzte-reinigung",
	121: "panel.kopf.status.faehrt-in-die-station",
	122: "panel.kopf.status.verlaesst-die-station",
	140: "panel.kopf.status.faehrt-zum-treppensteiger",
	141: "panel.kopf.status.dockt-am-treppensteiger-an",
	142: "panel.kopf.status.am-treppensteiger-angedockt",
	143: "panel.kopf.status.treppensteiger-navigiert",
	144: "panel.kopf.status.steigt-treppen",
	145: "panel.kopf.status.treppensteigen-beendet",
	146: "panel.kopf.status.treppensteiger-an-der-station",
	147: "panel.kopf.status.treppensteiger-verlaesst-die-station",
	// Quoted because a negative numeric literal is not a valid property name. The robot reports
	// -1 as "state unknown to itself", which is distinct from a code this table has not got.
	"-1": "panel.kopf.status.unbekannt",
};

/** Highest code the table knows, kept for the test that guards against a truncated port. */
export const KNOWN_STATUS_CODES = 70;

/**
 * The translation key for a status code, or null where the code is unknown.
 *
 * Null rather than a guess: the caller shows the bare number, which is something a user can
 * quote in an issue, where an invented label would send everyone looking in the wrong place.
 */
export function statusTextKey(code: number | null | undefined): string | null {
	if (code == null) return null;
	return STATUS_TEXT_KEY[code] ?? null;
}

/**
 * Status codes at which the robot is out doing a job, as opposed to docked, charging or idle.
 *
 * The widget's own set (`www/js/panels/kopf.js`), used there to decide when the run time is worth
 * showing. Here it also decides whether a tile is drawn as active - a lit tile should mean the
 * robot is working, not merely that it has power.
 */
export const WORKING_STATUS_CODES: ReadonlySet<number> = new Set([1, 7, 12, 21, 25, 27, 37, 38, 101, 102]);

/** True while the robot is out doing a job. */
export function isWorking(code: number | null | undefined): boolean {
	return code != null && WORKING_STATUS_CODES.has(code);
}

/** Task status values that mean "no task", from Home Assistant's `DreameVacuumTaskStatus`. */
const TASK_COMPLETED = 0;
const TASK_DOCKING_PAUSED = 11;

/**
 * Robot `status` values of a running task: cleaning, partial, room, zone and spot cleaning, fast
 * mapping, cruising and shortcuts - Home Assistant's `DreameVacuumStatus`. Returning home (3) is
 * not among them; a task that is returning mid-job is still caught by its task status.
 */
const TASK_STATUSES: ReadonlySet<number> = new Set([2, 4, 18, 19, 20, 21, 22, 23, 25]);

/**
 * Whether the robot has a task under way, paused or not.
 *
 * Home Assistant's `started` (device.py), as the widget ports it. Wider than
 * {@link isWorking}: a task that is paused, or on its way back to the dock to empty and carry
 * on, is still started. That is what decides whether the job's settings may change and whether
 * its progress means anything.
 *
 * One deliberate departure from Home Assistant, again the widget's: with nothing known about the
 * device yet, the answer is "not started". HA reads a missing task status as unknown, which is
 * neither "completed" nor "paused at the dock" - and so as started.
 */
export function isStarted(taskStatus: number | null, robotStatus: number | null, cleaningPaused: boolean): boolean {
	if (taskStatus == null && robotStatus == null) return false;
	const task = taskStatus ?? -1;
	return (
		(task !== TASK_COMPLETED && task !== TASK_DOCKING_PAUSED) ||
		cleaningPaused ||
		(robotStatus != null && TASK_STATUSES.has(robotStatus))
	);
}

/** Robot states in which the mop is being dried: drying, and drying the dust bag. */
export const DRYING_STATES: ReadonlySet<number> = new Set([8, 35]);
