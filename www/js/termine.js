/*
 * Termine-Modal (F5, WIDGET_FEATURE_PLAN.md): Liste der App-seitig angelegten Termine
 * (dreame.0.<did>.schedule.<id>.{time,weekdays,type,enabled,rooms,parameters,shortcutId,
 * orphan}, siehe main.js parseSchedule() + WIDGET_TERMINE_PLAN.md S1-S7). Kein Panel im
 * PanelRegistry-Sinn (kein fester Sidebar-Container) -- eigenstaendiges Overlay, ueber einen
 * Knopf im Zahnrad-Overlay geoeffnet, analog zum bereits in main.js sitzenden
 * Zahnrad-Overlay-Code (kein separates Panel-Basisklassen-Muster noetig, kein Geraete-
 * abhaengiges Sidebar-Element).
 *
 * type/mode/suction/route/roomName kommen vom Adapter BEREITS uebersetzt (I18n.translate()
 * serverseitig, siehe main.js parseSchedule()/_translateScheduleEnum()/_resolveRoomName(),
 * Termine-Session dieser Etappe) -- das Widget zeigt sie unveraendert an, keine eigene
 * Uebersetzung dafuer noetig. Nur die Chrome-Texte dieses Moduls selbst (Knopf, Titel,
 * Hinweise, Leer-Zustand) sind eigene i18n-Keys (termine.*), wie bei jedem neuen Panel seit
 * F3/F4.
 *
 * Bekannte Einschraenkung: weekdays ist immer Deutsch (lib/schedule.js resolveWeekdays(),
 * keine I18n.translate()-Anbindung adapterseitig, gibt feste Kuerzel wie "Mo,Mi,Fr" oder
 * "taeglich" aus) -- nicht Teil dieser Etappe, adapterseitige Anpassung waere ein separater
 * Schritt.
 *
 * roomName und der Shortcut-Name (separat via shortcuts.<id>.name aufgeloest, siehe
 * shortcutNamen unten) sind echter freier Nutzertext aus der Dreame-App -- HTML-escaped wie
 * bei shortcuts.js, aus demselben Grund (Injection-Schutz).
 */

/* global Daten, t, uiIcon */

