/*
 * Fehler-Panel: Fehler-/Warnmeldungen (voller Tank, Fehlercode, Staubbeutel, ...).
 * ========================================================================
 * Aus kopf.js ausgekoppelt (WIDGET_UMBAU_PLAN.md Abschnitt 6, Commit C6-1) -- Fehlertexte/
 * Warnungs-Logik unveraendert 1:1 uebernommen, dort urspruenglich aus RicardoHipps Fork
 * bzw. der Home-Assistant-Referenz (dreame-vacuum von Tasshack, MIT License) portiert, siehe
 * kopf.js-Kommentarkopf fuer die vollstaendige Herkunftsangabe.
 *
 * fehlerUnterdruecken() braucht zwei Werte aus dem Roboter-Status (charging, wash), die
 * kopf.js fuer seine eigenen Zwecke (Badges/Statustext) ohnehin schon haelt. Bewusst NICHT
 * ueber eine Bruecke zur KopfPanel-Instanz gelesen, sondern hier eigenstaendig abonniert --
 * eine generische Kopplung nur fuer zwei von rund einem Dutzend vst-Feldern waere mehr
 * Kopplung als der Bedarf rechtfertigt. Gleiches Prinzip wie reinigung.js' eigenstaendige
 * customizedCleaning-Spiegelung (siehe dortiger Kommentarkopf).
 */

/* global Panel, uiIcon, t */

