/*
 * main.js — Startpunkt: Datenlayer verbinden, Geraet + Config laden, Minimal-Karte aufbauen.
 *
 * WIDGET_UMBAU_PLAN.md Etappe B, Commit B5. Ziel laut Plan: "Karte funktioniert, keine
 * Steuerung, keine Panels." PanelRegistry (panel.js, Commit B4) wird hier bewusst NICHT
 * genutzt — kein Panel ist registriert, das kommt erst in Etappe C/D.
 *
 * WICHTIG — Grenze zu Etappe C, bitte beim Bauen von reinigung.js/kopf.js lesen:
 * Ricardos rebuild() (www/js/karte/overlays.js) ruft selbst buildRoomList(), setupZoom()
 * und updateCleanPanel() auf — alles UI-Chrome, das ohne Zahnrad-Overlay/Raumliste/
 * Reinigungs-Panel-DOM sofort crashen wuerde. Deshalb wird rebuild() hier NICHT aufgerufen;
 * stattdessen wird seine Kernsequenz (decode -> drawFills -> buildOverlay -> feedTrail ->
 * fitVisible) von Hand nachgebaut, minus der drei UI-Aufrufe. rebuild() selbst bleibt in
 * overlays.js unveraendert liegen und ist bereit, sobald Etappe C so weit ist — dann sollte
 * DIESE Handnachbildung hier durch einen echten rebuild()-Aufruf ersetzt werden.
 *
 * Ausserdem ruft buildOverlay() bereits jetzt updateRoomBadges() auf (www/js/karte/render.js),
 * das customizedCleaning/raumSaugt/raumWischt/raumWdh/globalSaug/globalWasser/
 * geraetGestartet() braucht. Diese Namen waren bis Etappe C als Platzhalter deklariert
 * (sichere Default-Werte, keine Funktion) — Commit C1 (kopf.js) hat geraetGestartet() und
 * updateBadges() bereits durch echte Implementierungen ERSETZT (siehe kopf.js-Kommentarkopf,
 * Bruecken-Funktionen dort). Die restlichen fuenf (customizedCleaning, raumSaugt/raumWischt/
 * raumWdh, raumSaug/raumWasser, globalSaug/globalWasser, updateCleanPanel) bleiben bis
 * Etappe C5 (reinigung.js) unten als Platzhalter stehen — ERSETZEN, nicht daneben neu anlegen.
 *
 * Siehe WIDGET_SESSION_STATUS.md fuer die vollstaendige Herleitung dieser Entscheidung.
 */

/* global Daten, Geraete, Config, PanelRegistry, KopfPanel, WartungPanel, StatistikPanel */

// ===== Zustand (verbatim aus www/legacy.html "Zustand"-Bereich uebernommen, minus SOCK —
// die alte direkte Socket.io-Sendefunktion cmd() wird nicht mehr gebraucht, Trigger/Daten
// aus Etappe B/Commit B3 uebernehmen das). Wird von www/js/karte/*.js referenziert. =====
const NS = 'http://www.w3.org/2000/svg', cell = 4;
const hidden = new Set(); const labelEls = {}, rowEls = {};
const markEls = {}; // raumId -> <g> mit Raumname + Badge (gegen den Zoom skaliert)
const cv = document.getElementById('map'), ov = document.getElementById('overlay');
const ctx = cv.getContext('2d'); ctx.imageSmoothingEnabled = false;
const off = document.createElement('canvas'); const octx = off.getContext('2d');
const stage = document.getElementById('stage'), wrap = document.getElementById('mapwrap');
let W, He, GS, H, META, rooms, raw, mapStart, MAPW, MAPH;
let robotMk = null, chargerMk = null, robotPos = null, chargerPos = null;
let trailEl = null, mopEl = null, trailPts = [];
let scale = 1, tx = 0, ty = 0, minScale = 1, box = { x0: 0, y0: 0, x1: 1, y1: 1 }, firstFit = true;
const selectedRooms = new Set(); // per Klick gewaehlte Raeume (kommt erst mit Etappe C zum Tragen)

// ===== Aussehen: nur was die Karte selbst braucht. uiFaktor/kartenDrehung kommen aus
// dem NEUEN Config-System (Commit B3), nicht mehr aus URL-Parametern/localStorage wie im
// alten Widget — die Aussehen-Einstellungen ziehen erst mit Etappe E ins Zahnrad-Overlay. =====
let uiFaktor = 1;
let kartenDrehung = 0; // wird nach Config.laden() aus config.aussehen.drehung gesetzt

