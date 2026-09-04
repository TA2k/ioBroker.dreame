/*
 * sequenceModus.js — Reinigungsreihenfolge-Speicher (F10, CLEANING_SEQUENCE_ANALYSE.md).
 * Globaler Singleton wie Daten / Config / Geraete / PanelRegistry.
 *
 * KEIN eigener Modus mehr. Die Reinigungsreihenfolge ist Teil des klassischen Custom-Room-
 * Cleaning-Ablaufs: reinigung.js raumUmschalten() ruft nach dem Adapter-Write dieses Moduls
 * tap() auf und haelt so die Tap-REIHENFOLGE zusaetzlich zur Raumauswahl fest. Dieses Modul
 * ist reiner Zustand + Adapter-Spiegel, keine UI, kein Panel.
 *
 * Zustand:
 *  - _order:  Raum-IDs in Tap-Reihenfolge. Round-Trip-Cache -- tap()/reset() schreiben nur
 *             den Adapter-State remote.cleaning-sequence.order (via _sendOrder), _order wird
 *             erst aus der Rueckmeldung gepflegt (kein optimistisches UI, wie reinigung.js
 *             raumUmschalten).
 *
 * Kopplung an die Raumauswahl (CLEANING_SEQUENCE_ANALYSE.md, Design-Umbau): Variante A +
 * einmaliger Reconcile. LAUFEND koppelt das Widget NUR beim Karten-Tap (reinigung.js);
 * externe Aenderungen der custom-room-cleaning-Auswahl (Skript, anderes UI, Dreame-App)
 * werden NICHT laufend nachgezogen -- Variante B (subscribe auf die Auswahl) waere
 * Endlos-Loop-anfaellig, jedes Set loest das andere aus.
 * ABER: bei init()/wechsleGeraet() gleicht _syncOrderMitAuswahl() die aus dem Adapter
 * geladene _order EINMALIG gegen die tatsaechliche Raumauswahl ab -- die Auswahl wird dazu
 * direkt aus den Adapter-States gelesen (_leseAuswahl(), analog reinigung.js
 * _aktualisiereRaumMuster), NICHT aus dem selectedRooms-Set von reinigung.js: dessen Modul
 * ist beim Lauf von sequenceModus.init() (main.js ladeGeraet, VOR baueAktivePanels) noch
 * nicht befuellt. So ueberlebt keine Reload-Divergenz "Nummern ohne Raumauswahl": IDs ohne
 * Auswahl fliegen raus, ausgewaehlte-aber-nicht-nummerierte kommen hinten an. Einmalig,
 * nicht in _onOrder -> kein Loop, keine Kollision mit laufender User-Interaktion.
 *
 * Event auf document: seq-order-changed { order:[...] }. Das Nummern-Overlay in render.js
 * haengt sich dort ein.
 */

/* global Daten */

