/*
 * Reinigungs-Panel: Modus/Route/Saugstaerke/Wassermenge (Kachel-Grid), Raumauswahl-Anzeige,
 * Start-Button-Semantik.
 * ========================================================================
 * Groesstes Panel — WIDGET_UMBAU_PLAN.md Etappe C, Commit C5, "Konsolidierungs-Commit"
 * (MAP_PLAN 7.2: alle Sende-Wege ueber Adapter-Trigger).
 *
 * Herkunft: browserseitiger Teil aus RicardoHipps Fork
 *   https://github.com/RicardoHipp/ioBroker.dreame
 * Reinigungsmodus/-route/Saugstaerke/Wassermenge-Logik (CLEAN_MODES/CLEAN_ROUTES/routenFuer/
 * modeSaugt/modeWischt) 1:1 aus legacy.html "Zustand"/"Reinigungs-Panel"-Bereichen uebernommen.
 *
 * Drei bewusste Abweichungen von Ricardo, alle auf Davids ausdrueckliche Entscheidung VOR
 * diesem Commit (siehe WIDGET_SESSION_STATUS.md):
 *
 * 1. Raumauswahl -> Reinigungsbefehl: NICHT Ricardos rohe MIoT-JSON-Liste
 *    (remote.start-custom-clean mit piid-10-selects), sondern das neuere Adapter-Feature
 *    remote.custom-room-cleaning.* (Checkbox-States pro Raum, seit Adapter v0.3.22). Die
 *    eigentliche Verdrahtung steckt in trigger.js (Trigger.startCustomRoomCleaning), hier
 *    nur der Aufruf vom Start-Knopf aus (siehe kopf.js-Diff dieses Commits).
 *
 * 2. Individuelle Pro-Raum-Einstellungen (Ricardos openRoomSettings(), Popup mit eigenem
 *    Modus/Saugstaerke/Wassermenge/Wiederholung je Raum, schreibt map.cleanset.<roomId>.*)
 *    sind NICHT Teil dieses Commits — eigener Entwurf/Speichern-Fluss, vertagt auf einen
 *    spaeteren Nachtrag. Der "Individuell pro Raum"-Umschalter, den Ricardos Original hier
 *    zeigt (schreibt remote.customized-cleaning), hatte im modularen Widget nur so lange
 *    einen Zweck, wie der Adapter dieses Flag als Vorbedingung fuer custom-room-cleaning.start
 *    verlangte — dieses Gate ist mit Fix b78772e entfernt (siehe WIDGET_SESSION_STATUS.md),
 *    die Kachel damit funktional obsolet und in Commit C6-2 (WIDGET_UMBAU_PLAN.md Abschnitt 6)
 *    wieder entfernt worden. remote.customized-cleaning wird weiterhin gespiegelt (siehe
 *    customizedCleaning unten) — der Schalter ist ein echter Geraetezustand, der auch ohne
 *    Widget-UI von aussen (App/altes Widget) gesetzt sein kann und weiterhin bestimmt, ob
 *    Modus/Route/Saug/Wasser-Kacheln und Karten-Badges die globalen oder die (hier nicht
 *    editierbaren) Pro-Raum-Werte zeigen.
 *
 * 3. Kein Auswahl-Overlay (openPicker/openSlider existieren im modularen Widget noch nicht,
 *    siehe station.js-Kommentarkopf zu C4): Modus/Route/Saugstaerke sind direkte
 *    <select>-Elemente im Panel selbst, kein Dialog. Fuer Saugstaerke (4 Stufen) passt das
 *    gut. Die Feuchtigkeits-Kachel (s.u.) bekam in der C5-Nachbesserung stattdessen einen
 *    <input type=range> -- 32 Stufen sprengen eine Auswahlliste, ist aber ebenso ein
 *    direktes Steuerelement im Panel, kein Dialog.
 *
 * Feuchtigkeits-Kachel bindet an remote.wetness-level (SIID 28-1, Range 1-32), NICHT mehr
 * an remote.water-volume wie im urspruenglichen C5-Commit geplant: water-volume existiert
 * am X40 nicht ("state not found", Live-Test 2026-07-23, siehe WIDGET_SESSION_STATUS.md
 * Bug 1) — wetness-level ist der tatsaechlich vorhandene State, Ricardos Legacy nutzt genau
 * den (cmd('remote.wetness-level', wert)). Die damit einhergehende Diskrepanz zur
 * custom-room-cleaning-Befehlsliste (main.js _buildCustomRoomCleaningSelects baut dort
 * weiterhin aus water-volume) ist bekannt und bewusst NICHT Teil dieser Nachbesserung — das
 * haengt an der sendeRoomAuswahl-Strategieentscheidung, die noch aussteht.
 * Existiert wetness-level fuer dieses Geraet nicht, bleibt die Kachel einfach aus — gleiches
 * "kein State = keine Zeile"-Muster wie Wartung/Statistik (C2/C3).
 *
 * Ersetzt main.js' B5-Platzhalter (customizedCleaning/globalSaug/globalWasser/raumSaugt/
 * raumWischt/raumWdh/updateCleanPanel) durch echte Werte — siehe main.js-Diff. raumSaug()/
 * raumWasser() (Pro-Raum-Werte fuer die Karten-Badges im Individuell-Betrieb) liefern wegen
 * Punkt 2 oben weiterhin den GLOBALEN Wert zurueck, nicht das echte cleanset des Raums —
 * Badges zeigen also bis zum Pro-Raum-Editor-Nachtrag denselben Wert unabhaengig von der
 * Betriebsart.
 */