// ===== Platzhalter fuer die Reinigungs-Domäne (Etappe C5) =====
// updateRoomBadges() (render.js) braucht diese Namen, weil buildOverlay() sie unbedingt
// aufruft. Sichere Defaults: keine Auswahl, einheitlicher Modus — die Badges zeigen dadurch
// schlicht nichts an, solange reinigung.js noch nicht existiert. geraetGestartet() und
// updateBadges() waren hier ebenfalls Platzhalter (Etappe C1) — kopf.js (Commit C1) hat sie
// ERSETZT, siehe dortigen Kommentarkopf. Etappe C5 ERSETZT die verbleibenden fuenf Namen durch
// echte Implementierungen aus remote.customized-cleaning/-suction-level/-wetness-level/
// map.cleanset.*.RoomSettings, keine Doppel-Deklaration daneben anlegen.
let customizedCleaning = false;
let globalSaug = 1, globalWasser = 3;
const raumSaugt = () => false;
const raumWischt = () => false;
const raumWdh = () => 1;
const raumSaug = () => globalSaug;
const raumWasser = () => globalWasser;
// updateCleanPanel(): Reinigungs-Panel-DOM (Etappe C5) existiert noch nicht, wird von
// render.js' selectRoom() bei jedem Kartenklick aufgerufen. No-op bis Etappe C5.
function updateCleanPanel() {}

// ===== Panels (Etappe C). Weitere Panel-Klassen kommen mit ihren Commits dazu. =====
PanelRegistry.registriere('kopf', KopfPanel);
PanelRegistry.registriere('wartung', WartungPanel);
PanelRegistry.registriere('statistik', StatistikPanel);

// ===== Verbindungsstatus (Karten-Overlay oben rechts) + Geraetename in der Kopfzeile =====
const errEl = document.getElementById('err');
const connEl = document.getElementById('conn');
function setConn(txt, col) { connEl.textContent = txt; connEl.style.color = col || ''; connEl.style.borderColor = col || ''; }
setConn('🟡 Verbindet…', '#ffcc66');

// Gebunden an den echten Adapter-State dreame.0.info.connection (Cloud-Verbindung des
// Adapters zum Geraet-Hersteller-Backend) -- NICHT an das Socket.io-Verbindungsereignis zum
// ioBroker-Server selbst, das nur sagt, ob unser Browser mit ioBroker spricht, nichts ueber
// die Geraeteverbindung. Adapter-weiter State (kein DID-Anteil), siehe main.js dreame.0.
const CONN_ID = 'dreame.0.info.connection';
function zeigeVerbindung(wert) {
  if (wert == null) setConn('🟡 Verbindet…', '#ffcc66');
  else setConn(wert ? '🟢 Live' : '🔴 Offline', wert ? '#38e29b' : '#ff8098');
}

// ===== Minimaler Zoom/Pan (ERSETZT Ricardos setupZoom() aus overlays.js fuer diesen
// Commit: setupZoom() verdrahtet zusaetzlich Zahnrad/Badge-Klick/Stations-Klick/UI-Regler,
// die es hier alle noch nicht gibt. Nutzt dieselben Funktionen/Variablen (zoomAt, fitVisible,
// clamp, applyT, hitRoom, selectRoom aus overlays.js/render.js), nur ohne die UI-Chrome. =====
function initZoomPan() {
  stage.addEventListener('wheel', e => { e.preventDefault(); zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.15 : 1 / 1.15); }, { passive: false });
  let drag = false, lx = 0, ly = 0, sx0 = 0, sy0 = 0;
  const aufBedienung = t => !!(t && t.closest && t.closest('.zoom'));
  stage.addEventListener('pointerdown', e => {
    if (aufBedienung(e.target)) return;
    drag = true; lx = e.clientX; ly = e.clientY; sx0 = e.clientX; sy0 = e.clientY;
    wrap.classList.add('drag'); stage.setPointerCapture(e.pointerId);
  });
  stage.addEventListener('pointermove', e => { if (!drag) return; tx += e.clientX - lx; ty += e.clientY - ly; lx = e.clientX; ly = e.clientY; clamp(); applyT(); });
  stage.addEventListener('pointerup', e => {
    if (aufBedienung(e.target)) return;
    drag = false; wrap.classList.remove('drag');
    const moved = Math.hypot(e.clientX - sx0, e.clientY - sy0);
    const schwelle = (e.pointerType === 'touch' || e.pointerType === 'pen') ? 12 : 5;
    if (moved < schwelle) { const seg = hitRoom(e.clientX, e.clientY); if (seg != null) selectRoom(seg); }
  });
  const ctr = () => { const r = stage.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };
  document.getElementById('z-in').onclick = () => zoomAt(...ctr(), 1.3);
  document.getElementById('z-out').onclick = () => zoomAt(...ctr(), 1 / 1.3);
  document.getElementById('z-reset').onclick = fitVisible;
  window.addEventListener('resize', () => { box = visibleBox(); clamp(); applyT(); });
  if (window.ResizeObserver) {
    new ResizeObserver(() => {
      if (!stage.clientWidth || !stage.clientHeight) return;
      if (fitOffen) fitVisible();
      else { box = visibleBox(); clamp(); applyT(); }
    }).observe(stage);
  }
}

