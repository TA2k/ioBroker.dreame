/*
 * Kopf-Panel: Status, Start/Stop/Home-Aktionen.
 * ========================================================================
 * Herkunft: browserseitiger Teil des Karten-Widgets aus RicardoHipps Fork
 *   https://github.com/RicardoHipp/ioBroker.dreame
 * Status-Namen 1:1 aus der Home-Assistant-Referenz uebernommen (siehe Kommentare unten) —
 * Ursprung:
 *   dreame-vacuum (Home Assistant Integration) von Tasshack
 *   https://github.com/Tasshack/dreame-vacuum — Copyright (c) 2022 Tasshack — MIT License
 *
 * MIT License — the above copyright notice and this permission notice shall be
 * included in all copies or substantial portions of the Software.
 * -----------------------------------------------------------------------------
 *
 * Aus www/legacy.html hierher uebernommen (WIDGET_UMBAU_PLAN.md Etappe C, Commit C1),
 * JS-Bereiche 9 "Roboter-Status", 12 "Start/Pause" und der Warnungs-Teil von Bereich 11
 * "Verbrauchsmaterial, Meldungen, Statistik" (WIDGET_ARCHITEKTUR.md Tabelle 7: Kopfzeile =
 * Bereiche 9, 12, 11). Verbrauchsmaterial und Statistik selbst bleiben in legacy.html liegen,
 * bis Etappe C2/C3 sie in eigene Panels ueberfuehren. Der Warnungs-Teil ist seit der
 * C-Aufraeumung (WIDGET_UMBAU_PLAN.md Abschnitt 6, Commit C6-1) selbst wieder ausgekoppelt,
 * siehe fehler.js.
 *
 * Anders als die Karten-Dateien (merger.js/render.js/overlays.js) NICHT 1:1-Extraktion,
 * sondern in die Panel-Klasse eingebettet (Commit-B4-Vorbild) — der Karten-Layer braucht
 * aus diesem Panel aber weiterhin zwei GLOBALE Funktionen, weil er (bewusst flach gehalten,
 * siehe merger.js/render.js/overlays.js-Kommentarkoepfe) sie beim Namen aufruft, nicht ueber
 * eine Instanz: geraetGestartet() (render.js' updateRoomBadges()/baueBadge()) und
 * updateBadges() (overlays.js' buildOverlay()). Beide waren in main.js (Commit B5) als
 * sichere No-op-Platzhalter deklariert ("wird in Etappe C ersetzt") — hier ERSETZT, siehe
 * main.js-Diff dieses Commits. Duenne Bruecken-Funktionen unten, die auf die jeweils aktive
 * KopfPanel-Instanz zeigen (es gibt zu jedem Zeitpunkt hoechstens eine).
 */

/* global Trigger, Panel, uiIcon, NS, ICON, ICON_SIZE, robotMk, chargerMk, selectedRooms */

// ===== Roboter-Status (HA device.robot_status / station_status, 1:1 geportet) =====

// HA device.robot_status: 1=Reinigung, 2=Laden, 3=Schlafen; +10 Fehler
function robotStatusCode(vst) {
  const st = vst.status;
  const running = [2, 4, 5, 18, 19, 20, 22, 23, 24, 25].includes(st);
  const charging = vst.charging === 1 || vst.state === 6 || vst.state === 13 || vst.state === 24;
  const sleeping = st === 14;
  let v = 0;
  if (running) v = 1; else if (charging) v = 2; else if (sleeping) v = 3;
  if (st === 12) v += 10; // Fehler -> Warn-Badge
  return v;
}

// HA device.station_status: 2=Waschen, 4=Trocknen (an der Basisstation).
// Trocknung NUR ueber state 8/35 — drying-progress bleibt nach Ende stehen (stale).
// types.py DreameVacuumSelfWashBaseStatus / DreameVacuumAutoEmptyStatus
const WASH = {
  IDLE: 0, WASHING: 1, DRYING: 2, RETURNING: 3, PAUSED: 4, CLEAN_ADD_WATER: 5,
  ADDING_WATER: 6, RETURNING_FOR_DRY_MOP: 7,
};
const EMPTY_ACTIVE = 1;
/**
 * 1:1-Port von HA device.py station_status (8624-8641):
 *   1 = entleeren, 2 = waschen, 3 = waschen pausiert, 4 = trocknen,
 *   5/6 = Staubbeutel-Trocknung (6 = pausiert), +10 = Heisswaesche
 *
 * ➖ Abweichung: HAs hot_washing hat zwei Zweige. Wir bilden nur den ersten ab
 * (hot_water_status == 1); der zweite laeuft ueber eine AutoSwitch-Eigenschaft, die der
 * Adapter nicht bereitstellt.
 * ➖ Abweichung: HAs dust_bag_drying_paused hat bei uns keine Entsprechung — wir melden die
 * Staubbeutel-Trocknung deshalb immer als laufend (5), nie als pausiert (6).
 */