const sequenceModus = (() => {
  let _order = [];
  let _idOrder = null;

  function _feuere(name, detail) {
    document.dispatchEvent(new CustomEvent(name, { detail }));
  }

  /** Reihenfolge in den Adapter schreiben. Einziger Schreibweg -- tap()/reset()/
   * _syncOrderMitAuswahl() gehen alle hierueber. Kein lokales _order-Update, die sichtbare
   * Aenderung kommt ueber _onOrder() zurueck (Round-Trip). */
  function _sendOrder(arr) {
    if (_idOrder) Daten.setState(_idOrder, JSON.stringify(arr));
  }

  function _onOrder(wert) {
    let parsed;
    try {
      parsed = JSON.parse(wert == null ? '[]' : String(wert));
    } catch (_) {
      return; // kaputtes JSON ignorieren, alter Cache bleibt gueltig
    }
    if (!Array.isArray(parsed)) return;
    _order = parsed.map(Number).filter(n => Number.isFinite(n));
    _feuere('seq-order-changed', { order: [..._order] });
  }

  /** Tatsaechliche custom-room-cleaning-Auswahl direkt aus den Adapter-States lesen --
   * analog reinigung.js _aktualisiereRaumMuster(). Bewusst NICHT das selectedRooms-Set aus
   * reinigung.js: dessen Panel ist beim init()-Lauf ggf. noch nicht gebaut/befuellt.
   * @returns {Promise<Set<number>>} Menge der ausgewaehlten Raum-IDs (native.roomId). */
  async function _leseAuswahl(did) {
    // Daten.getState() liefert hier den val direkt (daten.js), aber tolerant gegen eine
    // evtl. abweichende Implementierung, die das ganze State-Objekt zurueckgibt.
    const _val = x => (x && typeof x === 'object' && 'val' in x ? x.val : x);
    const mapId = _val(await Daten.getState(`dreame.0.${did}.remote.custom-room-cleaning.active-map`));
    if (mapId == null || mapId === '') return new Set();
    const muster = `dreame.0.${did}.remote.custom-room-cleaning.map-${String(mapId)}.*`;
    const [objekte, werte] = await Promise.all([Daten.getObjects(muster), Daten.getStates(muster)]);
    const set = new Set();
    for (const [sid, o] of Object.entries(objekte)) {
      if (!o || !o.native || o.native.roomId === undefined) continue;
      if (_val(werte[sid])) set.add(Number(o.native.roomId));
    }
    return set;
  }

  /** Einmaliger Abgleich (init/wechsleGeraet) der aus dem Adapter geladenen _order gegen die
   * tatsaechliche Raumauswahl: nicht mehr ausgewaehlte IDs raus (Reihenfolge der uebrigen
   * bleibt), ausgewaehlte-aber-nicht-nummerierte hinten an. Nur bei Divergenz wird
   * geschrieben. */
  function _syncOrderMitAuswahl(auswahlSet) {
    const neu = _order.filter(id => auswahlSet.has(id));
    for (const id of auswahlSet) if (!neu.includes(id)) neu.push(id);
    if (JSON.stringify(neu) === JSON.stringify(_order)) return; // deckungsgleich -> nichts tun
    _sendOrder(neu); // Divergenz aufloesen; sichtbare Aenderung kommt via _onOrder zurueck
  }

  function _teardown() {
    if (_idOrder) Daten.unsubscribe(_idOrder, _onOrder);
    _idOrder = null;
  }

  /** Fuer ein Geraet (neu) aufbauen. Idempotent -- raeumt vorhandene Abos selbst ab, kann
   * also beim App-Start UND bei jedem Geraete-Wechsel aus main.js' ladeGeraet() gerufen
   * werden. */
  function init(did) {
    _teardown();
    _order = [];
    _idOrder = `dreame.0.${did}.remote.cleaning-sequence.order`;
    const meinId = _idOrder; // Guard gegen einen Geraete-Wechsel waehrend der async-Kette
    Daten.subscribe(_idOrder, _onOrder);
    // Geraete-Wechsel: alte Nummern sofort weg, bevor der neue Initialwert eintrifft.
    _feuere('seq-order-changed', { order: [] });
    Daten.getState(_idOrder).then(async v => {
      if (_idOrder !== meinId) return; // waehrenddessen erneut gewechselt/abgebaut
      if (v != null) _onOrder(v);
      const auswahl = await _leseAuswahl(did);
      if (_idOrder !== meinId) return;
      _syncOrderMitAuswahl(auswahl);
    });
  }

  return {
    get order() { return [..._order]; },
    /** Karten-Tap auf einen Raum: Toggle in der Reihenfolge (bei existierender ID entfernen,
     * sonst hinten anhaengen) -- deckungsgleich mit dem Auswahl-Toggle in reinigung.js
     * raumUmschalten(). Schreibt nur den Adapter-State, die sichtbare Aenderung kommt ueber
     * _onOrder() zurueck (Round-Trip, kein optimistisches UI). */
    tap(roomId) {
      if (!_idOrder) return;
      const rid = Number(roomId);
      if (!Number.isFinite(rid)) return;
      const neu = [..._order];
      const i = neu.indexOf(rid);
      if (i >= 0) neu.splice(i, 1);
      else neu.push(rid);
      _sendOrder(neu); // Round-Trip, kein lokales Update
    },
    /** Reihenfolge komplett leeren. Ebenfalls Round-Trip. */
    reset() {
      _sendOrder([]);
    },
    init,
    /** Alias fuer init() -- semantisch der Geraete-Wechsel. */
    wechsleGeraet(did) { init(did); },
  };
})();

window.sequenceModus = sequenceModus;
