/*
 * daten.js — Datenlayer: Verbindung zum ioBroker-Server (Socket.io), State-Zugriff,
 * Subscribe/Unsubscribe, Pub/Sub fuer Panels.
 *
 * Einzige Stelle im Widget, die mit Socket.io spricht (WIDGET_ARCHITEKTUR.md 8.2). Alle
 * anderen Module (config.js, geraete.js, trigger.js, Panels) reden nur mit Daten, nie
 * direkt mit Socket.io oder einer Adapter-Instanz.
 *
 * Verbindungsaufbau (Server-Adresse ermitteln, Socket.io-Client nachladen) folgt demselben
 * bewaehrten Muster wie das bisherige Widget (www/legacy.html, Bereich "Verbindung") — hier
 * als eigenstaendiges Modul neu geschrieben, keine Extraktion wie bei den Karten-Dateien
 * (WIDGET_UMBAU_PLAN.md Etappe B, Commit B3 ist Neubau).
 */

/* global io */

const Daten = (() => {
  const _par = new URLSearchParams(location.search);
  const _merk = (schluessel, wert) => {
    try {
      if (wert) localStorage.setItem('dreame.' + schluessel, wert);
      return localStorage.getItem('dreame.' + schluessel);
    } catch (e) { return null; }
  };
  // Server-Adresse: 1. URL (?iob=...), 2. im Browser gemerkt, 3. Herkunft der Seite
  // (Stufe 3 greift im Adapter-Betrieb automatisch, ohne jede Einstellung).
  const IOB = _par.get('iob') || _merk('iob', _par.get('iob'))
    || (location.protocol === 'file:' ? '' : location.origin);

  let sock = null;
  let verbunden = false;
  const stateAbonnenten = {};  // State-ID -> Set(callback(wert, state))
  const musterAbonnenten = {}; // Muster -> { regex, cbs: Set(callback(id, wert, state)) }, fuer C5.5-1
  const themenAbonnenten = {}; // Thema (z.B. 'verbindung') -> Set(callback(wert)), fuer Pub/Sub ohne State-ID

  /** Wildcard-Muster ('*' = beliebig viele Zeichen) in RegExp uebersetzen, alle anderen
   * Regex-Sonderzeichen werden escaped. Fuer subscribeMuster()/unsubscribeMuster(). */
  function musterZuRegex(muster) {
    const escaped = muster.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
    return new RegExp('^' + escaped + '$');
  }

  function ladeScript(src) {
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = src; s.onload = res; s.onerror = rej;
      document.head.appendChild(s);
    });
  }

  function socketOeffnen() {
    return new Promise(res => {
      if (!window.io) { res(null); return; }
      const s = io(IOB, { transports: ['websocket', 'polling'], timeout: 5000 });
      let fertig = false;
      const abschliessen = v => { if (!fertig) { fertig = true; res(v); } };
      s.on('connect', () => abschliessen(s));
      s.on('connect_error', () => abschliessen(null));
      setTimeout(() => abschliessen(null), 6000);
    });
  }

  function veroeffentliche(thema, wert) {
    (themenAbonnenten[thema] || new Set()).forEach(cb => {
      try { cb(wert); } catch (e) { console.error('[daten] Abonnent-Fehler bei Thema', thema, e); }
    });
  }

  function meldeVerbindung(status) {
    verbunden = status;
    veroeffentliche('verbindung', status);
  }

  /** Verbindung aufbauen. Gibt bei Erfolg den Socket zurueck, sonst null. */
  async function verbinden() {
    if (!IOB) { meldeVerbindung(false); return null; }
    try {
      await ladeScript(IOB + '/socket.io/socket.io.js');
      sock = await socketOeffnen();
    } catch (e) { sock = null; }
    if (!sock) { meldeVerbindung(false); return null; }
    sock.on('stateChange', (id, st) => {
      if (!st) return;
      (stateAbonnenten[id] || new Set()).forEach(cb => {
        try { cb(st.val, st); } catch (e) { console.error('[daten] Abonnent-Fehler bei', id, e); }
      });
      for (const muster in musterAbonnenten) {
        const eintrag = musterAbonnenten[muster];
        if (!eintrag.regex.test(id)) continue;
        eintrag.cbs.forEach(cb => {
          try { cb(id, st.val, st); } catch (e) { console.error('[daten] Muster-Abonnent-Fehler bei', muster, id, e); }
        });
      }
    });
    sock.on('disconnect', () => meldeVerbindung(false));
    sock.on('connect', () => meldeVerbindung(true));
    meldeVerbindung(true);
    return sock;
  }

  function getState(id) {
    return new Promise(r => sock ? sock.emit('getState', id, (e, st) => r(st ? st.val : null)) : r(null));
  }

  function getStates(muster) {
    return new Promise(r => sock ? sock.emit('getStates', muster, (e, st) => r(st || {})) : r({}));
  }

  function getObject(id) {
    return new Promise(r => sock ? sock.emit('getObject', id, (e, o) => r(o)) : r(null));
  }

  /** Objekte per Muster (z.B. 'dreame.0.<did>.remote.custom-room-cleaning.map-5.*') --
   * gebraucht, um an native.roomId je Checkbox-State zu kommen (Etappe C, Commit C5),
   * das getState/getStates nicht liefert. Gleiches Aufruf-Muster wie getStates(). */
  function getObjects(muster) {
    return new Promise(r => sock ? sock.emit('getObjects', muster, (e, o) => r(o || {})) : r({}));
  }

  function setState(id, wert) {
    return new Promise(r => sock ? sock.emit('setState', id, wert, () => r(true)) : r(false));
  }

  /** State abonnieren. Mehrere Panels koennen denselben State abonnieren — erst beim
   * letzten unsubscribe wird die Socket.io-Subscription tatsaechlich beendet. */
  function subscribe(id, cb) {
    if (!stateAbonnenten[id]) {
      stateAbonnenten[id] = new Set();
      if (sock) sock.emit('subscribe', id);
    }
    stateAbonnenten[id].add(cb);
  }

  function unsubscribe(id, cb) {
    const set = stateAbonnenten[id];
    if (!set) return;
    set.delete(cb);
    if (!set.size) {
      delete stateAbonnenten[id];
      if (sock) sock.emit('unsubscribe', id);
    }
  }

  /** Muster abonnieren (z.B. 'dreame.0.<did>.remote.custom-room-cleaning.map-1.*') --
   * fuer States, deren IDs erst zur Laufzeit bekannt sind (Etappe C5.5, WIDGET_UMBAU_PLAN.md
   * Abschnitt 5.1). Callback bekommt anders als bei subscribe() die konkrete ID mit
   * (cb(id, wert, state)), weil unter einem Muster mehrere States liegen koennen. Das
   * ioBroker-Backend versteht Wildcard-Muster direkt im 'subscribe'-Emit (wie bei vis); die
   * lokale musterAbonnenten-Regex dient nur dem Dispatch auf die richtigen Callbacks. */
  function subscribeMuster(muster, cb) {
    if (!musterAbonnenten[muster]) {
      musterAbonnenten[muster] = { regex: musterZuRegex(muster), cbs: new Set() };
      if (sock) sock.emit('subscribe', muster);
    }
    musterAbonnenten[muster].cbs.add(cb);
  }

  function unsubscribeMuster(muster, cb) {
    const eintrag = musterAbonnenten[muster];
    if (!eintrag) return;
    eintrag.cbs.delete(cb);
    if (!eintrag.cbs.size) {
      delete musterAbonnenten[muster];
      if (sock) sock.emit('unsubscribe', muster);
    }
  }

  /** Themen-Pub/Sub fuer Ereignisse ohne eigene State-ID (z.B. Verbindungsstatus). */
  function auf(thema, cb) {
    if (!themenAbonnenten[thema]) themenAbonnenten[thema] = new Set();
    themenAbonnenten[thema].add(cb);
  }
  function abAuf(thema, cb) {
    (themenAbonnenten[thema] || new Set()).delete(cb);
  }

  return {
    IOB, verbinden, getState, getStates, getObject, getObjects, setState, subscribe, unsubscribe,
    subscribeMuster, unsubscribeMuster, auf, abAuf,
    get verbunden() { return verbunden; },
  };
})();
