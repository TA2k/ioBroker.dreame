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

class Panel {
  /** Roboter-Typen, zu denen dieses Panel passt (WIDGET_ARCHITEKTUR.md Abschnitt 15.2).
   * In Unterklassen ueberschreiben, z.B. `static passtZuTyp = ['vacuum'];` fuer
   * Raum-/Wassertank-Panels. Default: passt zu allen bekannten Typen. */
  static passtZuTyp = ['vacuum', 'mower'];

  /**
   * @param {string} id            Panel-ID, identisch mit dem Schluessel in
   *                                widgetConfig.panels (siehe config.js)
   * @param {HTMLElement|null} container  DOM-Bereich dieses Panels, falls schon vorhanden
   */
  constructor(id, container) {
    this.id = id;
    this.container = container || null;
    this.sichtbar = false;
    this.did = null;
    this._stateAbos = new Map(); // State-ID -> Callback, fuer dispose()
  }

  /** State-IDs (vollstaendig, inkl. DID), die dieses Panel fuer das gegebene Geraet
   * braucht. In Unterklassen ueberschreiben. Default: keine. */
  benoetigteStates(did) { return []; }

  /** Fuer ein Geraet aufbauen: States abonnieren, erstes Rendern. Wird von main.js beim
   * ersten Aufbau und nach jedem Roboter-Wechsel aufgerufen (nach vorherigem dispose()
   * des alten Zustands, siehe WIDGET_ARCHITEKTUR.md Abschnitt 8.5). */
  init(did) {
    this.did = did;
    for (const stateId of this.benoetigteStates(did)) this.abonniereState(stateId);
    this.render();
  }

  /** DOM neu zeichnen. In Unterklassen ueberschreiben. */
  render() {}

  /** Wird aufgerufen, wenn sich ein per abonniereState() abonnierter State aendert.
   * Default: einfach neu rendern — Unterklassen mit mehreren, unabhaengig aenderbaren
   * Werten koennen das granularer ueberschreiben. */
  neueDaten(stateId, wert) { this.render(); }

  /** Beim Roboter-Wechsel oder Abschalten: alle Abos loesen. In Unterklassen bei Bedarf
   * ueberschreiben (super.dispose() aufrufen!), um zusaetzlich eigenen DOM-Zustand oder
   * Timer/Intervalle aufzuraeumen. */
  dispose() {
    for (const [stateId, cb] of this._stateAbos) Daten.unsubscribe(stateId, cb);
    this._stateAbos.clear();
    this.did = null;
  }

  /** Komfort-Wrapper: State abonnieren und fuer dispose() merken, statt Daten.subscribe
   * direkt zu nutzen. */
  abonniereState(stateId) {
    const cb = wert => this.neueDaten(stateId, wert);
    this._stateAbos.set(stateId, cb);
    Daten.subscribe(stateId, cb);
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