// F9 (WIDGET_FEATURE_PLAN.md): Werte -> i18n-Keys statt fester deutscher Strings (die Codes
// selbst kommen weiterhin 1:1 aus der HA-Referenz, siehe Kommentarkopf -- status.error hat
// KEIN `states:`-Mapping in main.js/lib/specs, adapterseitig also keine Uebersetzung
// verfuegbar, anders als z.B. remote.water-temperature bei frischwasser.js -- deshalb hier
// Widget-eigenes Vokabular wie bei jedem anderen Panel). Mehrere Codes mit identischem
// Text teilen sich denselben Key (z.B. 1/6 "Räder in der Luft") statt doppelter Uebersetzung.
// Bekannter Encoding-Fehler bei Code 228 ("HauptrÃ¤der") mit uebernommen/korrigiert
// (Haupträder) -- reiner Transkriptionsfehler beim urspruenglichen Uebernehmen aus HA, keine
// inhaltliche Aenderung.
const FEHLER_TEXT_KEY = {
  0: 'panel.fehler.kein-fehler', 1: 'panel.fehler.raeder-in-der-luft', 2: 'panel.fehler.klippensensor',
  3: 'panel.fehler.aufprallsensor-klemmt', 4: 'panel.fehler.roboter-gekippt',
  5: 'panel.fehler.kollisionssensor-klemmt', 6: 'panel.fehler.raeder-in-der-luft',
  7: 'panel.fehler.optischer-flow-sensor', 8: 'panel.fehler.staubbehaelter-nicht-installiert',
  11: 'panel.fehler.filter-nicht-trocken-oder-verstopft', 12: 'panel.fehler.hauptbuerste-eingewickelt',
  13: 'panel.fehler.seitenbuerste-eingewickelt', 14: 'panel.fehler.filter-feucht-oder-verstopft',
  15: 'panel.fehler.steckt-fest-linkes-rad', 16: 'panel.fehler.steckt-fest-rechtes-rad',
  17: 'panel.fehler.steckt-fest-oder-kann-nicht-drehen',
  18: 'panel.fehler.steckt-fest-oder-kann-nicht-vorwaerts',
  19: 'panel.fehler.ladestation-nicht-gefunden', 20: 'panel.fehler.batterie-schwach',
  21: 'panel.fehler.fehler-beim-aufladen', 22: 'panel.fehler.fehler-beim-batteriestand',
  23: 'panel.fehler.interner-fehler', 24: 'panel.fehler.visueller-positionssensor',
  25: 'panel.fehler.bewegungssensor', 26: 'panel.fehler.optischer-sensor',
  27: 'panel.fehler.infrarotabschirmung', 28: 'panel.fehler.ladestation-nicht-eingeschaltet',
  29: 'panel.fehler.batterie-fehler', 30: 'panel.fehler.luefterdrehzahlsensor',
  33: 'panel.fehler.beschleunigungssensor', 34: 'panel.fehler.beschleunigungssensor',
  35: 'panel.fehler.beschleunigungssensor', 36: 'panel.fehler.linker-magnetsensor',
  37: 'panel.fehler.rechter-magnetsensor', 38: 'panel.fehler.durchflusssensor',
  39: 'panel.fehler.infrarotsensor', 40: 'panel.fehler.kamera', 41: 'panel.fehler.starkes-magnetfeld',
  42: 'panel.fehler.wasserpumpe', 43: 'panel.fehler.rtc-fehler', 44: 'panel.fehler.interner-fehler',
  45: 'panel.fehler.interner-fehler', 46: 'panel.fehler.interner-fehler',
  47: 'panel.fehler.reinigungsroute-blockiert-dock', 48: 'panel.fehler.laserentfernungssensor',
  49: 'panel.fehler.laserentfernungssensor-bumper', 50: 'panel.fehler.wasserpumpe',
  51: 'panel.fehler.filter-feucht-oder-verstopft', 54: 'panel.fehler.kantensensor',
  55: 'panel.fehler.teppich', 56: 'panel.fehler.hindernisvermeidungssensor-3d',
  57: 'panel.fehler.kantensensor', 58: 'panel.fehler.ultraschallsensor',
  59: 'panel.fehler.no-go-zone-oder-virtuelle-wand', 61: 'panel.fehler.reinigungsroute-blockiert',
  62: 'panel.fehler.reinigungsroute-blockiert', 63: 'panel.fehler.reinigungsroute-blockiert-dock',
  64: 'panel.fehler.reinigungsroute-blockiert-dock', 65: 'panel.fehler.sperrzone',
  66: 'panel.fehler.sperrzone', 67: 'panel.fehler.sperrzone', 68: 'panel.fehler.wischpad-demontieren',
  69: 'panel.fehler.wischpad-geloest-waehrend-reinigung',
  70: 'panel.fehler.wischpad-geloest-waehrend-reinigung',
  71: 'panel.fehler.wischpad-dreht-sich-nicht', 72: 'panel.fehler.wischpad-dreht-sich-nicht',
  74: 'panel.fehler.wischpad-installation-fehlgeschlagen', 75: 'panel.fehler.niedriger-batteriestatus',
  76: 'panel.fehler.schmutzwassertank-nicht-installiert',
  78: 'panel.fehler.roboter-im-versteckten-bereich', 79: 'panel.fehler.lds-modul-nicht-angehoben',
  80: 'panel.fehler.lds-positionierung-nicht-moeglich',
  81: 'panel.fehler.lds-positionierung-nicht-moeglich', 82: 'panel.fehler.rutschiger-boden',
  85: 'panel.fehler.mopp-installation-pruefen',
  86: 'panel.fehler.abnormaler-wasserstand-schmutzwassertank',
  88: 'panel.fehler.einziehbare-beine-pruefen', 89: 'panel.fehler.interner-fehler-neustart',
  90: 'panel.fehler.lds-positionierung-nicht-moeglich',
  91: 'panel.fehler.steckt-zwischen-tischen-stuehlen', 92: 'panel.fehler.steckt-im-engen-durchgang',
  93: 'panel.fehler.steckt-an-stufe-schwelle', 94: 'panel.fehler.steckt-in-bereich-geringer-hoehe',
  95: 'panel.fehler.rampen-mit-absturzgefahr', 96: 'panel.fehler.hindernisse-erkannt',
  97: 'panel.fehler.personen-oder-haustiere-erkannt', 98: 'panel.fehler.steckt-durch-rutschen-fest',
  99: 'panel.fehler.rutscht-auf-teppich',
  101: 'panel.fehler.staubsaugerbeutel-voll-oder-luftkanal-verstopft',
  102: 'panel.fehler.ladestation-abdeckung-oder-beutel',
  103: 'panel.fehler.ladestation-abdeckung-oder-beutel',
  105: 'panel.fehler.frischwassertank-nicht-installiert',
  106: 'panel.fehler.schmutzwassertank-voll-oder-nicht-installiert',
  107: 'panel.fehler.niedriger-wasserstand-frischwassertank',
  108: 'panel.fehler.schmutzwassertank-voll-oder-nicht-installiert',
  109: 'panel.fehler.schmutzwassertank-blockiert', 110: 'panel.fehler.schmutzwassertank-pumpenfehler',
  111: 'panel.fehler.wischpad-nicht-richtig-installiert',
  112: 'panel.fehler.wasserstand-wischpad-ungewoehnlich',
  114: 'panel.fehler.reinigung-abgeschlossen-wischpad-reinigen',
  116: 'panel.fehler.frischwassertank-pruefen-nachfuellen',
  117: 'panel.fehler.basisstation-nicht-eingeschaltet',
  118: 'panel.fehler.wasserstand-schmutzwassertank-zu-hoch',
  119: 'panel.fehler.wasserstand-waschbrett-zu-hoch', 120: 'panel.fehler.wischpad-nicht-in-station',
  121: 'panel.fehler.staubbeutel-voll-oder-lueftungsschlitze-blockiert',
  123: 'panel.fehler.wasseraustritt-frischwassertank-module',
  124: 'panel.fehler.waschbrett-funktioniert-nicht-mehr',
  125: 'panel.fehler.abnormaler-wasserablauf-schmutzwassertank', 126: 'panel.fehler.mopp-nicht-erkannt',
  127: 'panel.fehler.mopphalter-menge-platzierung', 128: 'panel.fehler.stationsfehler',
  129: 'panel.fehler.reinigung-schmutziger-mopp-fehlgeschlagen',
  200: 'panel.fehler.rutscht-im-vorhangbereich', 201: 'panel.fehler.kantenmopp-dreht-sich-nicht',
  202: 'panel.fehler.kantenmopp-geloest', 203: 'panel.fehler.fahrgestell-anhebung-fehlfunktion',
  207: 'panel.fehler.interner-fehler-neustart',
  209: 'panel.fehler.fremdkoerper-mopprolle-abdeckung',
  210: 'panel.fehler.fremdkoerper-mopprolle-abdeckung', 212: 'panel.fehler.roboterarm-gestoppt',
  213: 'panel.fehler.niedriger-wasserstand-frischwassertank-roboter',
  214: 'panel.fehler.schmutzwassertank-roboter-voll', 215: 'panel.fehler.mopp-nicht-installiert',
  217: 'panel.fehler.laserentfernungssensor',
  218: 'panel.fehler.fremdkoerper-mopprolle-abdeckung', 222: 'panel.fehler.fehler-auflockerungsrolle',
  223: 'panel.fehler.fremdkoerper-mopprolle-abdeckung',
  224: 'panel.fehler.fremdkoerper-mopprolle-abdeckung',
  225: 'panel.fehler.fremdkoerper-mopprolle-abdeckung', 226: 'panel.fehler.durch-hindernis-blockiert',
  227: 'panel.fehler.abflussfilter-verstopft', 228: 'panel.fehler.fehler-der-hauptraeder',
  229: 'panel.fehler.interner-fehler-neustart', 230: 'panel.fehler.interner-fehler-neustart',
  1000: 'panel.fehler.rueckkehr-zum-laden-fehlgeschlagen',
};
// Codes, die HA nur als WARNUNG fuehrt (types.py WARNING_ERROR_CODE) — kein Defekt, sondern
// ein Hinweis. Werden gelb statt rot angezeigt.
const FEHLER_WARNUNG = new Set([9, 10, 20, 47, 51, 56, 68, 70, 71, 72, 75, 82, 85, 107, 114, 117, 121, 122, 123, 129, 213, 214]);

