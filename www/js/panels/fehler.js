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

/* global Panel, uiIcon */

// Fehlertexte 1:1 aus der HA-Referenz uebernommen (types.py DreameVacuumErrorCode ->
// const.py -> translations/de.json). Bewusst NICHT selbst formuliert: sonst driften die
// Texte auseinander, sobald dort etwas dazukommt. Erzeugt aus dem HA-Stand vom 07/2026.
const FEHLER_DE = {
  0: 'Kein Fehler', 1: 'Räder in der Luft', 2: 'Klippensensorfehler', 3: 'Aufprallsensor klemmt',
  4: 'Roboter ist gekippt', 5: 'Kollisionssensor klemmt', 6: 'Räder in der Luft',
  7: 'Fehler des optischen Flow-Sensors', 8: 'Staubbehälter nicht installiert',
  11: 'Der Filter ist nicht trocken oder verstopft', 12: 'Die Hauptbürste ist eingewickelt',
  13: 'Die Seitenbürste ist eingewickelt', 14: 'Der Filter ist feucht oder verstopft',
  15: 'Der Roboter steckt fest, oder sein linkes Rad ist möglicherweise durch Fremdkörper blockiert',
  16: 'Der Roboter steckt fest, oder sein rechtes Rad ist möglicherweise durch Fremdkörper blockiert',
  17: 'Der Roboter steckt fest oder kann sich nicht drehen',
  18: 'Der Roboter steckt fest oder kann nicht vorwärts fahren',
  19: 'Kann die Ladestation nicht finden', 20: 'Batterie schwach', 21: 'Fehler beim Aufladen',
  22: 'Fehler beim Batteriestand', 23: 'Interner Fehler',
  24: 'Fehler des visuellen Positionssensors', 25: 'Fehler des Bewegungssensors',
  26: 'Optischer Sensorfehler', 27: 'Fehler in der Infrarotabschirmung',
  28: 'Die Ladestation ist nicht eingeschaltet', 29: 'Batterie Fehler',
  30: 'Fehler des Lüfterdrehzahlsensors', 33: 'Fehler im Beschleunigungssensor ',
  34: 'Fehler im Beschleunigungssensor', 35: 'Fehler im Beschleunigungssensor',
  36: 'Fehler des linken Magnetsensors', 37: 'Fehler des rechten Magnetsensors',
  38: 'Durchflusssensor Fehler', 39: 'Infrarotsensor Fehler', 40: 'Kamera Fehler',
  41: 'Starkes Magnetfeld festgestellt', 42: 'Wasserpumpen Fehler', 43: 'RTC Fehler',
  44: 'Interner Fehler', 45: 'Interner Fehler', 46: 'Interner Fehler',
  47: 'Reinigungsroute ist blockiert kehre zur Dock zurück',
  48: 'Fehler im Laserentfernungssensor', 49: 'Fehler im Laserentfernungssensor (Bumper)',
  50: 'Wasserpumpen Fehler', 51: 'Der Filter ist feucht oder verstopft',
  54: 'Kantensensor Fehler', 55: 'Teppich', 56: 'Der 3D-Hindernisvermeidungssensor ist defekt.',
  57: 'Kantensensor Fehler', 58: 'Der Ultraschallsensor ist gestört.',
  59: 'No-Go-Zone oder virtuelle Wand erkannt.', 61: 'Die Reinigungsroute ist blockiert.',
  62: 'Die Reinigungsroute ist blockiert.',
  63: 'Reinigungsroute ist blockiert kehre zur Dock zurück',
  64: 'Reinigungsroute ist blockiert kehre zur Dock zurück', 65: 'Sperrzone', 66: 'Sperrzone',
  67: 'Sperrzone', 68: 'Wischpad demontieren',
  69: 'Das Wischpad hat sich während der Reinigung gelöst.',
  70: 'Das Wischpad hat sich während der Reinigung gelöst.',
  71: 'Das Wischpad dreht sich nicht mehr', 72: 'Das Wischpad dreht sich nicht mehr',
  74: 'Die Installation des Wischpads ist fehlgeschlagen.', 75: 'Niedriger Batteriestatus.',
  76: 'Der Schmutzwassertank des Roboters ist nicht installiert.',
  78: 'Roboter im versteckten Bereich. Bitte aus dem Bereich entfernen und erneut versuchen.',
  79: 'LDS-Modul konnte nicht angehoben werden.',
  80: 'LDS kann hier zur Positionierung nicht angehoben werden.',
  81: 'LDS kann hier zur Positionierung nicht angehoben werden.',
  82: 'Rutschiger Boden. Bitte versuchen Sie es später erneut.',
  85: 'Bitte prüfen Sie, ob der Mopp richtig installiert ist.',
  86: 'Abnormaler Wasserstand im Schmutzwassertank des Roboters.',
  88: 'Bitte prüfen Sie, ob die einziehbaren Beine verheddert sind.',
  89: 'Fehlfunktion aufgrund eines internen Fehlers. Versuchen Sie, den Roboter neu zu starten.',
  90: 'LDS kann hier zur Positionierung nicht angehoben werden.',
  91: 'Roboter steckt zwischen Tischen und Stühlen fest.',
  92: 'Roboter steckt im engen Durchgang fest.',
  93: 'Roboter steckt an der Stufe/Schwelle fest.',
  94: 'Roboter steckt in einem Bereich mit geringer Höhe fest.',
  95: 'Roboter hat Rampen mit Absturzgefahr auf dem Weg erkannt.',
  96: 'Roboter hat Hindernisse auf dem Weg erkannt.',
  97: 'Roboter hat Personen oder Haustiere auf dem Weg erkannt.',
  98: 'Roboter steckt aufgrund von Rutschen fest.', 99: 'Roboter rutscht auf dem Teppich',
  101: 'Der Staubsaugerbeutel ist voll, oder der Luftkanal ist verstopft.',
  102: 'Die obere Abdeckung der Ladestation ist nicht geschlossen, oder der Staubsaugerbeutel ist nicht installiert.',
  103: 'Die obere Abdeckung der Ladestation ist nicht geschlossen, oder der Staubsaugerbeutel ist nicht installiert.',
  105: 'Der Frischwassertank ist nicht installiert.',
  106: 'Der Schmutzwassertank ist voll oder nicht installiert.',
  107: 'Niedriger Wasserstand im Frischwassertank, bitte rechtzeitig Wasser nachfüllen.',
  108: 'Der Schmutzwassertank ist voll oder nicht installiert.',
  109: 'Schmutzwassertank blockiert.', 110: 'Schmutzwassertank Pumpenfehler.',
  111: 'Das Wischpad ist nicht richtig installiert.',
  112: 'Der Wasserstand des Wischpads ist ungewöhnlich, bitte den Wischpad rechtzeitig reinigen.',
  114: 'Die Reinigungsaufgabe ist abgeschlossen, bitte das Wischpad reinigen.',
  116: 'Bitte den Frischwassertank umgehend überprüfen und nachfüllen.',
  117: 'Basisstation nicht eingeschaltet',
  118: 'Der Wasserstand im Schmutzwassertank ist zu hoch.',
  119: 'Wasserstand im Waschbrett ist zu hoch.', 120: 'Wischpad ist nicht in der Station.',
  121: 'Der Staubbeutel ist voll oder die Lüftungsschlitze sind blockiert.',
  123: 'Ungewöhnlicher Wasseraustritt aus dem Frischwassertank des oberen und unteren Wassermoduls.',
  124: 'Waschbrett funktioniert nicht mehr.',
  125: 'Abnormaler Wasserablauf aus dem Schmutzwassertank', 126: 'Mopp nicht erkannt.',
  127: 'Fehler bei Menge/Platzierung der Mopphalter in der Station.', 128: 'Stationsfehler.',
  129: 'Reinigung des schmutzigen Mopps fehlgeschlagen.',
  200: 'Roboter rutscht im Vorhangbereich', 201: 'Kantenmopp dreht sich nicht mehr.',
  202: 'Kantenmopp hat sich gelöst.', 203: 'Fehlfunktion der Fahrgestell-Anhebung.',
  207: 'Fehlfunktion aufgrund eines internen Fehlers. Versuchen Sie, den Roboter neu zu starten.',
  209: 'Prüfen Sie auf Fremdkörper in der Nähe der Mopprolle und der Abdeckung.',
  210: 'Prüfen Sie auf Fremdkörper in der Nähe der Mopprolle und der Abdeckung.',
  212: 'Roboterarm gestoppt', 213: 'Niedriger Wasserstand im Frischwassertank des Roboters.',
  214: 'Der Schmutzwassertank des Roboters ist voll.', 215: 'Mopp nicht installiert.',
  217: 'Fehler im Laserentfernungssensor',
  218: 'Prüfen Sie auf Fremdkörper in der Nähe der Mopprolle und der Abdeckung.',
  222: 'Fehler bei der Auflockerungsrolle.',
  223: 'Prüfen Sie auf Fremdkörper in der Nähe der Mopprolle und der Abdeckung.',
  224: 'Prüfen Sie auf Fremdkörper in der Nähe der Mopprolle und der Abdeckung.',
  225: 'Prüfen Sie auf Fremdkörper in der Nähe der Mopprolle und der Abdeckung.',
  226: 'Roboter durch Hindernis blockiert.', 227: 'Abflussfilter verstopft',
  228: 'Fehler der HauptrÃ¤der',
  229: 'Fehlfunktion aufgrund eines internen Fehlers. Versuchen Sie, den Roboter neu zu starten.',
  230: 'Fehlfunktion aufgrund eines internen Fehlers. Versuchen Sie, den Roboter neu zu starten.',
  1000: 'Rückkehr zum Laden fehlgeschlagen.',
};
// Codes, die HA nur als WARNUNG fuehrt (types.py WARNING_ERROR_CODE) — kein Defekt, sondern
// ein Hinweis. Werden gelb statt rot angezeigt.
const FEHLER_WARNUNG = new Set([9, 10, 20, 47, 51, 56, 68, 70, 71, 72, 75, 82, 85, 107, 114, 117, 121, 122, 123, 129, 213, 214]);

const MELDUNGEN = [
  { obj: 'error', text: v => FEHLER_DE[v] || ('Fehler ' + v),
    bei: (v, vst) => v > 0 && !fehlerUnterdruecken(v, vst),
    schwer: v => !FEHLER_WARNUNG.has(Number(v)) },
  { obj: 'clean-water-tank-status', text: () => 'Frischwassertank prüfen', bei: v => v > 0 },
  { obj: 'dirty-water-tank-status', text: () => 'Schmutzwassertank leeren', bei: v => v > 0 },
  { obj: 'low-water-warning', text: () => 'Wenig Wasser', bei: v => v > 0 },
  { obj: 'dust-bag-status', text: () => 'Staubbeutel voll', bei: v => v > 0 },
  { obj: 'detergent-status', text: () => 'Reinigungsmittel leer', bei: v => v > 0 },
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
