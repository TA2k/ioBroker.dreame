/*
 * Sequence-Panel (F10b/c): kapselt den Reinigungs-Reihenfolge-Modus ("Sequence-Modus").
 * ========================================================================
 * Kein sichtbares Sidebar-Panel — reine Logik-/Map-Mode-Schicht. Nutzt trotzdem die
 * Panel-Basisklasse (panel.js), um Lifecycle (init/dispose bei jedem Roboter-Wechsel) und
 * State-Abos geschenkt zu bekommen; der Container ist immer null (kein <section id="panel-
 * sequence"> in index.html, alle DOM-Zugriffe der Basisklasse sind per if(container)
 * abgesichert).
 *
 * Design B (F10A_LIVE_TEST_ANALYSE.md Teil F, CLEANING_SEQUENCE_ANALYSE.md "Requirements
 * aus Live-Test"): die Karten-Tap-Auswahl kombiniert Raumauswahl UND Reihenfolge. Ein
 * angetippter Raum = nur der wird gereinigt; N angetippte Räume = nur diese, in
 * Tap-Reihenfolge. Doppel-Tap auf einen bereits gelisteten Raum nimmt ihn wieder raus
 * (Toggle).
 *
 * Round-Trip wie reinigung.js' raumUmschalten(): tap()/reset() schreiben ausschliesslich
 * den Adapter-State remote.cleaning-sequence.order. Der interne _order-Cache wird NICHT
 * hier aktualisiert, sondern erst wenn der Adapter die Aenderung ueber neueDaten()
 * zurueckspielt — Widget und Adapter koennen so nie auseinanderlaufen.
 *
 * .apply wird hier bewusst NICHT ausgeloest — das passiert nur aus dem Start-Cleaning-Pfad
 * (W4-d). Rendering der Nummern (W2) und die Menueleiste (W3) haengen sich an die
 * CustomEvents seq-order-changed / seq-mode-changed; der Karten-Layer (render.js) spricht
 * ueber window.sequenceModus mit dieser Instanz.
 */

/* global Panel, Daten */

class SequencePanel extends Panel {
  // Cleaning-Sequence ist ein reines Sauger-Feature.
  static passtZuTyp = ['vacuum'];

  constructor(id, container, config) {
    super(id, container, config);
    this._order = []; // Round-Trip-Cache, nur ueber neueDaten() vom Adapter gepflegt
    this._aktiv = false; // Sequence-Modus an/aus (Menueleiste sichtbar, W3)
    this._active = false; // Spiegel von remote.cleaning-sequence.active (W4-c baut darauf auf)
  }

  benoetigteStates(did) {
    this._idOrder = `dreame.0.${did}.remote.cleaning-sequence.order`;
    this._idActive = `dreame.0.${did}.remote.cleaning-sequence.active`;
    return [this._idOrder, this._idActive];
  }

  init(did) {
    // Bruecke fuer den Karten-Layer (render.js selectRoom(), spaeter overlays.js). Vor
    // super.init(), damit ein sofort folgender neueDaten()-Initialpush schon greift.
    window.sequenceModus = this;
    return super.init(did);
  }

  neueDaten(stateId, wert) {
    if (stateId === this._idOrder) {
      let parsed;
      try {
        parsed = JSON.parse(wert == null ? '[]' : String(wert));
      } catch (_) {
        return; // kaputtes JSON ignorieren, alter Cache bleibt gueltig
      }
      if (!Array.isArray(parsed)) return;
      this._order = parsed.map(Number).filter(n => Number.isFinite(n));
      this._sende('seq-order-changed', { order: [...this._order] });
    } else if (stateId === this._idActive) {
      // W4-c: falls der Adapter beim (Re-)Load eine aktive Sequenz meldet, hier
      // Menueleiste/Checkbox synchronisieren. Vorerst nur spiegeln.
      this._active = !!wert;
    }
  }

  get aktiv() {
    return this._aktiv;
  }

  /** Aktuelle Reihenfolge als read-only Kopie (1-basiert wird erst beim Rendern draus). */
  get order() {
    return [...this._order];
  }

  aktivieren() {
    if (this._aktiv) return;
    this._aktiv = true;
    document.body.classList.add('seq-mode');
    this._sende('seq-mode-changed', { aktiv: true });
  }

  deaktivieren() {
    if (!this._aktiv) return;
    this._aktiv = false;
    document.body.classList.remove('seq-mode');
    this._sende('seq-mode-changed', { aktiv: false });
  }

  /** Karten-Tap auf einen Raum: Toggle in der Reihenfolge. Schreibt nur den Adapter-State,
   * die sichtbare Aenderung kommt ueber neueDaten() zurueck (Round-Trip, kein
   * optimistisches UI). Kein Effekt ausserhalb des Sequence-Modus. */
  tap(roomId) {
    if (!this._aktiv) return;
    const rid = Number(roomId);
    if (!Number.isFinite(rid)) return;
    const neu = [...this._order];
    const idx = neu.indexOf(rid);
    if (idx >= 0) neu.splice(idx, 1);
    else neu.push(rid);
    Daten.setState(this._idOrder, JSON.stringify(neu));
  }

  /** Reihenfolge komplett leeren (Reset-Knopf der Menueleiste, W3). Ebenfalls Round-Trip. */
  reset() {
    Daten.setState(this._idOrder, JSON.stringify([]));
  }

  dispose() {
    if (window.sequenceModus === this) window.sequenceModus = null;
    this._aktiv = false;
    document.body.classList.remove('seq-mode');
    this._sende('seq-mode-changed', { aktiv: false });
    super.dispose();
  }

  _sende(name, detail) {
    document.dispatchEvent(new CustomEvent(name, { detail }));
  }
}