const MELDUNGEN = [
  { obj: 'error', text: v => FEHLER_TEXT_KEY[v] ? t(FEHLER_TEXT_KEY[v]) : `${t('panel.fehler.unbekannter-code-praefix')} ${v}`,
    bei: (v, vst) => v > 0 && !fehlerUnterdruecken(v, vst),
    schwer: v => !FEHLER_WARNUNG.has(Number(v)) },
  { obj: 'clean-water-tank-status', text: () => t('panel.fehler.frischwassertank-pruefen'), bei: v => v > 0 },
  { obj: 'dirty-water-tank-status', text: () => t('panel.fehler.schmutzwassertank-leeren'), bei: v => v > 0 },
  { obj: 'low-water-warning', text: () => t('panel.fehler.wenig-wasser'), bei: v => v > 0 },
  { obj: 'dust-bag-status', text: () => t('panel.fehler.staubbeutel-voll'), bei: v => v > 0 },
  { obj: 'detergent-status', text: () => t('panel.fehler.reinigungsmittel-leer'), bei: v => v > 0 },
];

/**
 * Meldungen, die HA gar nicht erst anzeigt — 1:1 aus device.py 8560-8572 (`error`).
 *   84  UNKNOWN_ERROR    — Sammelcode ohne Aussage
 *   122 UNKNOWN_WARNING  — dito
 *   20  BATTERY_LOW      — nur waehrend des Ladens
 *   68  REMOVE_MOP       — bei Geraeten mit Waschstation wird das Pad gewaschen/getrocknet
 * @param code  Fehlercode aus status.error
 * @param vst   { charging, wash } -- Ausschnitt des Roboter-Status, s. Kommentarkopf
 */