function stationStatusCode(vst) {
  if (vst.empty === EMPTY_ACTIVE) return 1;
  const w = vst.wash;
  let value = 0;
  if (w === WASH.WASHING || w === WASH.CLEAN_ADD_WATER) value = 2;
  if (w === WASH.PAUSED) value = 3;
  if (w === WASH.DRYING) value = 4;
  else if (vst.state === 35) value = 5; // Staubbeutel-Trocknung
  if (value && vst.hotw === 1) value += 10;
  return value;
}

// ===== Start / Pause: HA device.py started (9038-9058) =====
const TS = { UNKNOWN: -1, COMPLETED: 0, DOCKING_PAUSED: 11 };
const ST = {
  CLEANING: 2, BACK_HOME: 3, PARTIAL_CLEANING: 4, SEGMENT_CLEANING: 18, ZONE_CLEANING: 19,
  SPOT_CLEANING: 20, FAST_MAPPING: 21, CRUISING_PATH: 22, CRUISING_POINT: 23, SHORTCUT: 25,
};
const STATE_PAUSED = 3; // types.py DreameVacuumState.PAUSED

/** HA device.py 9038-9058 — Geraet hat eine aktive Aufgabe. */
function istGestartet(vst) {
  // HA-Eigenheit: ein unbekannter/fehlender task_status ist weder COMPLETED noch
  // DOCKING_PAUSED und gilt damit als "gestartet". Solange wir noch gar nichts vom Geraet
  // wissen (null), waere das falsch — dann lieber "nicht gestartet".
  if (vst.tstat == null && vst.status == null) return false;
  const t = vst.tstat == null ? TS.UNKNOWN : vst.tstat;
  const s = vst.status;
  return Boolean(
    (t !== TS.COMPLETED && t !== TS.DOCKING_PAUSED)
    || !!vst.cpaused
    || s === ST.CLEANING || s === ST.SEGMENT_CLEANING || s === ST.ZONE_CLEANING
    || s === ST.SPOT_CLEANING || s === ST.PARTIAL_CLEANING || s === ST.FAST_MAPPING
    || s === ST.CRUISING_PATH || s === ST.CRUISING_POINT || s === ST.SHORTCUT
  );
}

