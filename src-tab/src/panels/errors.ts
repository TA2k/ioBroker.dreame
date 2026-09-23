/**
 * Error and warning messages.
 *
 * ## Where the vocabulary comes from
 *
 * The codes are the Home Assistant integration's, ported through the widget
 * (`www/js/panels/fehler.js`). `status.error` has no `states` mapping in the adapter, so unlike
 * most enumerations it arrives as a bare number with no translation of its own - the text has to
 * be supplied here, and the widget's existing keys are reused so both views say the same thing.
 *
 * Codes describing the same condition share one key rather than carrying two translations of the
 * same sentence.
 */

/** Error code to translation key. */
export const ERROR_TEXT_KEY: Readonly<Record<number, string>> = {
	0: "panel.fehler.kein-fehler",
	1: "panel.fehler.raeder-in-der-luft",
	2: "panel.fehler.klippensensor",
	3: "panel.fehler.aufprallsensor-klemmt",
	4: "panel.fehler.roboter-gekippt",
	5: "panel.fehler.kollisionssensor-klemmt",
	6: "panel.fehler.raeder-in-der-luft",
	7: "panel.fehler.optischer-flow-sensor",
	8: "panel.fehler.staubbehaelter-nicht-installiert",
	11: "panel.fehler.filter-nicht-trocken-oder-verstopft",
	12: "panel.fehler.hauptbuerste-eingewickelt",
	13: "panel.fehler.seitenbuerste-eingewickelt",
	14: "panel.fehler.filter-feucht-oder-verstopft",
	15: "panel.fehler.steckt-fest-linkes-rad",
	16: "panel.fehler.steckt-fest-rechtes-rad",
	17: "panel.fehler.steckt-fest-oder-kann-nicht-drehen",
	18: "panel.fehler.steckt-fest-oder-kann-nicht-vorwaerts",
	19: "panel.fehler.ladestation-nicht-gefunden",
	20: "panel.fehler.batterie-schwach",
	21: "panel.fehler.fehler-beim-aufladen",
	22: "panel.fehler.fehler-beim-batteriestand",
	23: "panel.fehler.interner-fehler",
	24: "panel.fehler.visueller-positionssensor",
	25: "panel.fehler.bewegungssensor",
	26: "panel.fehler.optischer-sensor",
	27: "panel.fehler.infrarotabschirmung",
	28: "panel.fehler.ladestation-nicht-eingeschaltet",
	29: "panel.fehler.batterie-fehler",
	30: "panel.fehler.luefterdrehzahlsensor",
	33: "panel.fehler.beschleunigungssensor",
	34: "panel.fehler.beschleunigungssensor",
	35: "panel.fehler.beschleunigungssensor",
	36: "panel.fehler.linker-magnetsensor",
	37: "panel.fehler.rechter-magnetsensor",
	38: "panel.fehler.durchflusssensor",
	39: "panel.fehler.infrarotsensor",
	40: "panel.fehler.kamera",
	41: "panel.fehler.starkes-magnetfeld",
	42: "panel.fehler.wasserpumpe",
	43: "panel.fehler.rtc-fehler",
	44: "panel.fehler.interner-fehler",
	45: "panel.fehler.interner-fehler",
	46: "panel.fehler.interner-fehler",
	47: "panel.fehler.reinigungsroute-blockiert-dock",
	48: "panel.fehler.laserentfernungssensor",
	49: "panel.fehler.laserentfernungssensor-bumper",
	50: "panel.fehler.wasserpumpe",
	51: "panel.fehler.filter-feucht-oder-verstopft",
	54: "panel.fehler.kantensensor",
	55: "panel.fehler.teppich",
	56: "panel.fehler.hindernisvermeidungssensor-3d",
	57: "panel.fehler.kantensensor",
	58: "panel.fehler.ultraschallsensor",
	59: "panel.fehler.no-go-zone-oder-virtuelle-wand",
	61: "panel.fehler.reinigungsroute-blockiert",
	62: "panel.fehler.reinigungsroute-blockiert",
	63: "panel.fehler.reinigungsroute-blockiert-dock",
	64: "panel.fehler.reinigungsroute-blockiert-dock",
	65: "panel.fehler.sperrzone",
	66: "panel.fehler.sperrzone",
	67: "panel.fehler.sperrzone",
	68: "panel.fehler.wischpad-demontieren",
	69: "panel.fehler.wischpad-geloest-waehrend-reinigung",
	70: "panel.fehler.wischpad-geloest-waehrend-reinigung",
	71: "panel.fehler.wischpad-dreht-sich-nicht",
	72: "panel.fehler.wischpad-dreht-sich-nicht",
	74: "panel.fehler.wischpad-installation-fehlgeschlagen",
	75: "panel.fehler.niedriger-batteriestatus",
	76: "panel.fehler.schmutzwassertank-nicht-installiert",
	78: "panel.fehler.roboter-im-versteckten-bereich",
	79: "panel.fehler.lds-modul-nicht-angehoben",
	80: "panel.fehler.lds-positionierung-nicht-moeglich",
	81: "panel.fehler.lds-positionierung-nicht-moeglich",
	82: "panel.fehler.rutschiger-boden",
	85: "panel.fehler.mopp-installation-pruefen",
	86: "panel.fehler.abnormaler-wasserstand-schmutzwassertank",
	88: "panel.fehler.einziehbare-beine-pruefen",
	89: "panel.fehler.interner-fehler-neustart",
	90: "panel.fehler.lds-positionierung-nicht-moeglich",
	91: "panel.fehler.steckt-zwischen-tischen-stuehlen",
	92: "panel.fehler.steckt-im-engen-durchgang",
	93: "panel.fehler.steckt-an-stufe-schwelle",
	94: "panel.fehler.steckt-in-bereich-geringer-hoehe",
	95: "panel.fehler.rampen-mit-absturzgefahr",
	96: "panel.fehler.hindernisse-erkannt",
	97: "panel.fehler.personen-oder-haustiere-erkannt",
	98: "panel.fehler.steckt-durch-rutschen-fest",
	99: "panel.fehler.rutscht-auf-teppich",
	101: "panel.fehler.staubsaugerbeutel-voll-oder-luftkanal-verstopft",
	102: "panel.fehler.ladestation-abdeckung-oder-beutel",
	103: "panel.fehler.ladestation-abdeckung-oder-beutel",
	105: "panel.fehler.frischwassertank-nicht-installiert",
	106: "panel.fehler.schmutzwassertank-voll-oder-nicht-installiert",
	107: "panel.fehler.niedriger-wasserstand-frischwassertank",
	108: "panel.fehler.schmutzwassertank-voll-oder-nicht-installiert",
	109: "panel.fehler.schmutzwassertank-blockiert",
	110: "panel.fehler.schmutzwassertank-pumpenfehler",
	111: "panel.fehler.wischpad-nicht-richtig-installiert",
	112: "panel.fehler.wasserstand-wischpad-ungewoehnlich",
	114: "panel.fehler.reinigung-abgeschlossen-wischpad-reinigen",
	116: "panel.fehler.frischwassertank-pruefen-nachfuellen",
	117: "panel.fehler.basisstation-nicht-eingeschaltet",
	118: "panel.fehler.wasserstand-schmutzwassertank-zu-hoch",
	119: "panel.fehler.wasserstand-waschbrett-zu-hoch",
	120: "panel.fehler.wischpad-nicht-in-station",
	121: "panel.fehler.staubbeutel-voll-oder-lueftungsschlitze-blockiert",
	123: "panel.fehler.wasseraustritt-frischwassertank-module",
	124: "panel.fehler.waschbrett-funktioniert-nicht-mehr",
	125: "panel.fehler.abnormaler-wasserablauf-schmutzwassertank",
	126: "panel.fehler.mopp-nicht-erkannt",
	127: "panel.fehler.mopphalter-menge-platzierung",
	128: "panel.fehler.stationsfehler",
	129: "panel.fehler.reinigung-schmutziger-mopp-fehlgeschlagen",
	200: "panel.fehler.rutscht-im-vorhangbereich",
	201: "panel.fehler.kantenmopp-dreht-sich-nicht",
	202: "panel.fehler.kantenmopp-geloest",
	203: "panel.fehler.fahrgestell-anhebung-fehlfunktion",
	207: "panel.fehler.interner-fehler-neustart",
	209: "panel.fehler.fremdkoerper-mopprolle-abdeckung",
	210: "panel.fehler.fremdkoerper-mopprolle-abdeckung",
	212: "panel.fehler.roboterarm-gestoppt",
	213: "panel.fehler.niedriger-wasserstand-frischwassertank-roboter",
	214: "panel.fehler.schmutzwassertank-roboter-voll",
	215: "panel.fehler.mopp-nicht-installiert",
	217: "panel.fehler.laserentfernungssensor",
	218: "panel.fehler.fremdkoerper-mopprolle-abdeckung",
	222: "panel.fehler.fehler-auflockerungsrolle",
	223: "panel.fehler.fremdkoerper-mopprolle-abdeckung",
	224: "panel.fehler.fremdkoerper-mopprolle-abdeckung",
	225: "panel.fehler.fremdkoerper-mopprolle-abdeckung",
	226: "panel.fehler.durch-hindernis-blockiert",
	227: "panel.fehler.abflussfilter-verstopft",
	228: "panel.fehler.fehler-der-hauptraeder",
	229: "panel.fehler.interner-fehler-neustart",
	230: "panel.fehler.interner-fehler-neustart",
	1000: "panel.fehler.rueckkehr-zum-laden-fehlgeschlagen",
};