function fehlerUnterdruecken(code, vst) {
  const n = Number(code);
  if (n === 84 || n === 122) return true;
  if (n === 20 && vst.charging === 1) return true;
  if ((n === 68 || n === 114) && vst.wash != null) return true;
  return false;
}

class FehlerPanel extends Panel {
  constructor(id, container, config) {
    super(id, container, config);
    this.meldungen = {};
    this._charging = null;
    this._wash = null;
    this._idZuMeldung = {};
  }

  benoetigteStates(did) {
    const pfad = suffix => `dreame.0.${did}.status.${suffix}`;
    this._idCharging = pfad('charging-status');
    this._idWash = pfad('self-wash-base-status');
    this._idZuMeldung = {};
    for (const eintrag of MELDUNGEN) this._idZuMeldung[pfad(eintrag.obj)] = eintrag.obj;
    return [this._idCharging, this._idWash, ...Object.keys(this._idZuMeldung)];
  }

  neueDaten(stateId, wert) {
    if (stateId === this._idCharging) {
      this._charging = wert == null ? null : Number(wert);
      this.render();
      return;
    }
    if (stateId === this._idWash) {
      this._wash = wert == null ? null : Number(wert);
      this.render();
      return;
    }
    const meldungObj = this._idZuMeldung[stateId];
    if (meldungObj) {
      this.meldungen[meldungObj] = wert;
      this.render();
    }
  }

  render() {
    const wb = document.getElementById('warnBox');
    if (!wb) return;
    const vst = { charging: this._charging, wash: this._wash };
    const zeilen = MELDUNGEN
      .filter(m => this.meldungen[m.obj] != null && m.bei(this.meldungen[m.obj], vst))
      .map(m => {
        const wert = this.meldungen[m.obj];
        const schwer = (typeof m.schwer === 'function') ? m.schwer(wert) : !!m.schwer;
        return `<div class="wrow${schwer ? ' bad' : ''}">${uiIcon('warnung', 15)}<span>${m.text(wert)}</span></div>`;
      });
    wb.innerHTML = zeilen.join('');
    wb.hidden = !zeilen.length;
  }
}