// ===== Status-Text (DreameVacuumState, Detail) =====
const STATE_DE = {
  '-1': 'Unbekannt', 1: 'Reinigung', 2: 'Standby', 3: 'Pausiert', 4: 'Fehler',
  5: 'Zurück zum Aufladen', 6: 'Laden', 7: 'Wischen', 8: 'Mopp-Trocknung', 9: 'Mopp-Reinigung',
  10: 'Rückkehr zum Reinigen', 11: 'Eine Karte wird erstellt', 12: 'Beim Reinigen', 13: 'Laden beendet',
  14: 'Aktualisieren', 15: 'Reinigung rufen', 16: 'Automatische Reparatur der Basisstation',
  17: 'Zurückkehren zum Installieren des Wischmopps', 18: 'Zurückkehren, um das Wischpad zu entfernen',
  19: 'Selbsttest Wasserzufuhr/-abfluss läuft', 20: 'Wischmopp reinigen und Wasser nachfüllen',
  21: 'Mopp-Reinigung pausiert', 22: 'Automatische Entleerung', 23: 'Ferngesteuerte Reinigung',
  24: 'Intelligentes Aufladen', 25: 'Zweite Reinigung läuft', 26: 'Folgend', 27: 'Partielle Reinigung',
  28: 'Rückfahrt zur Staubsammlung', 29: 'Auf Aufgaben warten', 30: 'Reinigung der Waschplattenbasis',
  31: 'Rückfahrt zum Wasserablassen', 32: 'Wasser wird abgelassen',
  33: 'Wasserzufuhr/-ableitung: Entleeren', 34: 'Staubbehälter wird entleert',
  35: 'Trocknung von Staubbehälter und -beutel',
  36: 'Trocknen von Staubbehälter/-beutel angehalten', 37: 'Weiter zum zusätzlichen Reinigungsbereich',
  38: 'Zusätzliche Reinigung läuft', 95: 'Haustiersuche pausiert', 96: 'Haustiersuche',
  97: 'Shortcut läuft', 98: 'Kameraüberwachung läuft', 99: 'Kameraüberwachung pausiert',
  101: 'Anfängliche Tiefenreinigung läuft', 102: 'Anfängliche Tiefenreinigung pausiert',
  103: 'Desinfizieren', 104: 'Desinfizieren mit Trocknen', 105: 'Wischmopp wird gewechselt',
  106: 'Umschalten des Wischmopps pausiert', 107: 'Pflege im Gange', 108: 'Pflege pausiert',
  109: 'Gegenstand wird aufgenommen', 113: 'Gegenstände werden einsortiert',
  114: 'Haustier-Überwachung', 115: 'Haustier-Überwachung pausiert',
  116: 'Wischmopp wird angebracht', 117: 'Wischmopp wird abgenommen',
  118: 'Intelligentes Nachladen', 120: 'Unterstützte Reinigung',
  121: 'Fährt in die Station', 122: 'Verlässt die Station',
  140: 'Fährt zum Treppensteiger', 141: 'Dockt am Treppensteiger an', 142: 'Am Treppensteiger angedockt',
  143: 'Treppensteiger navigiert', 144: 'Steigt Treppen', 145: 'Treppensteigen beendet',
  146: 'Treppensteiger an der Station', 147: 'Treppensteiger verlässt die Station',
};

// ===== Badges auf Roboter-/Ladestations-Marker (Karten-Layer, siehe Kommentarkopf) =====
// Badge-Bild in einer Icon-Gruppe setzen/entfernen (pos: 'behind'=Kreis hinter dem Icon,
// 'corner'=klein daneben, 'above'=ueber dem Icon — wie HAs Platzierungen)
function setBadge(group, key, href, size, pos) {
  if (!group) return;
  const old = group.querySelector('image[data-badge]');
  if (old && old.getAttribute('data-badge') === key) return;
  if (old) old.remove();
  if (!href || !key) return;
  const im = document.createElementNS(NS, 'image');
  im.setAttribute('data-badge', key);
  im.setAttribute('href', href); im.setAttributeNS('http://www.w3.org/1999/xlink', 'href', href);
  if (pos === 'corner') { im.setAttribute('x', size * 0.35); im.setAttribute('y', -size * 0.75); im.setAttribute('width', size * 0.45); im.setAttribute('height', size * 0.45); }
  else if (pos === 'above') { im.setAttribute('x', -size * 0.45); im.setAttribute('y', -size * 1.25); im.setAttribute('width', size * 0.9); im.setAttribute('height', size * 0.9); }
  else { im.setAttribute('x', -size * 0.65); im.setAttribute('y', -size * 0.65); im.setAttribute('width', size * 1.3); im.setAttribute('height', size * 1.3); }
  if (pos === 'behind') group.insertBefore(im, group.firstChild); // hinter dem Roboter (wie HA)
  else group.appendChild(im);
}

class KopfPanel extends Panel {
  constructor(id, container) {
    super(id, container);
    this.vst = {
      state: null, status: null, battery: null, charging: null, cprog: null, dprog: null,
      carea: null, ctime: null, tstat: null, cpaused: null, wash: null, empty: null,
      hotw: null, tank: null, mopstat: null, drain: null, dustcol: null,
    };
    this._idZuVst = {};
  }

