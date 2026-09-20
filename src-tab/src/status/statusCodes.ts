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
