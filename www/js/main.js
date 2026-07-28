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
 * updateBadges() bereits durch echte Implementierungen ERSETZT, Commit C5 (reinigung.js) die
 * restlichen fuenf (customizedCleaning, raumSaugt/raumWischt/raumWdh, raumSaug/raumWasser,
 * globalSaug/globalWasser, updateCleanPanel) — main.js deklariert sie seitdem nicht mehr
 * selbst, siehe reinigung.js-Kommentarkopf.
 *
 * Siehe WIDGET_SESSION_STATUS.md fuer die vollstaendige Herleitung dieser Entscheidung.
 */

/* global Daten, Geraete, Config, PanelRegistry, KopfPanel, WartungPanel, StatistikPanel, StationPanel, ReinigungPanel, FehlerPanel, WasserMoppPanel */

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
// selectedRooms lebt seit Etappe C5.5 (Commit 3) in reinigung.js -- dort Adapter-Spiegel
// statt hier lokal deklariertes Klick-Set, siehe reinigung.js-Kommentarkopf.

// ===== Aussehen: nur was die Karte selbst braucht. uiFaktor/kartenDrehung kommen aus
// dem NEUEN Config-System (Commit B3), nicht mehr aus URL-Parametern/localStorage wie im
// alten Widget — die Aussehen-Einstellungen ziehen erst mit Etappe E ins Zahnrad-Overlay. =====
let uiFaktor = 1;
let kartenDrehung = 0; // wird nach Config.laden() aus config.layout.drehung gesetzt

// ===== Panels (Etappe C). Weitere Panel-Klassen kommen mit ihren Commits dazu. =====
PanelRegistry.registriere('kopf', KopfPanel);
PanelRegistry.registriere('fehler', FehlerPanel);
PanelRegistry.registriere('reinigung', ReinigungPanel);
PanelRegistry.registriere('wartung', WartungPanel);
PanelRegistry.registriere('frischwasser', WasserMoppPanel);
PanelRegistry.registriere('statistik', StatistikPanel);
PanelRegistry.registriere('station', StationPanel);

// ===== Verbindungsstatus (Karten-Overlay oben rechts) + Geraetename in der Kopfzeile =====
const errEl = document.getElementById('err');
const connEl = document.getElementById('conn');
function setConn(txt, col) { connEl.textContent = txt; connEl.style.color = col || ''; connEl.style.borderColor = col || ''; }
setConn('🟡 Verbindet…', '#ffcc66');

// ===== Roboter-Umschalter in der Kopfzeile (Etappe E, Commit E1, WIDGET_ARCHITEKTUR.md
// Abschnitt 12). Sitzt bewusst hier und NICHT in kopf.js: #devName liegt im Karten-Stage
// (index.html, .maptag.links), ausserhalb jedes Panel-Containers -- Panels werden bei jedem
// Geraete-Wechsel disposed und neu gebaut, der Umschalter selbst muss das ueberleben. Bei
// genau einem Geraet bleibt es reiner Text ohne Klick-Verhalten (unveraendertes Verhalten). =====
const devNameEl = document.getElementById('devName');
let geraeteDropdownEl = null;

function schliesseGeraeteDropdown() {
  if (geraeteDropdownEl) { geraeteDropdownEl.remove(); geraeteDropdownEl = null; }
}

function oeffneGeraeteDropdown() {
  schliesseGeraeteDropdown();
  const box = document.createElement('div');
  box.className = 'geraeteliste';
  for (const g of Geraete.liste) {
    const zeile = document.createElement('div');
    zeile.className = 'gitem' + (g.did === Geraete.aktiveDid ? ' aktiv' : '');
    zeile.textContent = g.name;
    zeile.onclick = e => { e.stopPropagation(); schliesseGeraeteDropdown(); Geraete.wechsle(g.did); };
    box.appendChild(zeile);
  }
  devNameEl.appendChild(box);
  geraeteDropdownEl = box;
  // Naechster Klick irgendwo (auch ausserhalb) schliesst wieder -- { once:true } braucht
  // kein manuelles Abmelden. capture:false reicht, weil der Listener erst NACH diesem
  // Klick-Event registriert wird (kein Selbst-Schliessen durch denselben Klick).
  setTimeout(() => document.addEventListener('click', schliesseGeraeteDropdown, { once: true }), 0);
}