/** Number of codes the table knows, so a truncated port fails a test rather than a user. */
export const KNOWN_ERROR_CODES = 136;

/**
 * Codes that are warnings rather than faults.
 *
 * The distinction decides how loudly a message is shown: a fault has stopped the robot, a warning
 * is something to deal with at some point. Straight from the widget's own set.
 */
export const WARNING_CODES: ReadonlySet<number> = new Set([
	9, 10, 20, 47, 51, 56, 68, 70, 71, 72, 75, 82, 85, 107, 114, 117, 121, 122, 123, 129, 213, 214,
]);

/** The robot status a suppression decision needs. */
export interface ErrorContext {
	/** `status.charging-status`. */
	charging: number | null;
	/** `status.self-wash-base-status`; null where the device has no washing station. */
	wash: number | null;
}

/**
 * Whether a code is worth showing at all.
 *
 * Home Assistant hides these, and it is right to: two are collective codes that say only that
 * something is wrong, and the others are normal conditions that happen to be reported as errors.
 *
 * - `84` and `122` are "unknown error" and "unknown warning" - nothing to act on.
 * - `20` is a low battery, which is what charging is for; it is only news when not charging.
 * - `68` and `114` ask for the mop to be removed, which a device with a washing station does by
 *   itself.
 */
export function isSuppressed(code: number, context: ErrorContext): boolean {
	if (code === 84 || code === 122) return true;
	if (code === 20 && context.charging === 1) return true;
	if ((code === 68 || code === 114) && context.wash != null) return true;
	return false;
}