/* global Panel, Trigger, Daten, geraetGestartet, updateRoomBadges, drawFills, updateLabels, t */

// ===== Reinigungsmodus: EINE Auswahl aus vier, wie das Geraet es kennt (remote.cleaning-mode,
// vom Adapter bereits auf 0-3 dekodiert — siehe lib/specs/cleaning.js CLEANING_MODE_DECODE).
// name-Felder wurden mit F3 (WIDGET_FEATURE_PLAN.md) durch i18n-Keys ersetzt -- Anzeigetext
// erst zur Laufzeit via t() in _renderModus() aufgeloest, NICHT hier als Modul-Top-Level-
// Konstante (t() liefert vor I18n.laden() nur Fallback-Werte, siehe i18n.js-Kommentarkopf). =====
const CLEAN_MODES = [
  { id: 0, key: 'panel.reinigung.modus.vacuum' },
  { id: 1, key: 'panel.reinigung.modus.mop' },
  { id: 2, key: 'panel.reinigung.modus.vacuum-mop' },
  { id: 3, key: 'panel.reinigung.modus.mop-after-vacuum' },
];
const modeWischt = id => id === 1 || id === 2 || id === 3;
const modeSaugt = id => id === 0 || id === 2 || id === 3;

// ===== Reinigungsroute (status.cleaning-route lesen, remote.set-cleaning-route schreiben).
// Reihenfolge wie HAs CLEANING_ROUTE_TO_NAME. =====
const CLEAN_ROUTES = [
  { id: 4, key: 'panel.reinigung.route.schnell' },
  { id: 1, key: 'panel.reinigung.route.standard' },
  { id: 2, key: 'panel.reinigung.route.intensiv' },
  { id: 3, key: 'panel.reinigung.route.tief' },
];
// Welche Routen der eingestellte Modus zulaesst — 1:1 HA device.py 749-758/1036-1044: beim
// Saugen und beim gleichzeitigen Saugen+Wischen faellt "Intensiv"/"Tief" weg (reine
// Wisch-Stufen).
const routenFuer = m => ((m === 0 || m === 2) ? CLEAN_ROUTES.filter(r => r.id !== 2 && r.id !== 3) : CLEAN_ROUTES);

const SUCT_KEYS = [
  'panel.reinigung.saug.leise',
  'panel.reinigung.saug.standard',
  'panel.reinigung.saug.stark',
  'panel.reinigung.saug.turbo',
];

