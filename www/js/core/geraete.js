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
  // Etappe E1: Liste hat sich geaendert (auch OHNE Wechsel des aktiven Geraets) -- fuer den
  // Umschalter in main.js.
  const listeAbonnenten = new Set();

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

  /** Nur wechseln, wenn das Ziel-Geraet tatsaechlich (noch) in der Liste steht -- schuetzt
   * gegen einen Klick auf einen inzwischen veralteten Umschalter-Eintrag. */
  function wechsle(did) {
    if (did === aktiveDid) return;
    if (!liste.some(g => g.did === did)) return;
    aktiveDid = did;
    wechselAbonnenten.forEach(cb => {
      try { cb(aktuelles()); } catch (e) { console.error('[geraete] Wechsel-Abonnent-Fehler', e); }
    });
  }

  function aufWechsel(cb) { wechselAbonnenten.add(cb); }
  function abWechsel(cb) { wechselAbonnenten.delete(cb); }

  /** Fuer den Umschalter (main.js): Liste selbst hat sich geaendert (Geraet dazugekommen/
   * weggefallen/umbenannt) -- unabhaengig davon, ob sich dabei auch das AKTIVE Geraet
   * geaendert hat. aufWechsel() allein reicht nicht: kommt z.B. ein zweites Geraet dazu,
   * bleibt das aktive gleich, aber der Umschalter muss trotzdem neu gezeichnet werden. */
  function aufListeAenderung(cb) { listeAbonnenten.add(cb); }
  function abListeAenderung(cb) { listeAbonnenten.delete(cb); }

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
      listeAbonnenten.forEach(cb => {
        try { cb(liste); } catch (e) { console.error('[geraete] Liste-Abonnent-Fehler', e); }
      });
    });
    return aktuelles();
  }

  return {
    starten, wechsle, aufWechsel, abWechsel, aufListeAenderung, abListeAenderung, aktuelles,
    get liste() { return liste; },
    get aktiveDid() { return aktiveDid; },
  };
})();
