/*
 * geraete.js — Geraeteliste aus dreame.0.info.devices verwalten, aktive DID halten,
 * Wechsel-Event fuer Panels ausloesen (WIDGET_ARCHITEKTUR.md Abschnitt 12).
 *
 * dreame.0.info.devices wird vom Adapter beim Start befuellt (WIDGET_UMBAU_PLAN.md
 * Etappe A, Commit A2) — Format: [{ did, name, typ }], typ ist 'vacuum'|'mower'.
 */

/* global Daten */

const DEVICES_STATE_ID = 'dreame.0.info.devices';

const Geraete = (() => {
  let liste = [];
  let aktiveDid = null;
  const wechselAbonnenten = new Set();

  function parseListe(roh) {
    if (!roh) return [];
    try {
      const arr = JSON.parse(roh);
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      console.warn('[geraete] info.devices ist kein gueltiges JSON:', e);
      return [];
    }
  }

  /** Fallback aus WIDGET_ARCHITEKTUR.md Abschnitt 12: ?did=... legt den Startroboter fest,
   * sonst gilt der erste Eintrag der Liste. */
  function ausUrlOderErstes(neueListe) {
    const gewuenscht = new URLSearchParams(location.search).get('did');
    if (gewuenscht && neueListe.some(g => g.did === gewuenscht)) return gewuenscht;
    return neueListe.length ? neueListe[0].did : null;
  }

  function aktuelles() {
    return liste.find(g => g.did === aktiveDid) || null;
  }

  function wechsle(did) {
    if (did === aktiveDid) return;
    aktiveDid = did;
    wechselAbonnenten.forEach(cb => {
      try { cb(aktuelles()); } catch (e) { console.error('[geraete] Wechsel-Abonnent-Fehler', e); }
    });
  }

  function aufWechsel(cb) { wechselAbonnenten.add(cb); }
  function abWechsel(cb) { wechselAbonnenten.delete(cb); }

  /** Erstladung + laufendes Abo auf info.devices. Gibt das anfangs aktive Geraet zurueck
   * (oder null, wenn noch keins bekannt ist). */
  async function starten() {
    const roh = await Daten.getState(DEVICES_STATE_ID);
    liste = parseListe(roh);
    if (!aktiveDid) aktiveDid = ausUrlOderErstes(liste);
    Daten.subscribe(DEVICES_STATE_ID, neuerRoh => {
      liste = parseListe(neuerRoh);
      // aktives Geraet ist aus der Liste verschwunden (oder war noch nie gesetzt) ->
      // Ersatz waehlen, sonst zeigt das Widget ein Geraet, das es nicht mehr gibt.
      if (!aktiveDid || !liste.some(g => g.did === aktiveDid)) wechsle(ausUrlOderErstes(liste));
    });
    return aktuelles();
  }

  return {
    starten, wechsle, aufWechsel, abWechsel, aktuelles,
    get liste() { return liste; },
    get aktiveDid() { return aktiveDid; },
  };
})();