/** Name (+ Dropdown-Faehigkeit) fuer das aktuell aktive Geraet neu aufbauen. Wird beim
 * Start, bei jedem Geraete-Wechsel und bei jeder reinen Listen-Aenderung aufgerufen
 * (WIDGET_ARCHITEKTUR.md Abschnitt 12: "Bei nur einem Roboter: Dropdown zeigt nur den
 * einen Namen als Label ohne Interaktion."). */
function renderGeraeteAuswahl(geraet) {
  schliesseGeraeteDropdown();
  devNameEl.textContent = geraet ? geraet.name : '–';
  const mehrere = Geraete.liste.length > 1;
  devNameEl.classList.toggle('umschaltbar', mehrere);
  devNameEl.onclick = mehrere ? (e => { e.stopPropagation(); oeffneGeraeteDropdown(); }) : null;
}

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
  // #devName ausgenommen seit Etappe E1 (Roboter-Umschalter): sonst faengt
  // setPointerCapture() jeden Klick darauf als Kartendrag/Raumklick ab, bevor
  // devNameEl.onclick ueberhaupt feuert -- gleiches Prinzip wie bei .zoom oben.
  const aufBedienung = t => !!(t && t.closest && (t.closest('.zoom') || t.closest('#devName')));
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

// ===== Geraete-Wechsel (Etappe E, Commit E1, WIDGET_ARCHITEKTUR.md Abschnitt 12/8.5):
// "Roboter-Wechsel ist ein Datenlayer-Ereignis, kein Reload." Alles unten war bis Commit E1
// einmaliger Ablauf in der Start-IIFE -- jetzt eine wiederverwendbare Funktion, aufgerufen
// beim Start UND bei jedem Geraete.aufWechsel()-Ereignis. =====

// Stabile Callback-Referenzen (fuer Daten.subscribe/unsubscribe -- dieselbe Funktion muss
// beim Ab-/Wiederanmelden uebergeben werden, sonst bleibt die alte Socket.io-Subscription
// bestehen). Die IDs selbst wechseln pro Geraet, siehe ladeGeraet().
function onRobotState(val) { updateRobot(parsePt(val)); }
function onChargerState(val) { updateCharger(parsePt(val)); }
function onCloudState(val) { if (val) kartenPaketVerarbeiten(val); }

let aktivePanels = [];
let aktRobotId = null, aktChargerId = null, aktCloudId = null;

function panelsAbbauen() {
  for (const panel of aktivePanels) { panel.verstecke(); panel.dispose(); }
  aktivePanels = [];
}

/** Kompletten Karten-Anzeigezustand auf "noch keine Karte da" zuruecksetzen. Noetig, weil
 * fast der komplette Karten-Layer (main.js/karte/*.js) aus modul-globalen Variablen fuer
 * GENAU EIN Geraet besteht (WIDGET_ARCHITEKTUR.md 5.4/8.1 sind darauf noch nicht
 * eingegangen) -- ohne diesen Reset wuerde beim Wechsel kurz die alte Karte/Spur/Marke des
 * VORHERIGEN Geraets stehen bleiben, bis das neue Geraet sein erstes Kartenpaket schickt
 * (oder, im Testfall eines Geraets ganz ohne Kartendaten, fuer immer). */