  benoetigteStates(did) {
    const pfad = suffix => `dreame.0.${did}.status.${suffix}`;
    const vstSuffix = {
      state: 'state', status: 'status', battery: 'battery-level', charging: 'charging-status',
      tstat: 'task-status', cpaused: 'cleaning-paused', wash: 'self-wash-base-status',
      empty: 'auto-empty-status', hotw: 'hot-water-status', tank: 'water-tank',
      mopstat: 'mop-in-station', drain: 'drainage-status', dustcol: 'dust-collection',
      cprog: 'cleaning-progress', dprog: 'drying-progress', carea: 'cleaned-area', ctime: 'cleaning-time',
    };
    this._idZuVst = {};
    for (const [key, suffix] of Object.entries(vstSuffix)) this._idZuVst[pfad(suffix)] = key;
    return Object.keys(this._idZuVst);
  }

  init(did) {
    kopfInstanz = this; // Bruecke fuer geraetGestartet()/updateBadges(), siehe Kommentarkopf
    return super.init(did);
  }

  neueDaten(stateId, wert) {
    const vstKey = this._idZuVst[stateId];
    if (!vstKey) return;
    this.vst[vstKey] = (wert == null || wert === '') ? null : Number(wert);
    this.render();
  }

  istGestartet() { return istGestartet(this.vst); }

  /** Badges auf Robotermarker/Ladestations-Marker (Karten-Layer). No-op, solange die Marker
   * (Commit B5/main.js) noch nicht existieren — setBadge() prueft das selbst ab. */
  aktualisiereBadges() {
    let rs = robotStatusCode(this.vst);
    const warn = rs >= 10; if (warn) rs -= 10;
    if (warn) setBadge(robotMk, 'warn', ICON.ST_WARNING, ICON_SIZE.robot, 'behind');
    else if (rs === 1) setBadge(robotMk, 'clean', ICON.ST_CLEANING, ICON_SIZE.robot, 'behind');
    else if (rs === 2) setBadge(robotMk, 'charge', ICON.ST_CHARGING, ICON_SIZE.robot, 'behind');
    else if (rs === 3) setBadge(robotMk, 'sleep', ICON.ST_SLEEPING, ICON_SIZE.robot, 'corner');
    else setBadge(robotMk, null);
    // Zuordnung 1:1 wie HA map.py 10908-10996: erst Heisswaesche abspalten (>=10), dann
    // 1 = entleeren, 2-3 = waschen, 5-6 = Staubbeutel, sonst (4) = trocknen.
    let ss = stationStatusCode(this.vst);
    const heiss = ss >= 10; if (heiss) ss -= 10;
    if (ss === 0) setBadge(chargerMk, null);
    else if (ss === 1) setBadge(chargerMk, 'empty', ICON.ST_EMPTYING, ICON_SIZE.charger, 'above');
    else if (ss < 4) setBadge(chargerMk, heiss ? 'hotwash' : 'wash', heiss ? ICON.ST_HOT_WASHING : ICON.ST_WASHING, ICON_SIZE.charger, 'above');
    else if (ss === 5 || ss === 6) setBadge(chargerMk, 'bagdry', ICON.ST_DUST_BAG_DRYING, ICON_SIZE.charger, 'above');
    else setBadge(chargerMk, heiss ? 'hotdry' : 'dry', heiss ? ICON.ST_HOT_DRYING : ICON.ST_DRYING, ICON_SIZE.charger, 'above');
  }

  render() {
    if (!this.container) return;
    this._renderStatus();
    this._renderInfo();
    this._renderButtons();
    this.aktualisiereBadges();
  }

  _renderStatus() {
    const t = document.getElementById('stateText'), s = document.getElementById('stateSub');
    if (!t) return;
    const vst = this.vst;
    t.textContent = (vst.state != null && STATE_DE[vst.state]) ? STATE_DE[vst.state] : (vst.state != null ? 'Status ' + vst.state : '–');
    // Akku/Reinigungsfortschritt/Flaeche stehen seit der Info-Reihe (_renderInfo) nicht
    // mehr hier -- nur noch, was dort keinen Platz hat (Dauer, Trocknungsfortschritt).
    const teile = [];
    const laeuftAehnlich = [1, 7, 12, 21, 25, 27, 37, 38, 101, 102].includes(vst.state);
    if (laeuftAehnlich && vst.ctime > 0) teile.push(vst.ctime + ' min');
    if ((vst.state === 8 || vst.state === 35) && vst.dprog > 0) teile.push('Trocknung ' + vst.dprog + ' %');
    s.innerHTML = teile.length ? teile.join(' · ') : '–';
  }