// ===== Kartenpaket verarbeiten (ERSETZT Ricardos rebuild() fuer diesen Commit — siehe
// Kommentarkopf oben, warum rebuild() selbst nicht aufgerufen wird). =====
let zoomBereit = false;
async function kartenPaketVerarbeiten(cloudStr) {
  await decode(cloudStr);
  for (const id of [...selectedRooms]) if (!rooms[id]) selectedRooms.delete(id);
  const newTrail = Array.isArray(META.trpts)
    ? META.trpts.map(a => ({ x: a[0], y: a[1], operator: TRPT_OP[a[2]] || 'L' }))
    : decodeTr(META.tr);
  drawFills();
  buildOverlay();
  updateLabels();
  if (!zoomBereit) { initZoomPan(); zoomBereit = true; }
  const repAng = robotAngle();
  if (repAng !== null && repAng !== undefined) { angFrom = (angTo === null) ? repAng : angTo; angTo = repAng; }
  feedTrail(newTrail);
  if (firstFit) { fitVisible(); firstFit = false; } else { box = visibleBox(); clamp(); applyT(); }
}

(async () => {
  try {
    const sock = await Daten.verbinden();
    if (!sock) {
      errEl.textContent = Daten.IOB
        ? 'Keine Verbindung zu ' + Daten.IOB + '\n\nLäuft der web-Adapter? Ist die Adresse erreichbar?'
        : 'Kein ioBroker-Server bekannt.\n\nBeim Aufruf über den Adapter wird er automatisch erkannt.';
      setConn('🔴 keine Verbindung', '#ff8098');
      return;
    }
    Daten.subscribe(CONN_ID, zeigeVerbindung);
    zeigeVerbindung(await Daten.getState(CONN_ID));

    const geraet = await Geraete.starten();
    if (!geraet) {
      errEl.textContent = 'Kein Dreame-Gerät gefunden.\n\nLäuft der Adapter (dreame.0) und hat er ein Gerät angelegt?\nBestimmtes Gerät wählen: ?did=<Geräte-ID>';
      setConn('🔴 kein Gerät', '#ff8098');
      return;
    }
    const did = geraet.did;
    document.getElementById('devName').textContent = geraet.name;
    document.title = 'Map – ' + geraet.name;

    const config = await Config.laden(did);
    kartenDrehung = (config.aussehen && Number(config.aussehen.drehung)) || 0;

    for (const { id, klasse } of PanelRegistry.aktive(config, geraet.typ)) {
      const panel = new klasse(id, document.getElementById('panel-' + id));
      panel.zeige();
      await panel.init(did);
    }

    const cloudId = `dreame.0.${did}.map.mergedCloud`;
    const robotId = `dreame.0.${did}.map.robot`;
    const chargerId = `dreame.0.${did}.map.charger`;

    robotPos = parsePt(await Daten.getState(robotId));
    chargerPos = parsePt(await Daten.getState(chargerId));
    const cloud = await Daten.getState(cloudId);
    if (cloud) await kartenPaketVerarbeiten(cloud);

    Daten.subscribe(robotId, val => updateRobot(parsePt(val)));
    Daten.subscribe(chargerId, val => updateCharger(parsePt(val)));
    Daten.subscribe(cloudId, val => { if (val) kartenPaketVerarbeiten(val); });
  } catch (e) {
    errEl.textContent = 'Fehler: ' + e.message + '\n' + (e.stack || '');
    setConn('🔴 Fehler', '#ff8098');
  }
})();
