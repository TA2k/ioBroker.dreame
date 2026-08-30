/*
 * panel.js — Basisklasse fuer alle Panels + Panel-Registry.
 *
 * Jedes Panel kennt seinen eigenen Container, verwaltet seine Sichtbarkeit, deklariert
 * seine State-Abhaengigkeiten (benoetigteStates) und hat einen festen Lifecycle: init(did)
 * beim Aufbau bzw. bei jedem Roboter-Wechsel, render() zum Neuzeichnen, neueDaten() bei
 * State-Aenderungen, dispose() zum saubern Abmelden (WIDGET_UMBAU_PLAN.md Etappe B,
 * Commit B4; WIDGET_ARCHITEKTUR.md Abschnitt 8.1/8.5).
 *
 * Die Panel-Registry lebt hier (nicht in main.js), damit sie zusammen mit der Klasse
 * getestet/gelesen werden kann, die sie verwaltet. main.js (Commit B5) registriert dort
 * jede Panel-Klasse per PanelRegistry.registriere() und baut daraus beim Start bzw. bei
 * Config-/Roboter-Wechsel die aktiven Panels per PanelRegistry.aktive().
 */

/* global Daten */

/**
 * SVG-Icon aus UI_ICONS (www/icons_ui.js) als Markup-String, faerbt sich ueber currentColor
 * wie Text. Aus www/legacy.html Bereich "Reinigungs-Panel" (Etappe C, Commit C1) hierher
 * uebernommen: mehrere Panels brauchen dieselbe Funktion (Kopf-Panel-Buttons, spaeter
 * Verbrauchsmaterial-/Warnzeilen anderer Panels) — deshalb hier in der gemeinsamen
 * Panel-Basisdatei statt in einem einzelnen Panel dupliziert.
 * @param name   Schluessel in UI_ICONS
 * @param px     Kantenlaenge
 * @param extra  zusaetzliche CSS-Klasse (z.B. 'chev', 'ic-an')
 */
function uiIcon(name, px = 16, extra = '') {
  const d = (window.UI_ICONS || {})[name];
  if (!d) return '';
  return `<svg class="ico ${extra}" width="${px}" height="${px}" viewBox="0 0 24 24" fill="none"`
    + ` stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"`
    + ` aria-hidden="true">${d}</svg>`;
}

class Panel {
  /** Roboter-Typen, zu denen dieses Panel passt (WIDGET_ARCHITEKTUR.md Abschnitt 15.2).
   * In Unterklassen ueberschreiben, z.B. `static passtZuTyp = ['vacuum'];` fuer
   * Raum-/Wassertank-Panels. Default: passt zu allen bekannten Typen. */
  static passtZuTyp = ['vacuum', 'mower'];

  /** Einzeln aus-/einblendbare Felder dieses Panels im Zahnrad-Overlay (F3,
   * WIDGET_FEATURE_PLAN.md -- Blaupause fuer F6-F9). In Unterklassen ueberschreiben:
   * Array aus `{ id, labelKey }` -- `id` landet in
   * `config.widget.panels.<panelId>.versteckt`, `labelKey` ist der i18n-Key fuer die
   * Beschriftung der Sub-Toggle-Zeile im Overlay (main.js `baueZovlPanelsListe()`).
   * Default: keine versteckbaren Felder (Panel ist entweder ganz sichtbar oder ganz weg,
   * ueber die bestehende Panel-Ebene-Sichtbarkeit). */
  static versteckbareFelder = [];

  /**
   * @param {string} id            Panel-ID, identisch mit dem Schluessel in
   *                                widgetConfig.panels (siehe config.js)
   * @param {HTMLElement|null} container  DOM-Bereich dieses Panels, falls schon vorhanden
   * @param {object|null} config   aktuell geladene widgetConfig (main.js aktiveWidgetConfig),
   *                                fuer feldVersteckt() -- seit F3, vorher nicht durchgereicht
   */
  constructor(id, container, config) {
    this.id = id;
    this.container = container || null;
    this.config = config || null;
    this.sichtbar = false;
    this.did = null;
    this._stateAbos = new Map(); // State-ID -> Callback, fuer dispose()
    this._musterAbos = new Map(); // Muster -> Callback, fuer dispose() (Etappe C5.5)
  }

  /** Ob das Feld feldId (siehe static versteckbareFelder) laut aktueller Config versteckt
   * ist. Default false, wenn keine Config da ist oder das Panel/Feld darin (noch) nicht
   * vorkommt -- config.js legt versteckt:[] zwar immer per Default an, robust gegen
   * unerwartet fehlende Eintraege trotzdem sinnvoll (aehnlich PanelRegistry.aktive()). */
  feldVersteckt(feldId) {
    const eintrag = this.config && this.config.panels && this.config.panels[this.id];
    return !!(eintrag && Array.isArray(eintrag.versteckt) && eintrag.versteckt.includes(feldId));
  }

  /** State-IDs (vollstaendig, inkl. DID), die dieses Panel fuer das gegebene Geraet
   * braucht. In Unterklassen ueberschreiben. Default: keine. */
  benoetigteStates(did) { return []; }

  /** Wildcard-Muster (vollstaendig, inkl. DID), die dieses Panel fuer das gegebene Geraet
   * schon beim Aufbau kennt und dauerhaft braucht (analog zu benoetigteStates()). In
   * Unterklassen ueberschreiben. Default: keine. Fuer Muster, die sich WAEHREND der
   * Panel-Lebenszeit aendern (z.B. abhaengig von einem anderen State wie der aktiven
   * Karte), stattdessen abonniereMuster()/entferneMusterAbo() direkt aufrufen -- dispose()
   * raeumt in beiden Faellen gleich auf, weil beides in _musterAbos landet. */
  benoetigteMuster(did) { return []; }