const Termine = (() => {
  let did = null;
  let scheduleMuster = null;
  let shortcutMuster = null;
  let offen = false;
  const termine = {}; // scheduleId -> {time, weekdays, type, enabled, rooms, parameters, shortcutId, orphan}
  const shortcutNamen = {}; // shortcutId (string) -> name

  const escapeHtml = text => String(text).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));

  function scheduleUebernehmen(stateId, wert) {
    const teile = stateId.split('.');
    const feld = teile[teile.length - 1];
    if (feld === '_backup') return; // eigener Pfad direkt unter .schedule, kein Termin-Feld
    const id = teile[teile.length - 2];
    if (!termine[id]) termine[id] = {};
    if (feld === 'rooms' || feld === 'parameters') {
      try { termine[id][feld] = JSON.parse(wert); } catch (e) { termine[id][feld] = null; }
    } else if (feld === 'enabled' || feld === 'orphan') {
      termine[id][feld] = !!wert;
    } else if (feld === 'shortcutId') {
      termine[id][feld] = wert == null ? null : Number(wert);
    } else if (feld === 'time' || feld === 'weekdays' || feld === 'type') {
      termine[id][feld] = wert;
    }
    // 'raw' bewusst nicht uebernommen -- reines Adapter-Debugfeld, im Modal nicht gebraucht.
  }

  function shortcutUebernehmen(stateId, wert) {
    const teile = stateId.split('.');
    if (teile[teile.length - 1] !== 'name') return;
    shortcutNamen[teile[teile.length - 2]] = wert;
  }

  function onScheduleMuster(stateId, wert) {
    scheduleUebernehmen(stateId, wert);
    if (offen) render();
  }
  function onShortcutMuster(stateId, wert) {
    shortcutUebernehmen(stateId, wert);
    if (offen) render();
  }

  /** Fuer das aktuell aktive Geraet (neu) aufbauen -- main.js ruft das bei jedem
   * Geraete-Wechsel auf (ladeGeraet()), analog zu Config.laden()/anderen Kern-Modulen. */
  async function setDid(neuDid) {
    if (scheduleMuster) Daten.unsubscribeMuster(scheduleMuster, onScheduleMuster);
    if (shortcutMuster) Daten.unsubscribeMuster(shortcutMuster, onShortcutMuster);
    for (const k of Object.keys(termine)) delete termine[k];
    for (const k of Object.keys(shortcutNamen)) delete shortcutNamen[k];
    did = neuDid;
    scheduleMuster = did ? `dreame.0.${did}.schedule.*` : null;
    shortcutMuster = did ? `dreame.0.${did}.shortcuts.*` : null;
    if (!did) { if (offen) render(); return; }
    Daten.subscribeMuster(scheduleMuster, onScheduleMuster);
    Daten.subscribeMuster(shortcutMuster, onShortcutMuster);
    const [scheduleWerte, shortcutWerte] = await Promise.all([
      Daten.getStates(scheduleMuster),
      Daten.getStates(shortcutMuster),
    ]);
    for (const [stateId, st] of Object.entries(scheduleWerte || {})) scheduleUebernehmen(stateId, st && st.val);
    for (const [stateId, st] of Object.entries(shortcutWerte || {})) shortcutUebernehmen(stateId, st && st.val);
    if (offen) render();
  }

  /** Eine Zeile "Modus, Saugstaerke, Nx, Feuchtigkeit%[, Route: ...]" -- gemeinsames Format
   * fuer Raum-Zeilen (rooms) und die einzelne Parameter-Zeile (all_rooms). mode/suction/
   * route sind bereits adapterseitig uebersetzte Strings (main.js _translateScheduleEnum()),
   * kein escapeHtml() noetig (fester Key-Katalog, kein freier Nutzertext). */
  function formatEinstellungen({ mode, suction, cycles, route, moisture }) {
    const teile = [
      mode, suction,
      cycles != null ? `${cycles}×` : null,
      moisture != null ? `${moisture}%` : null,
      route ? `${t('termine.route-praefix')} ${route}` : null,
    ];
    return teile.filter(Boolean).join(', ');
  }

  function detailsHtml(termin) {
    if (termin.type === 'rooms' && Array.isArray(termin.rooms)) {
      return termin.rooms.map(raum => `<div class="traum">`
        + `<span class="traum-name">${escapeHtml(raum.roomName || '?')}</span>`
        + ` <span class="traum-werte">${escapeHtml(formatEinstellungen(raum))}</span></div>`).join('');
    }
    if (termin.type === 'all_rooms' && termin.parameters) {
      return `<div class="traum-werte">${escapeHtml(formatEinstellungen(termin.parameters))}</div>`;
    }
    if (termin.type === 'shortcut') {
      const name = termin.shortcutId != null ? shortcutNamen[String(termin.shortcutId)] : null;
      return `<div class="traum-werte">${name != null ? escapeHtml(name) : `#${termin.shortcutId}`}</div>`;
    }
    return '';
  }

  function render() {
    const liste = document.getElementById('termineListe');
    if (!liste) return;
    const eintraege = Object.entries(termine)
      .filter(([, termin]) => termin.time != null)
      .sort((a, b) => (a[1].time || '').localeCompare(b[1].time || ''));

    if (!eintraege.length) {
      liste.innerHTML = `<div class="zovl-inhalt">${t('termine.leer')}</div>`;
      return;
    }

    liste.innerHTML = eintraege.map(([id, termin]) => {
      const gesperrt = termin.type === 'shortcut' && termin.orphan;
      const hinweis = gesperrt ? `<div class="tverwaist">${t('termine.verwaist')}</div>` : '';
      return `<div class="tcard">`
        + `<div class="tcard-kopf">`
        + `<span class="tzeit">${escapeHtml(termin.time || '')}</span>`
        + `<span class="ttage">${escapeHtml(termin.weekdays || '')}</span>`
        + `<span class="tart">${escapeHtml(termin.type || '')}</span>`
        + `<label class="zovl-switch-wrap tenable">`
        + `<input type="checkbox" class="zovl-switch" data-termin="${id}"`
        + `${termin.enabled ? ' checked' : ''}${gesperrt ? ' disabled' : ''}>`
        + `</label></div>`
        + `<div class="tdetails">${detailsHtml(termin)}</div>`
        + hinweis
        + `</div>`;
    }).join('');

    for (const el of liste.querySelectorAll('input[data-termin]')) {
      const scheduleId = el.dataset.termin;
      el.onchange = () => Daten.setState(`dreame.0.${did}.schedule.${scheduleId}.enabled`, el.checked);
    }
  }

  function oeffnen() {
    offen = true;
    document.getElementById('termineOvl').classList.add('open');
    render();
  }
  function schliessen() {
    offen = false;
    document.getElementById('termineOvl').classList.remove('open');
  }

  /** Statische Texte einmalig uebersetzen -- muss nach I18n.laden() laufen (siehe main.js
   * Start-IIFE), analog zu baueZovlPanelsListe(). */
  function initTexte() {
    const knopf = document.getElementById('zovlTermineBtn');
    if (knopf) knopf.innerHTML = `${uiIcon('wiederholung', 18)}<span>${t('termine.knopf')}</span>`;
    const titel = document.getElementById('termineTitel');
    if (titel) titel.textContent = t('termine.titel');
    const schliessenBtn = document.getElementById('termineSchliessen');
    if (schliessenBtn) schliessenBtn.textContent = t('termine.schliessen');
  }

  document.getElementById('zovlTermineBtn').onclick = oeffnen;
  document.getElementById('termineSchliessen').onclick = schliessen;
  // Klick auf den abgedunkelten Hintergrund (nicht auf die Box selbst) schliesst -- gleiches
  // Prinzip wie ein typisches Bottom-Sheet/Modal, .ovl deckt per inset:0 den ganzen Viewport ab.
  document.getElementById('termineOvl').addEventListener('click', e => {
    if (e.target.id === 'termineOvl') schliessen();
  });

  return { setDid, initTexte };
})();