function resetKartenZustand() {
  if (animReq) cancelAnimationFrame(animReq);
  animReq = null;
  stopGlide();
  robotPos = null; chargerPos = null;
  robotMk = null; chargerMk = null;
  trailEl = null; mopEl = null;
  trailPts = []; cum = []; headDist = 0; sektTyp = [];
  staticSaug = ''; staticWisch = ''; staticIdx = 0;
  dispPos = null; dispAngle = null; angFrom = null; angTo = null; animT = 1;
  stationHit = null;
  markScale = null; markUi = null; markDreh = null;
  rooms = {}; raw = null; META = {}; H = null;
  // 0 statt undefined: hitRoom() (render.js, Ricardos Portierung, hier unveraendert) prueft
  // Kartengrenzen ueber "ox>=W||oy>=He" -- mit W/He=undefined waere dieser Vergleich immer
  // false (Vergleich mit undefined -> NaN), der Guard griffe nicht, und raw[...] crashte mit
  // "Cannot read properties of null" auf jeden Klick auf die Karte, solange das neue Geraet
  // noch kein erstes Kartenpaket geschickt hat. Mit 0 bleibt "ox>=0"/"oy>=0" wahr fuer jeden
  // Klick auf der Kartenflaeche, der Guard greift wie vorgesehen.
  W = He = GS = MAPW = MAPH = mapStart = 0;
  carpetSet = new Set(); carpetData = new Map();
  haHidden = new Set(); activeSegs = new Set(); zoneCleaning = false;
  roomColorIdx = {};
  changeSnap = null;
  hidden.clear();
  for (const k of Object.keys(markEls)) delete markEls[k];
  for (const k of Object.keys(labelEls)) delete labelEls[k];
  for (const k of Object.keys(rowEls)) delete rowEls[k];
  ctx.clearRect(0, 0, cv.width, cv.height);
  ov.innerHTML = '';
  firstFit = true;
}

/** Fuer ein Geraet (neu) aufbauen: Panels + Kartendaten. Wird beim Start UND bei jedem
 * Geraete-Wechsel aufgerufen (nach vorherigem Abbau des alten Zustands). */
async function ladeGeraet(did) {
  panelsAbbauen();
  resetKartenZustand();

  if (aktRobotId) Daten.unsubscribe(aktRobotId, onRobotState);
  if (aktChargerId) Daten.unsubscribe(aktChargerId, onChargerState);
  if (aktCloudId) Daten.unsubscribe(aktCloudId, onCloudState);

  const geraet = Geraete.aktuelles();
  renderGeraeteAuswahl(geraet);
  document.title = 'Map – ' + (geraet ? geraet.name : '?');

  const config = await Config.laden(did);
  kartenDrehung = (config.layout && Number(config.layout.drehung)) || 0;

  for (const { id, klasse } of PanelRegistry.aktive(config, geraet && geraet.typ)) {
    const panel = new klasse(id, document.getElementById('panel-' + id));
    aktivePanels.push(panel);
    panel.zeige();
    await panel.init(did);
  }

  aktCloudId = `dreame.0.${did}.map.mergedCloud`;
  aktRobotId = `dreame.0.${did}.map.robot`;
  aktChargerId = `dreame.0.${did}.map.charger`;

  robotPos = parsePt(await Daten.getState(aktRobotId));
  chargerPos = parsePt(await Daten.getState(aktChargerId));
  const cloud = await Daten.getState(aktCloudId);
  if (cloud) await kartenPaketVerarbeiten(cloud);

  Daten.subscribe(aktRobotId, onRobotState);
  Daten.subscribe(aktChargerId, onChargerState);
  Daten.subscribe(aktCloudId, onCloudState);
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
    Geraete.aufWechsel(g => { if (g) ladeGeraet(g.did); });
    Geraete.aufListeAenderung(() => renderGeraeteAuswahl(Geraete.aktuelles()));
    await ladeGeraet(geraet.did);
  } catch (e) {
    errEl.textContent = 'Fehler: ' + e.message + '\n' + (e.stack || '');
    setConn('🔴 Fehler', '#ff8098');
  }
})();