// ===== Globale Bruecken-Werte fuer den Karten-Layer (render.js' baueBadge()/updateRoomBadges(),
// seit B2/B5 unveraendert) — ERSETZEN main.js' B5-Platzhalter, siehe Kommentarkopf oben. =====
// selectedRooms zog mit Etappe C5.5 (Commit 3) von main.js hierher um: seit C5.5-2 ist es
// kein per-Klick-Set mehr, sondern reiner Adapter-Spiegel (befuellt ausschliesslich durch
// _aktualisiereRaumMuster()/neueDatenMuster() unten) — gehoert damit inhaltlich zu diesem
// Panel, nicht mehr zur Karten-Grundgeruest-Datei main.js. render.js/overlays.js/kopf.js
// lesen ihn weiterhin als gemeinsamen Skript-Global (kein Bundler, siehe eslint.config.cjs).
const selectedRooms = new Set();
let customizedCleaning = false;
let globalSaug = 1;
let globalWasser = 3;
let cleanMode = 0;
// Punkt 2 im Kommentarkopf: kein Pro-Raum-Editor in diesem Commit, daher immer der globale
// Wert — unabhaengig davon, ob customizedCleaning an oder aus ist.
const raumSaugt = () => modeSaugt(cleanMode);
const raumWischt = () => modeWischt(cleanMode);
const raumWdh = () => 1;
const raumSaug = () => globalSaug;
const raumWasser = () => globalWasser;

class ReinigungPanel extends Panel {
  // F3 (WIDGET_FEATURE_PLAN.md), Blaupause fuer F6-F9: die vier Kacheln koennen einzeln im
  // Zahnrad-Overlay ausgeblendet werden (config.widget.panels.reinigung.versteckt).
  static versteckbareFelder = [
    { id: 'modus', labelKey: 'panel.reinigung.modus.label' },
    { id: 'route', labelKey: 'panel.reinigung.route.label' },
    { id: 'saug', labelKey: 'panel.reinigung.saug.label' },
    { id: 'wasser', labelKey: 'panel.reinigung.wasser.label' },
  ];

  constructor(id, container, config) {
    super(id, container, config);
    this.modus = null;
    this.route = null;
    this.saug = null;
    this.wasser = null;
    this.wasserDa = false;
    this.custom = null;
    // Adapter->Widget-Spiegelung der Raum-Checkboxen (Etappe C5.5, WIDGET_UMBAU_PLAN.md
    // Abschnitt 5.1, Commit 2). _mapId/_raumMuster/_raumVonState gehoeren zusammen, siehe
    // _aktualisiereRaumMuster().
    this._mapId = null;
    this._raumMuster = null;
    this._raumVonState = {}; // State-ID -> numerische Raum-ID (native.roomId)
    this._statischeTexteGesetzt = false; // F3: einmalig, siehe _renderStatischeTexte()
  }

  benoetigteStates(did) {
    this._idModus = `dreame.0.${did}.remote.cleaning-mode`;
    this._idRoute = `dreame.0.${did}.status.cleaning-route`;
    this._idSaug = `dreame.0.${did}.remote.suction-level`;
    this._idWasser = `dreame.0.${did}.remote.wetness-level`;
    this._idCustom = `dreame.0.${did}.remote.customized-cleaning`;
    this._idActiveMap = `dreame.0.${did}.remote.custom-room-cleaning.active-map`;
    return [this._idModus, this._idRoute, this._idSaug, this._idWasser, this._idCustom, this._idActiveMap];
  }

  init(did) {
    reinigungInstanz = this; // Bruecke fuer updateCleanPanel(), siehe Kommentarkopf
    return super.init(did);
  }

  neueDaten(stateId, wert) {
    if (stateId === this._idModus) {
      this.modus = wert == null ? null : Number(wert);
      cleanMode = this.modus ?? 0;
      this._pruefeRoute();
    } else if (stateId === this._idRoute) {
      this.route = wert == null ? null : Number(wert);
    } else if (stateId === this._idSaug) {
      this.saug = wert == null ? null : Number(wert);
      globalSaug = this.saug ?? 1;
    } else if (stateId === this._idWasser) {
      this.wasserDa = wert != null;
      this.wasser = wert == null ? null : Number(wert);
      if (this.wasser != null) globalWasser = this.wasser;
    } else if (stateId === this._idCustom) {
      this.custom = !!wert;
      customizedCleaning = this.custom;
    } else if (stateId === this._idActiveMap) {
      this._aktualisiereRaumMuster(wert == null ? null : String(wert));
      return; // _aktualisiereRaumMuster rendert selbst (async), hier nicht doppelt
    } else {
      return;
    }
    this.render();
  }