  /** Info-Reihe: Akku, Reinigungsfortschritt, Flaeche (WIDGET_UMBAU_PLAN.md Etappe C,
   * C1-Nachbesserung). Reinigung nutzt status.cleaning-progress direkt statt cleaned-area
   * durch eine Gesamtflaeche zu teilen -- ein status.total-area gibt es beim Vacuum nicht
   * (im Objektbaum nachgesehen), das Geraet liefert den Prozentwert bereits fertig.
   * Akku zeigt immer den aktuellen Wert; Reinigung/Flaeche zeigen "–", solange Gina steht
   * -- cleaned-area/cleaning-progress stehen dann bereits auf 0 (das Geraet haelt keinen
   * "letzte Reinigung"-Wert vor), eine Zahl waere hier irrefuehrender als ein Platzhalter. */
  _renderInfo() {
    const elAkku = document.getElementById('info-akku');
    if (!elAkku) return;
    const vst = this.vst;
    elAkku.textContent = vst.battery != null ? vst.battery + ' %' : '–';
    const aktiv = istGestartet(vst);
    document.getElementById('info-reinigung').textContent = (aktiv && vst.cprog != null) ? vst.cprog + ' %' : '–';
    document.getElementById('info-flaeche').textContent = (aktiv && vst.carea != null) ? vst.carea + ' m²' : '–';
  }

  /**
   * Start/Stop/Home. Bewusst EINFACHER als Ricardos Original: dort ist der Start-Knopf
   * zusaetzlich ein Umschalter (Start/Fortsetzen/Pause, mit optimistischer Sofort-Anzeige
   * nach dem Tippen) — Trigger.js kennt keinen Pause-Trigger, diese optimistische Anzeige
   * wurde bewusst nicht uebernommen (siehe C1-Kommentar in WIDGET_SESSION_STATUS.md).
   *
   * Raumbasierte Start-Semantik (Etappe C, Commit C5, WIDGET_UMBAU_PLAN.md "Start-Button-
   * Semantik: bei Auswahl -> startCustomRoomCleaning, bei 'alles' -> startCleaning") jetzt
   * umgesetzt: `selectedRooms` (seit Etappe C5.5/Commit 3 in reinigung.js, reiner
   * Adapter-Spiegel statt lokalem Klick-Set) entscheidet.
   * Seit C5.5-4 wird die Auswahl NICHT mehr hier lokal geleert: `Trigger.startCustomRoomCleaning()`
   * setzt die Checkbox-States nach dem Start selbst auf `false` zurueck (trigger.js) — die
   * Aenderung kommt wie jede andere Checkbox-Aenderung ueber die C5.5-2-Muster-Subscription
   * zurueck und raeumt `selectedRooms` samt Kartenanzeige auf demselben Weg auf wie ein
   * manuelles Abwaehlen. Kein manuelles `drawFills()`/`updateLabels()`/`updateCleanPanel()`
   * mehr an dieser Stelle noetig.
   */
  _renderButtons() {
    const start = document.getElementById('c-start');
    const stop = document.getElementById('c-stop');
    const home = document.getElementById('c-home');
    if (!start || !stop || !home) return;
    start.innerHTML = uiIcon('start', 18) + '<span class="abtext">Start</span>';
    start.onclick = () => {
      if (selectedRooms.size === 0) Trigger.startCleaning(this.did);
      else Trigger.startCustomRoomCleaning(this.did);
    };
    stop.innerHTML = uiIcon('stop', 20);
    stop.onclick = () => Trigger.stopCleaning(this.did);
    home.innerHTML = uiIcon('home', 20);
    home.onclick = () => Trigger.chargeHome(this.did);
  }

  dispose() {
    if (kopfInstanz === this) kopfInstanz = null;
    super.dispose();
  }
}

// Bruecke zum Karten-Layer (siehe Kommentarkopf): hoechstens eine KopfPanel-Instanz aktiv.
let kopfInstanz = null;
function geraetGestartet() { return kopfInstanz ? kopfInstanz.istGestartet() : false; }
function updateBadges() { if (kopfInstanz) kopfInstanz.aktualisiereBadges(); }

// Registrierung selbst in main.js (siehe panel.js-Kommentarkopf: "main.js registriert dort
// jede Panel-Klasse"), nicht hier — main.js bleibt die einzige Stelle, die die Panel-Liste
// kennt.
