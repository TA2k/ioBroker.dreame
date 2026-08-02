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

/* global Panel, uiIcon, Trigger, Daten, geraetGestartet, updateRoomBadges, drawFills, updateLabels, roomName, META */

// ===== Reinigungsmodus: EINE Auswahl aus vier, wie das Geraet es kennt (remote.cleaning-mode,
// vom Adapter bereits auf 0-3 dekodiert — siehe lib/specs/cleaning.js CLEANING_MODE_DECODE). =====
const CLEAN_MODES = [
  { id: 0, name: 'Saugen' },
  { id: 1, name: 'Wischen' },
  { id: 2, name: 'Saugen und Wischen' },
  { id: 3, name: 'Wischen nach Saugen' },
];
const modeWischt = id => id === 1 || id === 2 || id === 3;
const modeSaugt = id => id === 0 || id === 2 || id === 3;

// ===== Reinigungsroute (status.cleaning-route lesen, remote.set-cleaning-route schreiben).
// Reihenfolge wie HAs CLEANING_ROUTE_TO_NAME. =====
const CLEAN_ROUTES = [
  { id: 4, name: 'Schnell' },
  { id: 1, name: 'Standard' },
  { id: 2, name: 'Intensiv' },
  { id: 3, name: 'Tief' },
];
// Welche Routen der eingestellte Modus zulaesst — 1:1 HA device.py 749-758/1036-1044: beim
// Saugen und beim gleichzeitigen Saugen+Wischen faellt "Intensiv"/"Tief" weg (reine
// Wisch-Stufen).
const routenFuer = m => ((m === 0 || m === 2) ? CLEAN_ROUTES.filter(r => r.id !== 2 && r.id !== 3) : CLEAN_ROUTES);

const SUCT_NAMES = ['Leise', 'Standard', 'Stark', 'Turbo'];