/** One message to show. */
export interface DeviceMessage {
	/** The state it came from, used as a stable key. */
	source: string;
	/** Translation key, or null where the code is unknown. */
	textKey: string | null;
	/** Set only where `textKey` is null: the raw code, so it can be quoted. */
	unknownCode?: number;
	/** A fault rather than a warning. */
	severe: boolean;
}

/** The message states this module reads, beyond the two in {@link ErrorContext}. */
export const MESSAGE_STATES = [
	"error",
	"clean-water-tank-status",
	"dirty-water-tank-status",
	"low-water-warning",
	"dust-bag-status",
	"detergent-status",
] as const;

/** The non-error states, each a simple "non-zero means show this" flag. */
const FLAG_MESSAGES: readonly (readonly [string, string])[] = [
	["clean-water-tank-status", "panel.fehler.frischwassertank-pruefen"],
	["dirty-water-tank-status", "panel.fehler.schmutzwassertank-leeren"],
	["low-water-warning", "panel.fehler.wenig-wasser"],
	["dust-bag-status", "panel.fehler.staubbeutel-voll"],
	["detergent-status", "panel.fehler.reinigungsmittel-leer"],
];

/**
 * Builds the message list.
 *
 * @param values State suffix to value, e.g. `{ error: 12, "dust-bag-status": 1 }`.
 * @param context Robot status needed to decide suppression.
 */
export function collectMessages(
	values: Readonly<Record<string, number | null>>,
	context: ErrorContext,
): DeviceMessage[] {
	const messages: DeviceMessage[] = [];

	const error = values.error;
	if (error != null && error > 0 && !isSuppressed(error, context)) {
		const textKey = ERROR_TEXT_KEY[error] ?? null;
		messages.push({
			source: "error",
			textKey,
			// A code the table does not know shows as a number, which can be quoted in an issue -
			// an invented label would send everyone looking in the wrong place.
			...(textKey ? {} : { unknownCode: error }),
			severe: !WARNING_CODES.has(error),
		});
	}

	for (const [state, key] of FLAG_MESSAGES) {
		const value = values[state];
		// All of these need attention, but none has stopped the robot.
		if (value != null && value > 0) messages.push({ source: state, textKey: key, severe: false });
	}

	return messages;
}