  /** Bei (Erst-)Bekanntwerden oder Wechsel der aktiven Karte: alte Raum-Muster-Subscription
   * abmelden, neue fuer die jetzt aktive Karte aufbauen. Adapter->Widget-Richtung von
   * C5.5-2 -- Gegenstueck zu trigger.js' ermittleAktiveKarte()/startCustomRoomCleaning(),
   * die dasselbe Muster fuer die Widget->Adapter-Richtung nutzen (dort einmalig beim Start,
   * hier dauerhaft abonniert). */
  async _aktualisiereRaumMuster(mapId) {
    if (this._mapId === mapId) return;
    if (this._raumMuster) this.entferneMusterAbo(this._raumMuster);
    // Raeume der bisherigen Karte aus der Auswahl nehmen -- sie gehoeren zu einer jetzt
    // nicht mehr aktiven Karte und duerfen nicht als "ausgewaehlt" stehen bleiben.
    for (const raumId of Object.values(this._raumVonState)) selectedRooms.delete(raumId);
    this._mapId = mapId;
    this._raumMuster = null;
    this._raumVonState = {};
    if (this.did !== null && mapId) {
      const muster = `dreame.0.${this.did}.remote.custom-room-cleaning.map-${mapId}.*`;
      const [objekte, werte] = await Promise.all([Daten.getObjects(muster), Daten.getStates(muster)]);
      if (this._mapId !== mapId || this.did === null) return; // waehrenddessen wieder gewechselt/abgebaut
      for (const [stateId, o] of Object.entries(objekte)) {
        if (!o || !o.native || o.native.roomId === undefined) continue;
        const raumId = Number(o.native.roomId);
        this._raumVonState[stateId] = raumId;
        const st = werte[stateId];
        if (st && st.val) selectedRooms.add(raumId); else selectedRooms.delete(raumId);
      }
      this._raumMuster = muster;
      this.abonniereMuster(muster);
    }
    drawFills();
    updateLabels();
    this.render();
  }

  /** Eingehende Checkbox-Aenderung (Klick am Adapter, Objekt-Editor, Skript, ...) in die
   * lokale Auswahl uebernehmen und die Karte neu zeichnen. Bewusst NICHT auf
   * document.activeElement/eigene Klicks pruefen wie bei _renderWasser() -- hier gibt es
   * (noch) kein Eingabeelement, das waehrend der Eingabe verfaelscht werden koennte. */
  neueDatenMuster(stateId, wert) {
    const raumId = this._raumVonState[stateId];
    if (raumId === undefined) return;
    if (wert) selectedRooms.add(raumId); else selectedRooms.delete(raumId);
    drawFills();
    updateLabels();
    this.render();
  }

  /** Kartenklick auf einen Raum (Etappe C5.5, Commit 3, Widget->Adapter-Richtung): schreibt
   * sofort den passenden Checkbox-State um, statt ein lokales Set zu toggeln. Die
   * eigentliche Anzeige-Aenderung kommt NICHT von hier, sondern erst ueber neueDatenMuster()
   * zurueck, sobald der Adapter die Aenderung bestaetigt (echtes Round-Trip, kein optimistisches
   * UI-Update) -- damit Widget und Adapter nie auseinanderlaufen koennen.
   * Kein Effekt, wenn der Raum zu keiner gerade abonnierten Karte gehoert (z.B. Klick waehrend
   * eines Kartenwechsels mitten im Um-Abonnieren) -- dann gibt es keinen Checkbox-State zum
   * Schreiben. */
  raumUmschalten(seg) {
    const stateId = Object.keys(this._raumVonState).find(id => this._raumVonState[id] === seg);
    if (!stateId) return;
    Daten.setState(stateId, !selectedRooms.has(seg));
  }