// ===== Pro-Raum-Editor (Individuell-Betrieb): das je Raum gespeicherte cleanset bearbeiten.
// "Wischen nach Saugen" (Modus 3) gibt es hier NICHT -- das ist ein Ablauf fuer die ganze
// Wohnung, kein Raum-Modus (1:1 HA device.py 745-747, entfernt MOPPING_AFTER_SWEEPING aus
// der Segment-Liste).
//
// WICHTIG -- die Modus-IDs stehen hier ROH, ohne den 0<->2-Tausch fuer Geraete mit
// Mopp-Anhebung. Der Tausch gilt nur fuer den GLOBALEN cleaning-mode: den dekodiert/kodiert
// der Adapter ueber die Spec (lib/specs/cleaning.js CLEANING_MODE_DECODE, angewandt in
// main.js ueber deviceHasMopPadLifting). Der cleanset-CleaningMode laeuft dagegen ungetauscht
// durch (main.js onStateChange -> UpdateRoomSettings ChangeType 4 -> customeClean).
// Live geprueft an einem X40 Ultra (Waschstation 4-25 + Absaugstation 15-5, also Tausch beim
// globalen Modus aktiv): was hier im Editor eingestellt wird, zeigt die Dreame-App fuer
// denselben Raum unveraendert an. Hier also NICHT "der Einheitlichkeit halber" tauschen --
// das wuerde Saugen und Saugen+Wischen je Raum vertauschen. =====
const ROOM_MODES = [
  { id: 0, name: 'Saugen' },
  { id: 1, name: 'Wischen' },
  { id: 2, name: 'Saugen und Wischen' },
];
// Route je Raum: dieselbe Liste wie global, aber ohne "Schnell" -- HA nimmt QUICK bei der
// Segment-Route heraus (device.py 760-763, segment_slow_clean_route).
const RAUM_ROUTEN = CLEAN_ROUTES.filter(r => r.id !== 4);
const ROOM_REPEATS = [
  { id: 1, name: '1×' },
  { id: 2, name: '2×' },
  { id: 3, name: '3×' },
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
// Pro-Raum-cleanset fuer die Karten-Badges: raumId -> RoomSettings-Array
// [Level, WaterVolume, Repeat, RoomOrder, CleaningMode, Route] (Reihenfolge live verifiziert
// an map.cleanset.<id>.RoomSettings, z.B. [1,15,1,5,2,1]). Befuellt durch das cleanset-
// Muster-Abo (_merkeCleanset/_ladeCleansets unten).
const roomCleanset = {};
// Im Individuell-Betrieb zeigen die Badges die je Raum gespeicherten Werte, sonst (einheitlich
// oder cleanset noch nicht geladen) den globalen. render.js' baueBadge() ruft diese mit der
// Raum-ID auf und entscheidet selbst zwischen einheitlich (globalSaug/-Wasser) und individuell.
const raumSaugt = id => { const cs = roomCleanset[id]; return (customizedCleaning && cs) ? modeSaugt(Number(cs[4])) : modeSaugt(cleanMode); };
const raumWischt = id => { const cs = roomCleanset[id]; return (customizedCleaning && cs) ? modeWischt(Number(cs[4])) : modeWischt(cleanMode); };
const raumWdh = id => { const cs = roomCleanset[id]; return (customizedCleaning && cs) ? (Number(cs[2]) || 1) : 1; };
const raumSaug = id => { const cs = roomCleanset[id]; return (customizedCleaning && cs) ? Number(cs[0]) : globalSaug; };
const raumWasser = id => { const cs = roomCleanset[id]; return (customizedCleaning && cs) ? Number(cs[1]) : globalWasser; };

class ReinigungPanel extends Panel {
  constructor(id, container) {
    super(id, container);
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
    // Pro-Raum-Editor: _fokus = gerade bearbeiteter Raum (null = globale Ansicht),
    // _fokusCS = dessen cleanset als { Level, WaterVolume, CleaningMode, Repeat, Route }.
    this._fokus = null;
    this._fokusCS = null;
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

  /** Pro-Raum-cleanset (RoomSettings aller Raeume) fuer die Karten-Badges abonnieren. Das
   * Raum-Checkbox-Muster kommt dynamisch dazu (_aktualisiereRaumMuster, haengt an der aktiven
   * Karte); das cleanset haengt an der aktuellen Karte generell, deshalb hier statisch. */
  benoetigteMuster(did) {
    this._idCleansetMuster = `dreame.0.${did}.map.cleanset.*.RoomSettings`;
    return [this._idCleansetMuster];
  }

  init(did) {
    reinigungInstanz = this; // Bruecke fuer updateCleanPanel(), siehe Kommentarkopf
    // Nach dem Basis-Init die aktuellen cleanset-Werte einmal nachladen -- das Muster-Abo
    // liefert nur kuenftige Aenderungen, die Badges brauchen aber sofort die gespeicherten
    // Raum-Werte (gleicher Grund wie das getState() fuer feste States in Panel.init()).
    return super.init(did).then(() => this._ladeCleansets(did));
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

  /** Ein RoomSettings-State in roomCleanset uebernehmen. Wert ist ein Array (oder dessen
   * JSON-Text) [Level, WaterVolume, Repeat, RoomOrder, CleaningMode, Route]. Liefert true,
   * wenn es ein cleanset-State war (dann NICHT als Raum-Checkbox weiterbehandeln). */
  _merkeCleanset(stateId, wert) {
    const m = stateId.match(/\.map\.cleanset\.(\d+)\.RoomSettings$/);
    if (!m) return false;
    let arr = wert;
    if (typeof arr === 'string') { try { arr = JSON.parse(arr); } catch (e) { return true; } }
    if (Array.isArray(arr)) roomCleanset[m[1]] = arr;
    return true;
  }

  /** Aktuelle cleanset-Werte aller Raeume einmal laden (Startwerte, s. init()). */
  async _ladeCleansets(did) {
    const werte = await Daten.getStates(`dreame.0.${did}.map.cleanset.*.RoomSettings`);
    for (const [stateId, st] of Object.entries(werte || {})) this._merkeCleanset(stateId, st && st.val);
    updateRoomBadges();
  }

  /** Eingehende Checkbox-Aenderung (Klick am Adapter, Objekt-Editor, Skript, ...) in die
   * lokale Auswahl uebernehmen und die Karte neu zeichnen. Bewusst NICHT auf
   * document.activeElement/eigene Klicks pruefen wie bei _renderWasser() -- hier gibt es
   * (noch) kein Eingabeelement, das waehrend der Eingabe verfaelscht werden koennte. */
  neueDatenMuster(stateId, wert) {
    // Erst pruefen, ob es ein cleanset-State ist (fuer die Badges), sonst Raum-Checkbox.
    if (this._merkeCleanset(stateId, wert)) { updateRoomBadges(); return; }
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
    // Pro-Raum-Editor nur im Individuell-Betrieb und nicht waehrend der Fahrt. Aendert sich
    // eins davon, waehrend der Editor offen ist, zurueck zur globalen Ansicht.
    if (this._fokus != null && (!customizedCleaning || geraetGestartet())) this._fokus = null;
    const imEditor = this._fokus != null;
    this._zeigeBereich(imEditor);
    if (imEditor) {
      this._renderFokus();
    } else {
      this._renderBetrieb();
      this._renderRaum();
      this._renderModus();
      this._renderRoute();
      this._renderSaug();
      this._renderWasser();
    }
    updateRoomBadges();
  }

  /** Umschalten der Panel-Ansicht: globale Kacheln vs. Pro-Raum-Editor. Dieselben DOM-Bloecke
   * bleiben stehen, nur ihre Sichtbarkeit wechselt -- kein Neuaufbau, kein Popup. */
  _zeigeBereich(imEditor) {
    const setzeSichtbar = (id, sichtbar) => { const el = document.getElementById(id); if (el) el.hidden = !sichtbar; };
    setzeSichtbar('reinigungGlobalGrid', !imEditor);
    setzeSichtbar('reinigungRaum', !imEditor);
    setzeSichtbar('reinigungFokusKopf', imEditor);
    setzeSichtbar('reinigungFokusGrid', imEditor);
  }

  /** Einen Raum zum Bearbeiten oeffnen (Klick auf sein Zahnrad-Badge, main.js). Laedt das
   * gespeicherte cleanset des Raums und zeigt den Editor. Nur im Individuell-Betrieb und nicht
   * waehrend der Fahrt -- ausserhalb davon traegt das Badge ohnehin kein Zahnrad (render.js
   * baueBadge nurAnzeige). */
  async bearbeiteRaum(seg) {
    if (!customizedCleaning || geraetGestartet() || this.did == null) return;
    const basis = `dreame.0.${this.did}.map.cleanset.${seg}.`;
    const werte = await Daten.getStates(basis + '*');
    if (this.did == null) return; // waehrenddessen abgebaut
    const val = feld => { const st = werte[basis + feld]; return st == null ? null : st.val; };
    this._fokusCS = {
      Level: Number(val('Level') ?? 1),
      WaterVolume: Number(val('WaterVolume') ?? 3),
      CleaningMode: Number(val('CleaningMode') ?? 0),
      Repeat: Number(val('Repeat') ?? 1),
      Route: Number(val('Route') || 1), // 0 = nicht gesetzt -> Standard, wie HA (select.py 683)
    };
    this._fokus = seg;
    this.render();
  }

  /** Zurueck zur globalen Ansicht (← -Knopf). */
  schliesseRaum() {
    this._fokus = null;
    this._fokusCS = null;
    this.render();
  }

  /** Position eines cleanset-Feldes im RoomSettings-Array (siehe _merkeCleanset):
   * [Level, WaterVolume, Repeat, RoomOrder, CleaningMode, Route]. */
  static CS_INDEX = { Level: 0, WaterVolume: 1, Repeat: 2, RoomOrder: 3, CleaningMode: 4, Route: 5 };

  /** Ein Feld des fokussierten Raums schreiben. Der Adapter (UpdateRoomSettings) liest die
   * uebrigen Felder dazu und uebertraegt alle sechs ans Geraet. Lokalen Wert sofort nachziehen,
   * damit die Modus-abhaengige Sichtbarkeit ohne Wartezeit auf den Round-Trip stimmt.
   * Dasselbe fuer roomCleanset: daraus speisen sich die Badges auf der Karte, und die haengen
   * am RoomSettings-Abo -- schreibt man nur das Einzelfeld, bliebe das Badge bis zum (evtl.
   * ausbleibenden) RoomSettings-Update auf dem alten Wert stehen. */
  _schreibeCS(feld, wert) {
    if (this._fokus == null || !this._fokusCS) return;
    Trigger.setCleansetFeld(this.did, this._fokus, feld, wert);
    this._fokusCS[feld] = wert;
    const arr = roomCleanset[this._fokus];
    const idx = ReinigungPanel.CS_INDEX[feld];
    if (Array.isArray(arr) && idx !== undefined) arr[idx] = wert;
    this.render(); // ruft am Ende updateRoomBadges()
  }

  /** Editor-Ansicht fuellen: Name im Kopf, dann die Kacheln aus dem cleanset des Raums.
   * Welche Felder fuer den Raum-Modus gelten, haengt am Modus -- 1:1 wie global bzw. HA
   * segment_available_fn: Saugstaerke nur wenn der Raum saugt, Wassermenge nur wenn er wischt,
   * Route nur bei reinem Wischen. Unpassende Felder werden NICHT versteckt, sondern ausgegraut
   * mit "nicht verfügbar" (siehe _fokusSelect/_fokusWasser) -- damit die Kachelzahl konstant
   * bleibt und beim Oeffnen/Moduswechsel nichts springt. */
  _renderFokus() {
    const cs = this._fokusCS; if (!cs) return;
    const zurueck = document.getElementById('reinigungZurueck');
    if (zurueck && !zurueck.dataset.gefuellt) { zurueck.dataset.gefuellt = '1'; zurueck.innerHTML = uiIcon('zurueck', 20); zurueck.onclick = () => this.schliesseRaum(); }
    const nameEl = document.getElementById('reinigungFokusName');
    if (nameEl) nameEl.textContent = roomName(this._fokus, META && META.seg_inf);

    const m = cs.CleaningMode;
    this._fokusSelect('fokusModus', ROOM_MODES, m, true, v => this._schreibeCS('CleaningMode', v));
    this._fokusSelect('fokusSaug', SUCT_NAMES.map((n, i) => ({ id: i, name: n })), cs.Level, modeSaugt(m), v => this._schreibeCS('Level', v));
    this._fokusSelect('fokusRoute', RAUM_ROUTEN, cs.Route, m === 1, v => this._schreibeCS('Route', v));
    this._fokusSelect('fokusWdh', ROOM_REPEATS, cs.Repeat, true, v => this._schreibeCS('Repeat', v));
    this._fokusWasser(modeWischt(m));
  }

  /** Ein <select> im Editor fuellen/spiegeln. Gilt das Feld fuer den Raum-Modus nicht
   * (anwendbar=false), bleibt die Kachel stehen, wird aber gesperrt und zeigt
   * "nicht verfügbar" -- gleiche ruhige Darstellung wie die einheitliche Ansicht, die
   * unpassende Kacheln ebenfalls nur ausgraut statt zu verstecken. So bleibt die Zahl der
   * Kacheln konstant und das Raster springt beim Oeffnen des Editors bzw. beim Moduswechsel
   * nicht (Davids Kiosk-Vorgabe: keine wandernde Anzeige). */
  _fokusSelect(selId, optionen, wert, anwendbar, onWahl) {
    const el = document.getElementById(selId);
    if (!el) return;
    if (!anwendbar) {
      el.innerHTML = '<option>nicht verfügbar</option>';
      el.dataset.schluessel = '';   // beim Wiederfreischalten Optionen neu fuellen
      el.disabled = true;
      el.onchange = null;
      return;
    }
    el.disabled = false;
    const schluessel = optionen.map(o => o.id).join(',');
    if (el.dataset.schluessel !== schluessel) {
      el.innerHTML = optionen.map(o => `<option value="${o.id}">${o.name}</option>`).join('');
      el.dataset.schluessel = schluessel;
    }
    if (wert != null && optionen.some(o => o.id === Number(wert))) el.value = String(wert);
    el.onchange = () => onWahl(Number(el.value));
  }

  /** Feuchtigkeits-Regler im Editor (1-32), analog _renderWasser, ans cleanset gebunden.
   * Wischt der Raum nicht (anwendbar=false), bleibt die Kachel stehen, der Regler ist
   * gesperrt und der Wert zeigt "nicht verfügbar" -- wie _fokusSelect, damit die Anzeige
   * stabil bleibt statt eine Kachel wegfallen zu lassen. */
  _fokusWasser(anwendbar) {
    const el = document.getElementById('fokusWasser');
    const wertEl = document.getElementById('fokusWasserWert');
    if (!el) return;
    if (!anwendbar) {
      el.disabled = true;
      el.style.setProperty('--fill', '0%');
      if (wertEl) wertEl.textContent = 'nicht verfügbar';
      return;
    }
    el.disabled = false;
    const fuellen = () => {
      const pct = (Number(el.value) - Number(el.min)) / (Number(el.max) - Number(el.min)) * 100;
      el.style.setProperty('--fill', pct + '%');
      if (wertEl) wertEl.textContent = el.value;
    };
    if (document.activeElement !== el) el.value = String(this._fokusCS.WaterVolume);
    fuellen();
    el.oninput = fuellen;
    el.onchange = () => this._schreibeCS('WaterVolume', Number(el.value));
  }

  /** Betriebsart-Umschalter (remote.customized-cleaning). Aus = einheitlich, an = individuell.
   * Bestimmt, ob die globalen Kacheln (Modus/Route/Saug/Wasser) gelten oder das je Raum
   * gespeicherte cleanset -- deshalb werden die Kacheln bei "individuell" ausgegraut
   * (customizedCleaning-Pruefung in _renderModus/_renderRoute/_renderSaug/_renderWasser).
   * Waehrend einer Fahrt gesperrt: die Betriebsart legt fest, WAS fuer ein Auftrag laeuft. */
  _renderBetrieb() {
    const el = document.getElementById('reinigungBetrieb');
    if (!el) return;
    if (!el.dataset.gefuellt) {
      el.innerHTML = '<option value="0">Einheitlich</option><option value="1">Individuell pro Raum</option>';
      el.dataset.gefuellt = '1';
      el.onchange = () => Trigger.setCustomizedCleaning(this.did, el.value === '1');
    }
    if (this.custom != null) el.value = this.custom ? '1' : '0';
    el.disabled = geraetGestartet();
  }

  // Etappe C6-4 (WIDGET_UMBAU_PLAN.md Abschnitt 6.4): "aktiv" vs. "gewählt" ist bewusst
  // unterschiedlicher Wortlaut -- "aktiv" markiert den Standardzustand (alle Räume, Start
  // reinigt alle), "gewählt" eine bewusste Auswahl (nur diese Räume). Gleiche Bedeutung wie
  // die Zwei-Zustaende-Faerbung in render.js (roomFill()/labelStyle()).
  _renderRaum() {
    const el = document.getElementById('reinigungRaum');
    if (!el) return;
    const n = selectedRooms.size;
    el.textContent = n === 0 ? 'Alle Räume aktiv' : (n === 1 ? '1 Raum gewählt' : n + ' Räume gewählt');
  }

  /** Der globale Modus wird NUR im Individuell-Betrieb gesperrt -- dort gilt je Raum der im
   * Cleanset gespeicherte Modus (im Editor bearbeitbar), der globale hat keine Wirkung.
   *
   * Frueher war die Kachel zusaetzlich gesperrt, sobald ueberhaupt ein Raum ausgewaehlt war
   * ("bei Raum-Reinigung waehlt das Geraet den Modus selbst"). Das stimmt fuer den
   * Einheitlich-Betrieb NICHT: der globale Modus wirkt dort auch bei Raum-Auswahl -- live
   * gegengeprueft (zwei Raeume ausgewaehlt, global "Wischen" -> beide gewischt). Der Adapter
   * schickt den globalen Modus vor jedem Raum-Start ohnehin nochmal mit
   * (_preSendCleaningProperties), was das bestaetigt. Route/Saugstaerke/Wassermenge waren bei
   * Raum-Auswahl nie gesperrt -- die Sonderbehandlung des Modus war also auch in sich
   * inkonsistent. Deshalb hier entfernt. */
  _renderModus() {
    const el = document.getElementById('reinigungModus');
    if (!el) return;
    if (!el.dataset.gefuellt) {
      el.innerHTML = CLEAN_MODES.map(m => `<option value="${m.id}">${m.name}</option>`).join('');
      el.dataset.gefuellt = '1';
      el.onchange = () => Trigger.setCleaningMode(this.did, Number(el.value));
    }
    if (this.modus != null) el.value = String(this.modus);
    el.disabled = customizedCleaning || geraetGestartet();
  }

  _renderRoute() {
    const el = document.getElementById('reinigungRoute');
    if (!el) return;
    const optionen = routenFuer(cleanMode);
    const schluessel = optionen.map(r => r.id).join(',');
    if (el.dataset.schluessel !== schluessel) {
      el.innerHTML = optionen.map(r => `<option value="${r.id}">${r.name}</option>`).join('');
      el.dataset.schluessel = schluessel;
      el.onchange = () => Trigger.setCleaningRoute(this.did, Number(el.value));
    }
    if (this.route != null && optionen.some(r => r.id === this.route)) el.value = String(this.route);
    el.disabled = customizedCleaning;
  }

  _renderSaug() {
    const el = document.getElementById('reinigungSaug');
    if (!el) return;
    if (!el.dataset.gefuellt) {
      el.innerHTML = SUCT_NAMES.map((n, i) => `<option value="${i}">${n}</option>`).join('');
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
    karte.hidden = !this.wasserDa;
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

// Bruecke fuer den Pro-Raum-Editor: render.js/main.js ruft das beim Tap auf ein
// Zahnrad-Badge auf (Feature A -- Tap auf die Raumflaeche waehlt weiter aus, Tap aufs Badge
// oeffnet den Editor). Gleiches Bruecken-Muster wie raumUmschalten() direkt darueber.
function bearbeiteRaum(seg) { if (reinigungInstanz) reinigungInstanz.bearbeiteRaum(seg); }