  /** Fuer ein Geraet aufbauen: States abonnieren, erstes Rendern. Wird von main.js beim
   * ersten Aufbau und nach jedem Roboter-Wechsel aufgerufen (nach vorherigem dispose()
   * des alten Zustands, siehe WIDGET_ARCHITEKTUR.md Abschnitt 8.5).
   *
   * Holt fuer jeden benoetigten State per Daten.getState() zuerst den AKTUELLEN Wert, bevor
   * abonniert wird — reines Abonnieren liefert nur KUENFTIGE Aenderungen, das erste Rendern
   * zeigte sonst nichts an, bis sich zufaellig etwas aendert (in Commit C1 beim Bauen des
   * Kopf-Panels aufgefallen, das als erstes Panel den vollen Lifecycle durchlaeuft — betrifft
   * die Basisklasse und damit alle Panels gleichermassen). */
  async init(did) {
    this.did = did;
    const stateIds = this.benoetigteStates(did);
    for (const stateId of stateIds) this.abonniereState(stateId);
    for (const muster of this.benoetigteMuster(did)) this.abonniereMuster(muster);
    const werte = await Promise.all(stateIds.map(id => Daten.getState(id)));
    stateIds.forEach((stateId, i) => { if (werte[i] != null) this.neueDaten(stateId, werte[i]); });
    this.render();
  }

  /** DOM neu zeichnen. In Unterklassen ueberschreiben. */
  render() {}

  /** Wird aufgerufen, wenn sich ein per abonniereState() abonnierter State aendert.
   * Default: einfach neu rendern — Unterklassen mit mehreren, unabhaengig aenderbaren
   * Werten koennen das granularer ueberschreiben. */
  neueDaten(stateId, wert) { this.render(); }

  /** Wird aufgerufen, wenn sich ein per abonniereMuster() abonnierter State aendert.
   * Anders als neueDaten() mit der konkreten ID, weil unter einem Muster mehrere States
   * liegen. Default: einfach neu rendern. */
  neueDatenMuster(stateId, wert, state) { this.render(); }

  /** Beim Roboter-Wechsel oder Abschalten: alle Abos loesen. In Unterklassen bei Bedarf
   * ueberschreiben (super.dispose() aufrufen!), um zusaetzlich eigenen DOM-Zustand oder
   * Timer/Intervalle aufzuraeumen. */
  dispose() {
    for (const [stateId, cb] of this._stateAbos) Daten.unsubscribe(stateId, cb);
    this._stateAbos.clear();
    for (const [muster, cb] of this._musterAbos) Daten.unsubscribeMuster(muster, cb);
    this._musterAbos.clear();
    this.did = null;
  }

  /** Komfort-Wrapper: State abonnieren und fuer dispose() merken, statt Daten.subscribe
   * direkt zu nutzen. */
  abonniereState(stateId) {
    const cb = wert => this.neueDaten(stateId, wert);
    this._stateAbos.set(stateId, cb);
    Daten.subscribe(stateId, cb);
  }

  /** Komfort-Wrapper: Muster abonnieren und fuer dispose() merken. Kann sowohl aus
   * benoetigteMuster() heraus (statisch, ab init()) als auch jederzeit direkt aus einer
   * Unterklasse aufgerufen werden (dynamisch, z.B. bei Kartenwechsel — siehe reinigung.js). */
  abonniereMuster(muster) {
    const cb = (stateId, wert, state) => this.neueDatenMuster(stateId, wert, state);
    this._musterAbos.set(muster, cb);
    Daten.subscribeMuster(muster, cb);
  }

  /** Gegenstueck zu abonniereMuster() fuer dynamisches Um-Abonnieren (z.B. Kartenwechsel). */
  entferneMusterAbo(muster) {
    const cb = this._musterAbos.get(muster);
    if (!cb) return;
    Daten.unsubscribeMuster(muster, cb);
    this._musterAbos.delete(muster);
  }

  zeige() {
    this.sichtbar = true;
    if (this.container) this.container.hidden = false;
  }

  verstecke() {
    this.sichtbar = false;
    if (this.container) this.container.hidden = true;
  }
}

const PanelRegistry = (() => {
  const eintraege = []; // [{ id, klasse }]

  /** Panel-Klasse (nicht Instanz!) unter einer ID registrieren. main.js ruft das beim
   * Start fuer jedes bekannte Panel auf. */
  function registriere(id, klasse) {
    const bestehenderIndex = eintraege.findIndex(e => e.id === id);
    if (bestehenderIndex !== -1) {
      console.warn('[panel] Panel-ID bereits registriert, wird ersetzt:', id);
      eintraege.splice(bestehenderIndex, 1);
    }
    eintraege.push({ id, klasse });
  }

  /** Registrierte Panels filtern: sichtbar laut Config (Default: sichtbar, falls in der
   * Config kein Eintrag existiert — siehe Migration in config.js) UND passend zum
   * Roboter-Typ (WIDGET_ARCHITEKTUR.md Abschnitt 15.2). */
  function aktive(config, typ) {
    return eintraege.filter(eintrag => {
      const cfgEintrag = config && config.panels && config.panels[eintrag.id];
      const istSichtbar = cfgEintrag ? cfgEintrag.sichtbar !== false : true;
      const passtZuTyp = !typ || eintrag.klasse.passtZuTyp.includes(typ);
      return istSichtbar && passtZuTyp;
    });
  }

  return {
    registriere,
    aktive,
    get alle() { return eintraege.slice(); },
  };
})();