  /** Nach einem Moduswechsel kann die eingestellte Route wegfallen (Intensiv/Tief gibt es
   * beim Saugen nicht). HA setzt dann auf Standard zurueck — aber nur, solange KEIN Auftrag
   * laeuft: mitten in der Fahrt wuerde das die laufende Reinigung umstellen. 1:1 aus Ricardos
   * pruefeRoute() uebernommen. */
  _pruefeRoute() {
    if (this.route == null || geraetGestartet()) return;
    if (routenFuer(cleanMode).some(r => r.id === this.route)) return;
    Trigger.setCleaningRoute(this.did, 1);
  }

  render() {
    if (!this.container) return;
    this._renderStatischeTexte();
    this._renderRaum();
    this._renderModus();
    this._renderRoute();
    this._renderSaug();
    this._renderWasser();
    updateRoomBadges();
  }

  /** Panel-Ueberschrift + die vier Kachel-Labels einmalig uebersetzen (F3). Guard analog
   * zu den dataset.gefuellt-Guards bei den Kachel-Inhalten weiter unten -- statischer Text
   * aendert sich nie zur Laufzeit, muss also nicht bei jedem render() neu gesetzt werden. */
  _renderStatischeTexte() {
    if (this._statischeTexteGesetzt) return;
    this._statischeTexteGesetzt = true;
    const setzen = (id, key) => { const el = document.getElementById(id); if (el) el.textContent = t(key); };
    setzen('reinigungTitel', 'panel.reinigung.titel');
    setzen('reinigungModusLabel', 'panel.reinigung.modus.label');
    setzen('reinigungRouteLabel', 'panel.reinigung.route.label');
    setzen('reinigungSaugLabel', 'panel.reinigung.saug.label');
    setzen('reinigungWasserLabel', 'panel.reinigung.wasser.label');
  }

  // Etappe C6-4 (WIDGET_UMBAU_PLAN.md Abschnitt 6.4): "aktiv" vs. "gewählt" ist bewusst
  // unterschiedlicher Wortlaut -- "aktiv" markiert den Standardzustand (alle Räume, Start
  // reinigt alle), "gewählt" eine bewusste Auswahl (nur diese Räume). Gleiche Bedeutung wie
  // die Zwei-Zustaende-Faerbung in render.js (roomFill()/labelStyle()).
  _renderRaum() {
    const el = document.getElementById('reinigungRaum');
    if (!el) return;
    const n = selectedRooms.size;
    el.textContent = n === 0 ? t('panel.reinigung.raum.alle')
      : (n === 1 ? t('panel.reinigung.raum.gewaehlt-eins') : `${n} ${t('panel.reinigung.raum.gewaehlt-mehrere')}`);
  }

  /** Bei Raum-Auswahl waehlt das X40 den Modus pro Raum selbst und ignoriert den globalen
   * remote.cleaning-mode (live verifiziert, siehe WIDGET_SESSION_STATUS.md Etappe C5.5-Test
   * "X40-Eigenheit, kein Bug"). Die Kachel bliebe sonst bedienbar, obwohl die Einstellung beim
   * Start wirkungslos ist -- deshalb hier ausgegraut + Tooltip statt stillschweigend falscher
   * Anzeige (Plan Abschnitt 6, Commit C6-3). Tooltip sitzt auf der umschliessenden .rkarte,
   * nicht auf dem <select> selbst: disabled-Formelemente feuern in den meisten Browsern keine
   * hover-Events, ein title auf dem <select> wuerde also nie sichtbar werden. */
  _renderModus() {
    const el = document.getElementById('reinigungModus');
    const karte = document.getElementById('reinigungModusKarte');
    if (!el) return;
    if (karte) karte.hidden = this.feldVersteckt('modus');
    if (!el.dataset.gefuellt) {
      el.innerHTML = CLEAN_MODES.map(m => `<option value="${m.id}">${t(m.key)}</option>`).join('');
      el.dataset.gefuellt = '1';
      el.onchange = () => Trigger.setCleaningMode(this.did, Number(el.value));
    }
    if (this.modus != null) el.value = String(this.modus);
    const raumAktiv = selectedRooms.size > 0;
    el.disabled = customizedCleaning || geraetGestartet() || raumAktiv;
    if (karte) karte.title = raumAktiv ? t('panel.reinigung.modus.raum-hinweis') : '';
  }

  _renderRoute() {
    const el = document.getElementById('reinigungRoute');
    const karte = document.getElementById('reinigungRouteKarte');
    if (!el) return;
    if (karte) karte.hidden = this.feldVersteckt('route');
    const optionen = routenFuer(cleanMode);
    const schluessel = optionen.map(r => r.id).join(',');
    if (el.dataset.schluessel !== schluessel) {
      el.innerHTML = optionen.map(r => `<option value="${r.id}">${t(r.key)}</option>`).join('');
      el.dataset.schluessel = schluessel;
      el.onchange = () => Trigger.setCleaningRoute(this.did, Number(el.value));
    }
    if (this.route != null && optionen.some(r => r.id === this.route)) el.value = String(this.route);
    el.disabled = customizedCleaning;
  }

  _renderSaug() {
    const el = document.getElementById('reinigungSaug');
    const karte = document.getElementById('reinigungSaugKarte');
    if (!el) return;
    if (karte) karte.hidden = this.feldVersteckt('saug');
    if (!el.dataset.gefuellt) {
      el.innerHTML = SUCT_KEYS.map((key, i) => `<option value="${i}">${t(key)}</option>`).join('');
      el.dataset.gefuellt = '1';
      el.onchange = () => Trigger.setSuctionLevel(this.did, Number(el.value));
    }
    if (this.saug != null) el.value = String(this.saug);
    el.disabled = customizedCleaning || !modeSaugt(cleanMode);
  }

  /** Feuchtigkeits-Regler (remote.wetness-level, 1-32) -- Slider statt Dropdown, s.
   * Kommentarkopf. oninput haelt nur Wert-Anzeige/Fuellstand waehrend des Ziehens nach,
   * gesendet wird erst bei onchange (Loslassen) -- gleiches Muster wie overlays.js' uiRange/
   * lgRange. --fill setzt den Slider hier selbst (reglerFuellung() aus legacy.html existiert
   * im modularen Widget noch nicht). */
  _renderWasser() {
    const karte = document.getElementById('reinigungWasserKarte');
    const el = document.getElementById('reinigungWasser');
    const wertEl = document.getElementById('reinigungWasserWert');
    if (!el || !karte) return;
    karte.hidden = !this.wasserDa || this.feldVersteckt('wasser');
    if (!this.wasserDa) return;
    const fuellen = () => {
      const pct = (Number(el.value) - Number(el.min)) / (Number(el.max) - Number(el.min)) * 100;
      el.style.setProperty('--fill', pct + '%');
      if (wertEl) wertEl.textContent = el.value;
    };
    if (!el.dataset.gefuellt) {
      el.dataset.gefuellt = '1';
      el.oninput = fuellen;
      el.onchange = () => Trigger.setWetnessLevel(this.did, Number(el.value));
    }
    if (this.wasser != null && document.activeElement !== el) el.value = String(this.wasser);
    fuellen();
    el.disabled = customizedCleaning || !modeWischt(cleanMode);
  }

  dispose() {
    if (reinigungInstanz === this) reinigungInstanz = null;
    super.dispose();
  }
}

// Bruecke zum Karten-Layer (render.js' selectRoom() ruft updateCleanPanel() bei jedem
// Raum-Klick auf, seit B2/B5 als main.js-Platzhalter — hier ERSETZT, gleiches Muster wie
// kopf.js' geraetGestartet()/updateBadges()).
let reinigungInstanz = null;
function updateCleanPanel() { if (reinigungInstanz) reinigungInstanz.render(); }

// Bruecke zum Karten-Layer fuer den Widget->Adapter-Schreibweg (Etappe C5.5, Commit 3):
// render.js' selectRoom() ruft das statt eines lokalen Set-Toggles auf, gleiches
// Bruecken-Muster wie updateCleanPanel() direkt darueber.
function raumUmschalten(seg) { if (reinigungInstanz) reinigungInstanz.raumUmschalten(seg); }
