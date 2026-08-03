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

/* global Daten, Geraete, Config, PanelRegistry, KopfPanel, WartungPanel, StatistikPanel, StationPanel, ReinigungPanel, FehlerPanel, WasserMoppPanel, ShortcutsPanel, TerminePanel, uiIcon */

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
// F4 (WIDGET_FEATURE_PLAN.md): direkt nach reinigung registriert -- Ziel-Reihenfolge laut
// Plan "erst alle Bedienelemente, dann Statusanzeigen"; station wandert hier erst mit F6
// nach vorne (siehe main.js-Kommentar bei den restlichen registriere()-Aufrufen unten).
// WICHTIG: Reihenfolge hier UND die DOM-Reihenfolge der <section>-Panels in index.html
// muessen uebereinstimmen -- main.js verschiebt beim Bauen keine DOM-Knoten, nur
// PanelRegistry.alle bestimmt Zahnrad-Reihenfolge; die sichtbare Sidebar-Reihenfolge kommt
// ausschliesslich aus der index.html-Reihenfolge der <section>-Elemente.
PanelRegistry.registriere('shortcuts', ShortcutsPanel);
// F5 (WIDGET_FEATURE_PLAN.md, nach Live-Test-Feedback): direkt nach shortcuts registriert +
// in index.html direkt danach im DOM -- David-Vorgabe "Termine-Knopf unter den Kurzbefehlen".
PanelRegistry.registriere('termine', TerminePanel);
// F6 (WIDGET_FEATURE_PLAN.md): von seiner alten Position (nach statistik) hierher vorgezogen
// -- Plan-Ziel "station direkt nach shortcuts/vor wartung", station steht damit direkt
// nach termine (F5 kam nach der Plan-Erstellung dazwischen).
PanelRegistry.registriere('station', StationPanel);
PanelRegistry.registriere('wartung', WartungPanel);
PanelRegistry.registriere('frischwasser', WasserMoppPanel);
PanelRegistry.registriere('statistik', StatistikPanel);

// ===== Verbindungsstatus (Karten-Overlay oben rechts) + Geraetename in der Kopfzeile =====
const errEl = document.getElementById('err');
const connEl = document.getElementById('conn');
function setConn(txt, col) {
  connEl.textContent = txt; connEl.style.color = col || ''; connEl.style.borderColor = col || '';
  aktualisiereOverlayRaender();
}
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
  aktualisiereOverlayRaender();
}

// ===== Zahnrad-Button + Einstellungs-Overlay (Etappe E, Commit E2b, WIDGET_UMBAU_PLAN.md
// Abschnitt 11). Sitzt hier statt in einem eigenen Panel-Modul: Umfang (Button + vier leere
// Platzhalter-Sections + Toggle/Escape) ist klein genug, main.js hat mit dem Roboter-
// Umschalter (E1) bereits aehnliches Karten-Chrome hier sitzen -- Bedienlogik/Config-Werte
// in den Sektionen folgen erst ab E2c. Offen/Zu ist reiner Widget-UI-Zustand (kein Adapter-
// State, keine Persistenz über Reload), siehe WIDGET_ARCHITEKTUR.md Ausnahme fuer temporaere
// UI-Zustaende. =====
const GEAR_SICHTBAR = new URLSearchParams(location.search).get('gear') !== '0'; // Kiosk-Modus fuer iframe-Einbettung
// data-gear aufs Root, konsistent mit data-leiste/data-farben -- CSS braucht es, um den
// #conn-Versatz (siehe layout.css) nur zu setzen, wenn tatsaechlich ein Zahnrad da ist.
document.documentElement.dataset.gear = GEAR_SICHTBAR ? 'an' : 'aus';
// data-einstellungen: 'an' nur waehrend das Overlay offen ist (siehe oeffneZahnradOvl()/
// schliesseZahnradOvl() unten) -- Default 'aus' bei jedem Start/Reload, Overlay ist nie
// initial offen.
document.documentElement.dataset.einstellungen = 'aus';
const zahnradBtn = document.getElementById('zahnradBtn');
const zahnradOvl = document.getElementById('zahnradOvl');

/** Misst die tatsaechlich gerenderte Breite von #conn und #devName (beide Text-Badges mit
 * dynamischem Inhalt -- Verbindungsstatus bzw. Geraetename) und schreibt sie als CSS-
 * Variablen auf :root. .zovl (layout.css) nutzt --conn-rand/--umschalter-rand fuer seinen
 * eigenen right/left-Wert, damit das Overlay nie den Badge ueberdeckt, egal wie lang der
 * aktuelle Text gerade ist (Nachtrag 3, WIDGET_SESSION_STATUS.md).
 * Rueckrechnung durch --ui: getBoundingClientRect() liefert die bereits gezoomte Breite,
 * .zovl multipliziert seinen eigenen right/left-Wert aber selbst nochmal mit --ui (gleiches
 * Prinzip wie #zahnradBtn/.maptag) -- ohne Ruecktransformation waere der Abstand ab dem
 * ersten Zoom-Wert != 1 (kommt erst mit dem E2c-Zoomregler) falsch.
 * Fragt die Elemente frisch per getElementById ab statt die weiter oben deklarierten
 * connEl/devNameEl-Konstanten zu nutzen: der allererste setConn()-Aufruf direkt nach dessen
 * Definition (siehe "setConn('Verbindet...')" weiter oben im Datei-Fluss) laeuft VOR der
 * devNameEl-Deklaration im Roboter-Umschalter-Abschnitt -- ein Zugriff auf das const
 * devNameEl waere dort noch in der Temporal Dead Zone und wuerfe einen ReferenceError,
 * der die ganze Startsequenz abbricht. Frische Abfrage umgeht das und macht die Funktion
 * unabhaengig davon, wo/wann sie im Skript aufgerufen wird. */
function aktualisiereOverlayRaender() {
  const ui = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ui')) || 1;
  const puffer = 10 + 14; // 10px Rand-Anker der Badges (.maptag-Konvention) + 14px Luft
  const conn = document.getElementById('conn');
  const devName = document.getElementById('devName');
  document.documentElement.style.setProperty('--conn-rand', (conn.getBoundingClientRect().width / ui + puffer) + 'px');
  document.documentElement.style.setProperty('--umschalter-rand', (devName.getBoundingClientRect().width / ui + puffer) + 'px');
}

function onZahnradEscape(e) { if (e.key === 'Escape') schliesseZahnradOvl(); }

function schliesseZahnradOvl() {
  zahnradOvl.classList.remove('offen');
  zahnradBtn.classList.remove('on');
  document.documentElement.dataset.einstellungen = 'aus';
  document.removeEventListener('keydown', onZahnradEscape);
  zovlResetZuruecksetzen(); // E2f: kein "Reset beim naechsten Oeffnen"-Rest-Zustand
}

function oeffneZahnradOvl() {
  zahnradOvl.classList.add('offen');
  zahnradBtn.classList.add('on');
  // F4-Live-Test-Fix: :root[data-einstellungen] steuert Bedienelemente AUSSERHALB des
  // Overlays selbst, die nur waehrend der Einstellungs-Bearbeitung sichtbar sein sollen
  // (z.B. das Auge-Icon je Kurzbefehl-Kachel, siehe shortcuts.js/layout.css .kbauge) --
  // gleiches Muster wie die bestehenden data-gear/data-farben/data-leiste-Attribute.
  document.documentElement.dataset.einstellungen = 'an';
  document.addEventListener('keydown', onZahnradEscape);
}

if (GEAR_SICHTBAR) {
  zahnradBtn.hidden = false;
  zahnradBtn.innerHTML = uiIcon('einstellungen', 24);
  zahnradBtn.onclick = () => {
    if (zahnradOvl.classList.contains('offen')) schliesseZahnradOvl(); else oeffneZahnradOvl();
  };
  document.getElementById('zovlSchliessen').onclick = schliesseZahnradOvl;
}
// Bleibt GEAR_SICHTBAR=false: Button bleibt hidden, kein Klick-Handler registriert, Escape-
// Listener wird nie angemeldet (nur beim Oeffnen ueber den Button) -- Overlay ist damit auch
// nicht per Escape erreichbar, ganz ohne Sonderfall-Code dafuer.

// ===== Aussehen-Sektion im Einstellungs-Overlay (Etappe E, Commit E2c). Vier Bedienelemente
// mit Live-Uebernahme + Persistenz nach config.widget.layout. aktiveWidgetConfig haelt die
// zuletzt von Config.laden() gelieferte Config als Modul-Zustand -- vorher gab es dafuer
// keinen Speicherort ausserhalb von ladeGeraet(), siehe E2c-Struktur-Analyse Punkt e). =====
let aktiveWidgetConfig = null; // gesetzt in ladeGeraet(), gelesen/geschrieben von schreibeLayout()

/** Schreibt einen Wert nach config.widget.layout.<feld> (Punkt-Notation fuer verschachtelte
 * Felder, z.B. "custom.hintergrund") und persistiert die komplette Config. Wird NACH der
 * lokalen visuellen Anwendung aufgerufen (siehe Handler unten) -- die sichtbare Reaktion
 * wartet nie auf den Netzwerk-Rundlauf. */
async function schreibeLayout(feld, wert) {
  const teile = feld.split('.');
  let ziel = aktiveWidgetConfig.layout;
  for (let i = 0; i < teile.length - 1; i++) ziel = ziel[teile[i]];
  ziel[teile[teile.length - 1]] = wert;
  await Config.speichern(Geraete.aktiveDid, aktiveWidgetConfig);
}

/** WCAG-relative Luminanz eines Hex-Farbwerts (#rrggbb). */
function relLuminanz(hex) {
  const kanal = s => (s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4));
  const r = kanal(parseInt(hex.slice(1, 3), 16) / 255);
  const g = kanal(parseInt(hex.slice(3, 5), 16) / 255);
  const b = kanal(parseInt(hex.slice(5, 7), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Waehlt zwischen den zwei im Theme bereits vorhandenen Text-Token (Dunkel-Schema hell,
 * Hell-Schema dunkel) dasjenige mit dem hoeheren WCAG-Kontrastverhaeltnis gegen den
 * gegebenen Hintergrund -- garantiert lesbar auch bei extremen Farben (reines Weiss/Schwarz,
 * gesaettigtes Rot), ohne experimentelle CSS-Funktionen (color-contrast()) oder das an die
 * OS-Praeferenz gebundene light-dark(), siehe E2c-Feinabstimmung. */
function waehleSchriftFarbe(hexHintergrund) {
  const lBg = relLuminanz(hexHintergrund);
  const lHell = relLuminanz('#e6ecf7'), lDunkel = relLuminanz('#1a2436');
  const kontrast = (l1, l2) => (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  return kontrast(lBg, lHell) >= kontrast(lBg, lDunkel) ? '#e6ecf7' : '#1a2436';
}

function wendeFarbmodus(modus) {
  document.documentElement.dataset.farben = modus; // 'hell'/'dunkel'/'hauptfarbe'/'custom', siehe theme.css
  document.getElementById('zovlHauptfarbeBlock').hidden = modus !== 'hauptfarbe';
  document.getElementById('zovlCustomBlock').hidden = modus !== 'custom';
}
function wendeHauptfarbe(hex) {
  document.documentElement.style.setProperty('--hauptfarbe', hex);
  document.documentElement.style.setProperty('--hauptfarbe-schrift', waehleSchriftFarbe(hex));
}
function wendeCustomFarbe(feld, hex) {
  document.documentElement.style.setProperty('--custom-' + feld, hex);
}

/** Alle vier Aussehen-Bedienelemente beim (Neu-)Laden eines Geraets aus der Config
 * vorbelegen + sofort visuell anwenden. Muss VOR renderGeraeteAuswahl() laufen (siehe
 * ladeGeraet()) -- das loest aktualisiereOverlayRaender() aus, das den hier gesetzten
 * --ui-Wert schon braucht, sonst rechnet der erste Aufruf fuer ein neues Geraet noch mit
 * dem --ui-Wert des vorherigen (oder dem CSS-Default). */
function initAussehenSektion(config) {
  const L = config.layout;

  const themeSel = document.getElementById('zovlTheme');
  themeSel.value = L.theme || 'dunkel';
  wendeFarbmodus(themeSel.value);

  const hauptfarbe = L.hauptfarbe || '#eef2f8';
  document.getElementById('zovlHauptfarbe').value = hauptfarbe;
  wendeHauptfarbe(hauptfarbe);

  const customDefaults = { hintergrund: '#eef2f8', menue: '#ffffff', knoepfe: '#f4f7fc', rahmen: '#dbe3ef', schrift: '#1a2436' };
  const customIds = { hintergrund: 'zovlCustomHintergrund', menue: 'zovlCustomMenue', knoepfe: 'zovlCustomKnoepfe', rahmen: 'zovlCustomRahmen', schrift: 'zovlCustomSchrift' };
  for (const feld of Object.keys(customDefaults)) {
    const wert = (L.custom && L.custom[feld]) || customDefaults[feld];
    document.getElementById(customIds[feld]).value = wert;
    wendeCustomFarbe(feld, wert);
  }

  document.getElementById('zovlDrehung').value = String(L.drehung || 0);

  const links = L.leiste === 'links';
  document.getElementById('zovlLeiste').checked = links;
  document.getElementById('zovlLeisteTxt').textContent = links ? 'Links' : 'Rechts';

  const groesse = (L.groesse != null) ? L.groesse : 1;
  document.documentElement.style.setProperty('--ui', groesse);
  document.getElementById('zovlGroesse').value = Math.round(groesse * 100);

  const breite = L.width || 275;
  document.documentElement.style.setProperty('--leiste-breite', breite + 'px');
  document.getElementById('zovlBreite').value = breite;
}

document.getElementById('zovlTheme').onchange = e => {
  wendeFarbmodus(e.target.value);
  schreibeLayout('theme', e.target.value);
};
document.getElementById('zovlHauptfarbe').onchange = e => {
  wendeHauptfarbe(e.target.value);
  schreibeLayout('hauptfarbe', e.target.value);
};
document.getElementById('zovlCustomHintergrund').onchange = e => { wendeCustomFarbe('hintergrund', e.target.value); schreibeLayout('custom.hintergrund', e.target.value); };
document.getElementById('zovlCustomMenue').onchange = e => { wendeCustomFarbe('menue', e.target.value); schreibeLayout('custom.menue', e.target.value); };
document.getElementById('zovlCustomKnoepfe').onchange = e => { wendeCustomFarbe('knoepfe', e.target.value); schreibeLayout('custom.knoepfe', e.target.value); };
document.getElementById('zovlCustomRahmen').onchange = e => { wendeCustomFarbe('rahmen', e.target.value); schreibeLayout('custom.rahmen', e.target.value); };
document.getElementById('zovlCustomSchrift').onchange = e => { wendeCustomFarbe('schrift', e.target.value); schreibeLayout('custom.schrift', e.target.value); };

document.getElementById('zovlDrehung').onchange = e => {
  kartenDrehung = Number(e.target.value);
  // Belegter Bereich aendert sich bei 90/270 (Breite/Hoehe tauschen) -- neu einpassen statt
  // nur neu zu zeichnen. Legacy-Muster aus legacy.html:drehRow, try/catch weil vor dem ersten
  // Kartenpaket eines Geraets rooms/raw noch leer sein koennen.
  try { box = visibleBox(); fitVisible(); } catch (err) { /* keine Kartendaten geladen */ }
  schreibeLayout('drehung', kartenDrehung);
};

const zovlLeisteEl = document.getElementById('zovlLeiste');
zovlLeisteEl.onchange = () => {
  const seite = zovlLeisteEl.checked ? 'links' : 'rechts';
  document.getElementById('zovlLeisteTxt').textContent = zovlLeisteEl.checked ? 'Links' : 'Rechts';
  document.documentElement.dataset.leiste = seite;
  schreibeLayout('leiste', seite);
};

// UI-Zoom (Etappe E2c, Nachtrag 2): Zahlenfeld + Minus/Plus statt Slider. User tippt
// bewusst eine Zahl -> onchange (Enter/Tab/Blur) wendet sofort an UND persistiert in einem
// Schritt, kein separates input-Live-Preview-Event wie beim Wetness-/E2c-Original-Slider.
// Prozent im Feld (70-150), Faktor (0.7-1.5) nur intern fuer --ui/config.layout.groesse.
const zovlGroesseEl = document.getElementById('zovlGroesse');
function wendeUndSchreibeGroesse(prozent) {
  const geklemmt = Math.min(150, Math.max(70, Math.round(prozent) || 100)); // HTML5 min/max
  // greift meist schon selbst, zusaetzliches Klemmen hier gegen "abc"/leer/Tippfehler
  zovlGroesseEl.value = geklemmt;
  document.documentElement.style.setProperty('--ui', geklemmt / 100);
  aktualisiereOverlayRaender(); // schliesst den deferred Punkt aus E2b/Nachtrag 3
  schreibeLayout('groesse', geklemmt / 100);
}
zovlGroesseEl.onchange = () => wendeUndSchreibeGroesse(Number(zovlGroesseEl.value));
document.getElementById('zovlGroesseMinus').onclick = () => wendeUndSchreibeGroesse(Number(zovlGroesseEl.value) - 5);
document.getElementById('zovlGroessePlus').onclick = () => wendeUndSchreibeGroesse(Number(zovlGroesseEl.value) + 5);

// Menue-Breite (F1, WIDGET_FEATURE_PLAN.md): Zahlenfeld + Minus/Plus statt Slider, exakt
// dasselbe Muster wie der UI-Zoom direkt darueber (Etappe E2c, Nachtrag 2) -- kein
// separates input-Live-Preview-Event, onchange (Enter/Tab/Blur) UND die beiden Knoepfe
// wenden sofort an UND persistieren in einem Schritt. Ersetzt den vorherigen
// input[type=range] (Etappe E2c, Nachtrag 3) -- config.widget.layout.width war und bleibt
// ein px-Wert, keine Migration noetig (siehe Plan-Korrektur 2026-08-03).
const MENUE_BREITE_SCHRITT_PX = 10;
const MENUE_BREITE_MIN_PX = 250;
const MENUE_BREITE_MAX_PX = 500;
const zovlBreiteEl = document.getElementById('zovlBreite');
function wendeUndSchreibeBreite(px) {
  const geklemmt = Math.min(MENUE_BREITE_MAX_PX,
    Math.max(MENUE_BREITE_MIN_PX, Math.round(px) || MENUE_BREITE_MIN_PX)); // HTML5 min/max
  // greift meist schon selbst, zusaetzliches Klemmen hier gegen "abc"/leer/Tippfehler
  zovlBreiteEl.value = geklemmt;
  document.documentElement.style.setProperty('--leiste-breite', geklemmt + 'px');
  schreibeLayout('width', geklemmt);
}
zovlBreiteEl.onchange = () => wendeUndSchreibeBreite(Number(zovlBreiteEl.value));
document.getElementById('zovlBreiteMinus').onclick =
  () => wendeUndSchreibeBreite(Number(zovlBreiteEl.value) - MENUE_BREITE_SCHRITT_PX);
document.getElementById('zovlBreitePlus').onclick =
  () => wendeUndSchreibeBreite(Number(zovlBreiteEl.value) + MENUE_BREITE_SCHRITT_PX);

// ===== Panels-Sektion im Einstellungs-Overlay (Etappe E2d): Sichtbarkeit-Toggle pro Panel
// (Ebene 1 aus WIDGET_UMBAU_PLAN.md Abschnitt 8.2). Ebene 2 (Feld-Sichtbarkeit "versteckt",
// Sub-Toggles je Panel) seit F3 (WIDGET_FEATURE_PLAN.md) ergaenzt -- panelsweise optional,
// ein Panel deklariert seine versteckbaren Felder ueber die statische
// Klasseneigenschaft versteckbareFelder (panel.js), Default leer (keine Sub-Toggles).
// kopf/fehler sind Kern-Chrome ohne eigene Ueberschrift (Start/Stop/Home bzw. Warnungen) --
// bewusst NICHT toggle-bar, damit sich niemand versehentlich die Bedienelemente wegklickt.
// Liste kommt aus PanelRegistry.alle (nicht hartcodierte Reihenfolge) -- sortiert sich die
// Registry um, folgen die Toggles automatisch. Nur die Anzeige-Namen sind hier gepflegt,
// weil es keine zentrale "Titel"-Eigenschaft je Panel-Klasse gibt. Bleiben bewusst als
// hartcodierte deutsche Strings stehen (nicht t()) -- PANEL_LABEL deckt alle sieben Panels
// ab, aber nur reinigung/shortcuts/termine/station/wartung haben bisher eigene i18n-Keys
// (F3/F4/F5/F6/F7a); volle Umstellung dieser Zahnrad-Liste folgt mit F7b-F9, wenn jedes
// Panel seine eigenen Keys bekommt. =====
const PANEL_LABEL = { reinigung: 'Reinigung', shortcuts: 'Kurzbefehle', termine: 'Termine', wartung: 'Wartung', frischwasser: 'Wasser & Mopp', statistik: 'Statistik', station: 'Station' };
const zovlPanelsListe = document.getElementById('zovlPanelsListe');

/** Baut die Panels-Toggle-Liste im Zahnrad-Overlay, inkl. Sub-Toggle-Zeilen fuer
 * Panel.versteckbareFelder (F3). Muss NACH I18n.laden() laufen (siehe Start-IIFE weiter
 * unten) -- die Sub-Toggle-Labels kommen ueber t(), das vor Ladeabschluss nur
 * Fallback-Werte liefert (siehe i18n.js-Kommentarkopf). */
function baueZovlPanelsListe() {
  zovlPanelsListe.innerHTML = PanelRegistry.alle
    .filter(eintrag => PANEL_LABEL[eintrag.id])
    .map(eintrag => {
      const subZeilen = (eintrag.klasse.versteckbareFelder || []).map(feld =>
        `<label class="zovl-feld zovl-feld-sub"><span>${t(feld.labelKey)}</span>`
        + `<input type="checkbox" class="zovl-switch" data-panel-feld="${eintrag.id}.${feld.id}"></label>`,
      ).join('');
      return `<label class="zovl-feld"><span>${PANEL_LABEL[eintrag.id]}</span>`
        + `<input type="checkbox" class="zovl-switch" data-panel="${eintrag.id}"></label>${subZeilen}`;
    })
    .join('');
}

/** Panel- und Feld-Sichtbarkeit-Checkboxen auf den Stand des aktuell aktiven Geraets
 * bringen (config.widget ist pro Geraet -- unterschiedliche Roboter koennen
 * unterschiedliche Panels/Felder ausgeblendet haben, Toggles muessen bei jedem
 * Geraete-Wechsel neu gesetzt werden). */
function initPanelsSektion(config) {
  for (const el of zovlPanelsListe.querySelectorAll('input[data-panel]')) {
    const eintrag = config.panels && config.panels[el.dataset.panel];
    el.checked = eintrag ? eintrag.sichtbar !== false : true;
  }
  for (const el of zovlPanelsListe.querySelectorAll('input[data-panel-feld]')) {
    const [panelId, feldId] = el.dataset.panelFeld.split('.');
    const eintrag = config.panels && config.panels[panelId];
    const versteckt = !!(eintrag && Array.isArray(eintrag.versteckt) && eintrag.versteckt.includes(feldId));
    el.checked = !versteckt; // Haken = sichtbar, gleiche Semantik wie die Panel-Ebene
  }
}

// Delegated Listener statt einzelner Handler pro Checkbox: die Checkboxen werden oben zur
// Laufzeit generiert, ihre Zahl/Reihenfolge kann sich mit der PanelRegistry aendern. Kein
// Minimum erzwungen -- alle Panels gleichzeitig aus ist erlaubt (David-Vorgabe),
// Sidebar bleibt dann einfach leer/leer bis auf kopf/fehler. Ein Handler fuer beide Ebenen
// (Panel UND Feld) -- data-panel-feld wird zuerst geprueft, sonst waere jeder Feld-Klick
// zusaetzlich (faelschlich) als Panel-Sichtbarkeit-Aenderung interpretierbar, weil
// dataset.panel bei verschachtelten data-*-Attributen sonst leicht verwechselt wird.
/** Setzt/loescht feldId in aktiveWidgetConfig.panels.<panelId>.versteckt -- rein
 * synchrone Mutation, keine Persistenz. Gemeinsam genutzt vom Zahnrad-Sub-Toggle-Handler
 * unten (F3) und der schreibePanelFeldVersteckt()-Bruecke (F4) fuer Panels mit dynamischer
 * Feld-Liste, siehe dort. */
function setzeFeldVersteckt(panelId, feldId, versteckt) {
  const eintrag = aktiveWidgetConfig.panels[panelId] || (aktiveWidgetConfig.panels[panelId] = { sichtbar: true, versteckt: [] });
  if (!Array.isArray(eintrag.versteckt)) eintrag.versteckt = [];
  const idx = eintrag.versteckt.indexOf(feldId);
  if (versteckt) { if (idx === -1) eintrag.versteckt.push(feldId); }
  else if (idx !== -1) eintrag.versteckt.splice(idx, 1);
}

/** Bruecke fuer Panels mit dynamischer (nicht zur Ladezeit bekannter) Feld-Liste (F4,
 * z.B. ShortcutsPanel) -- Panel.versteckbareFelder (F3) setzt eine feste, beim Bau der
 * Zahnrad-Liste bereits bekannte Liste voraus, was fuer pro Geraet unterschiedlich viele/
 * benannte Elemente (Shortcuts) nicht passt. Solche Panels bieten ihre
 * Sichtbarkeit-Bedienung direkt am Element an (z.B. Auge-Icon je Kachel, siehe
 * shortcuts.js) und rufen diese Bruecke zum Mutieren+Persistieren auf, statt selbst
 * Config/Geraete zu kennen -- gleiches Schichten-Prinzip wie raumUmschalten()/
 * updateCleanPanel() zwischen render.js und reinigung.js.
 * setzeFeldVersteckt() mutiert aktiveWidgetConfig SYNCHRON (vor dem ersten await hier) --
 * ein direkt anschliessendes this.render() im aufrufenden Panel sieht den neuen Wert also
 * bereits, ohne auf Config.speichern() zu warten (gleiches "visuell zuerst, Persistenz
 * async danach"-Prinzip wie main.js' schreibeLayout()). Absichtlich nicht awaitet beim
 * Aufruf, wie bei schreibeLayout() ueblich -- kein panelsAbbauen()/baueAktivePanels()-
 * Rundlauf noetig, weil nur das eine, bereits laufende Panel betroffen ist. */
async function schreibePanelFeldVersteckt(panelId, feldId, versteckt) {
  setzeFeldVersteckt(panelId, feldId, versteckt);
  await Config.speichern(Geraete.aktiveDid, aktiveWidgetConfig);
}

zovlPanelsListe.addEventListener('change', async e => {
  const panelFeld = e.target.dataset.panelFeld;
  if (panelFeld) {
    const [panelId, feldId] = panelFeld.split('.');
    setzeFeldVersteckt(panelId, feldId, !e.target.checked);
    panelsAbbauen();
    const geraetFeld = Geraete.aktuelles();
    await baueAktivePanels(aktiveWidgetConfig, Geraete.aktiveDid, geraetFeld && geraetFeld.typ);
    await Config.speichern(Geraete.aktiveDid, aktiveWidgetConfig);
    return;
  }
  const id = e.target.dataset.panel;
  if (!id) return;
  aktiveWidgetConfig.panels[id].sichtbar = e.target.checked;
  panelsAbbauen();
  const geraet = Geraete.aktuelles();
  await baueAktivePanels(aktiveWidgetConfig, Geraete.aktiveDid, geraet && geraet.typ);
  await Config.speichern(Geraete.aktiveDid, aktiveWidgetConfig);
});

// ===== Link-Sektion im Einstellungs-Overlay (Etappe E2e, WIDGET_SESSION_STATUS.md
// E2e-Struktur-Analyse): aktueller Widget-Zustand (Aussehen + Panels) als Delta gegen die
// Default-Config in einen Base64url-Blob kodiert und als ?cfg=-Parameter an die URL gehaengt.
// Rein ephemer -- schreibeLayout()/Config.speichern() werden hier bewusst NIE aufgerufen,
// der generierte Link veraendert config.widget nicht. Signal-Farben (nicht user-einstellbar)
// und die Roboter-ID (Sicherheitsentscheidung, URL soll kein Geraet auswaehlen koennen)
// werden nicht kodiert. =====

// Nur diese Layout-Felder sind ueberhaupt vom Nutzer im Overlay einstellbar (siehe E2c) --
// "farben"/"color"/"customBg" usw. sind ALTe, seit E2a/E2c abgeloeste Felder (config.js-
// Kommentarkopf) und werden hier bewusst nicht mitgefuehrt.
const ZOVL_LINK_LAYOUT_FELDER = ['theme', 'hauptfarbe', 'drehung', 'leiste', 'groesse', 'width'];
const ZOVL_LINK_CUSTOM_FARBEN = ['hintergrund', 'menue', 'knoepfe', 'rahmen', 'schrift'];

/** btoa()/atob() arbeiten auf Latin-1 (ein Byte pro Zeichen) -- JSON.stringify() kann
 * Unicode enthalten. Klassisches Idiom: erst URI-kodieren (jedes Nicht-ASCII-Zeichen wird zu
 * %XX-Sequenzen), dann jede %XX-Sequenz als einzelnes Byte interpretieren, das btoa() dann
 * unveraendert durchreicht. Rueckweg exakt umgekehrt. Anschliessend auf Base64url gebracht
 * (+/- und /_ getauscht, Padding entfernt) -- URL-sicher ohne Prozent-Escaping noetig. */
function b64UrlEncode(text) {
  const latin1 = encodeURIComponent(text).replace(/%([0-9A-F]{2})/g,
    (_, hex) => String.fromCharCode(parseInt(hex, 16)));
  return btoa(latin1).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64UrlDecode(blob) {
  const b64 = blob.replace(/-/g, '+').replace(/_/g, '/');
  const gepolstert = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
  const latin1 = atob(gepolstert);
  const prozentKodiert = latin1.split('').map(z => '%' + ('0' + z.charCodeAt(0).toString(16)).slice(-2)).join('');
  return decodeURIComponent(prozentKodiert);
}

/** Aktueller Widget-Zustand (Aussehen + Panels-Sichtbarkeit) -- gelesen direkt aus
 * aktiveWidgetConfig statt aus den DOM-Controls: schreibeLayout()/der Panels-Toggle-Handler
 * halten dieses Objekt bereits durchgehend aktuell (siehe deren Kommentarkoepfe), ein
 * separater DOM-Scrape waere nur eine fehleranfaellige zweite Quelle fuer denselben Zustand. */
function sammleAktuellenZustand() {
  const L = aktiveWidgetConfig.layout;
  const zustand = { layout: { custom: { ...L.custom } }, panels: {} };
  for (const feld of ZOVL_LINK_LAYOUT_FELDER) zustand.layout[feld] = L[feld];
  for (const { id } of PanelRegistry.alle) {
    zustand.panels[id] = { sichtbar: aktiveWidgetConfig.panels[id] ? aktiveWidgetConfig.panels[id].sichtbar !== false : true };
  }
  return zustand;
}

/** Zwei Layout-Feldwerte auf "gleich genug fuers Delta" pruefen -- kein strikter ===-
 * Vergleich fuer alle Felder: "groesse" ist ein Float (0.7-1.5) und kann durch den Zoom-
 * Reset/die Prozent<->Faktor-Umrechnung minimale Rundungsfehler haben (z.B.
 * 1.0000000000000002 statt 1), auf zwei Nachkommastellen gerundet reicht (Zahlenfeld-Schritt
 * ist 5%-Schritte = 0.05). Hex-Farben werden klein geschrieben verglichen -- <input
 * type="color"> liefert zwar immer lowercase, schadet aber nicht, falls sich das mal aendert.
 * drehung/width sind Integer und brauchen keine Sonderbehandlung. */
function zovlLinkFeldGleich(feld, a, b) {
  if (feld === 'groesse') return Math.round((Number(a) || 0) * 100) === Math.round((Number(b) || 0) * 100);
  if (typeof a === 'string' && typeof b === 'string') return a.toLowerCase() === b.toLowerCase();
  return a === b;
}

/** Delta zwischen dem uebergebenen Zustand (siehe sammleAktuellenZustand()) und der Default-
 * Config bilden -- nur Werte, die abweichen, kommen in den Blob (kompakte URL bei kleinen
 * Aenderungen, siehe WIDGET_SESSION_STATUS.md E2e-Struktur-Analyse). */
function bildeDelta(zustand) {
  const std = Config.defaultWidgetConfig();
  const delta = {};
  for (const feld of ZOVL_LINK_LAYOUT_FELDER) {
    if (!zovlLinkFeldGleich(feld, zustand.layout[feld], std.layout[feld])) {
      if (!delta.layout) delta.layout = {};
      delta.layout[feld] = zustand.layout[feld];
    }
  }
  for (const farbe of ZOVL_LINK_CUSTOM_FARBEN) {
    if (!zovlLinkFeldGleich(farbe, zustand.layout.custom[farbe], std.layout.custom[farbe])) {
      if (!delta.layout) delta.layout = {};
      if (!delta.layout.custom) delta.layout.custom = {};
      delta.layout.custom[farbe] = zustand.layout.custom[farbe];
    }
  }
  for (const id of Object.keys(zustand.panels)) {
    const stdSichtbar = std.panels[id] ? std.panels[id].sichtbar !== false : true;
    if (zustand.panels[id].sichtbar !== stdSichtbar) {
      if (!delta.panels) delta.panels = {};
      delta.panels[id] = { sichtbar: zustand.panels[id].sichtbar };
    }
  }
  return delta;
}

/** Vollstaendigen Link (Origin + Pfad + ?cfg=<Blob> + ggf. &gear=0) aus dem aktuellen
 * Widget-Zustand bauen. searchParams.set() escaped den Blob nicht unnoetig -- Base64url
 * enthaelt nur [A-Za-z0-9_-], alles davon ist in einer URL ohnehin unreserviert. */
function generiereZovlLink() {
  const delta = bildeDelta(sammleAktuellenZustand());
  const blob = b64UrlEncode(JSON.stringify(delta));
  const url = new URL(window.location.origin + window.location.pathname);
  url.searchParams.set('cfg', blob);
  if (document.getElementById('zovlLinkGearVerstecken').checked) url.searchParams.set('gear', '0');
  return url.toString();
}

/** ?cfg= aus der aktuellen URL lesen + dekodieren. Gibt null bei fehlendem/ungueltigem
 * Parameter zurueck (kein Absturz, siehe VERHALTEN-Abschnitt E2e-Prompt) -- ein Konsolen-
 * Warnung genuegt, das Widget startet dann einfach mit der unveraenderten Config weiter. */
function leseUrlCfgDelta() {
  const roh = new URLSearchParams(location.search).get('cfg');
  if (!roh) return null;
  try {
    const delta = JSON.parse(b64UrlDecode(roh));
    return (delta && typeof delta === 'object') ? delta : null;
  } catch (e) {
    console.warn('[link] ?cfg=-Parameter ist ungueltig, wird ignoriert:', e);
    return null;
  }
}

/** Delta aus der URL in die (bereits aus dem Adapter geladene) Config mergen -- IN PLACE,
 * feldweise pro verschachtelter Ebene (custom.*, panels.<id>.*), damit z.B. eine einzelne
 * geaenderte Custom-Farbe nicht die anderen vier auf Default zurueckwirft (ein flaches
 * Object.assign(config, delta) wuerde genau das tun). Schreibt nichts nach Config.speichern --
 * der Aufrufer (ladeGeraet()) uebergibt dasselbe Objekt unveraendert weiter an
 * initAussehenSektion()/initPanelsSektion()/baueAktivePanels(), die den Merge dadurch wie
 * ganz normale Config-Werte behandeln, ohne dass diese drei Funktionen selbst etwas von
 * ?cfg= wissen muessen. */
function wendeCfgDeltaAn(config, delta) {
  if (delta.layout) {
    const { custom, ...rest } = delta.layout;
    Object.assign(config.layout, rest);
    if (custom) Object.assign(config.layout.custom, custom);
  }
  if (delta.panels) {
    for (const id of Object.keys(delta.panels)) {
      if (!config.panels[id]) config.panels[id] = { sichtbar: true, versteckt: [] };
      Object.assign(config.panels[id], delta.panels[id]);
    }
  }
}

document.getElementById('zovlLinkGenerieren').onclick = () => {
  document.getElementById('zovlLinkFeld').value = generiereZovlLink();
  document.getElementById('zovlLinkKopieren').disabled = false;
};
document.getElementById('zovlLinkFeld').onfocus = e => e.target.select();

/** Button-Label kurz auf eine Rueckmeldung wechseln, danach zurueck auf "Kopieren" --
 * gemeinsamer Rueckweg fuer alle drei Kopier-Versuche unten. */
function zeigeZovlLinkLabel(text) {
  const btn = document.getElementById('zovlLinkKopieren');
  btn.textContent = text;
  setTimeout(() => { btn.textContent = 'Kopieren'; }, 1500);
}
function zeigeKopierErfolg() { zeigeZovlLinkLabel('Kopiert!'); }
function zeigeKopierManuellHinweis() { zeigeZovlLinkLabel('Bitte Strg+C druecken'); }

/** Dreistufiger Kopier-Versuch (Nachtrag E2e nach Live-Test): navigator.clipboard braucht
 * einen Secure Context (HTTPS oder localhost) -- das Widget laeuft bei David ueber HTTP,
 * dort ist window.isSecureContext false und die Clipboard-API entweder gar nicht vorhanden
 * oder ihr writeText() lehnt grundsaetzlich ab. document.execCommand('copy') ist deprecated,
 * funktioniert aber (im Gegensatz zur Clipboard-API) auch in HTTP-Kontexten, solange das
 * Zielfeld fokussiert+selektiert ist -- deshalb als zweiter Versuch vor dem rein manuellen
 * Fallback (Feld markiert lassen, User drueckt selbst Strg+C). */
async function kopiereLinkInsClipboard() {
  const feld = document.getElementById('zovlLinkFeld');
  const link = feld.value;
  if (!link) return;

  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(link);
      zeigeKopierErfolg();
      return;
    } catch (e) {
      // faellt durch zum naechsten Versuch
    }
  }

  try {
    feld.focus();
    feld.select();
    if (document.execCommand('copy')) {
      zeigeKopierErfolg();
      return;
    }
  } catch (e) {
    // faellt durch zum manuellen Fallback
  }

  feld.focus();
  feld.select();
  zeigeKopierManuellHinweis();
}
document.getElementById('zovlLinkKopieren').onclick = kopiereLinkInsClipboard;

// ===== Sonstiges-Sektion im Einstellungs-Overlay (Etappe E2f): einziger Button setzt
// config.widget auf Config.defaultWidgetConfig() zurueck und laedt das Widget neu. Adapter-
// Kanaele (tank.config, custom-room-cleaning, map-Namen) sind kein config.widget-Inhalt und
// bleiben unangetastet -- reiner Widget-Aussehen/Panels/Link-Reset. =====
const zovlResetBtn = document.getElementById('zovlResetBtn');
const zovlResetFehlerEl = document.getElementById('zovlResetFehler');
let zovlResetTimer = null;

/** Bestaetigungs-Zustand des Reset-Buttons zuruecksetzen -- sowohl beim 4-Sekunden-Timeout
 * als auch beim Schliessen des Overlays (siehe schliesseZahnradOvl() weiter oben): ohne
 * diesen zweiten Aufrufer wuerde ein Klick kurz vor dem Schliessen den "Wirklich
 * zuruecksetzen?"-Zustand bis zum naechsten Oeffnen stehen lassen ("Reset beim naechsten
 * Oeffnen"-Falle, siehe E2f-Vorgabe). */
function zovlResetZuruecksetzen() {
  if (zovlResetTimer) { clearTimeout(zovlResetTimer); zovlResetTimer = null; }
  zovlResetBtn.textContent = 'Einstellungen zurücksetzen';
  zovlResetBtn.classList.remove('zovl-reset-btn-warn');
}

zovlResetBtn.onclick = async () => {
  if (!zovlResetTimer) {
    zovlResetBtn.textContent = 'Wirklich zurücksetzen?';
    zovlResetBtn.classList.add('zovl-reset-btn-warn');
    zovlResetTimer = setTimeout(zovlResetZuruecksetzen, 4000);
    return;
  }
  // Zweiter Klick innerhalb der 4 Sekunden: Timer selbst loeschen (nicht ueber
  // zovlResetZuruecksetzen(), das wuerde auch Label/Klasse sofort zuruecksetzen, waehrend
  // der Schreibzugriff noch laeuft -- Button bleibt im Warn-Zustand, bis Erfolg/Fehler feststeht).
  clearTimeout(zovlResetTimer);
  zovlResetTimer = null;
  zovlResetFehlerEl.hidden = true;
  const ok = await Config.speichern(Geraete.aktiveDid, Config.defaultWidgetConfig());
  if (ok) { window.location.reload(); return; }
  zovlResetFehlerEl.hidden = false;
  zovlResetZuruecksetzen();
};

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
  // #termineOvl (F5, WIDGET_FEATURE_PLAN.md) ergaenzt: liegt als eigenes Overlay ebenfalls
  // innerhalb von .stage (siehe index.html), ohne diesen Eintrag faengt setPointerCapture()
  // jeden Klick/Checkbox-Toggle im Termine-Modal als Kartendrag/Raumklick ab, bevor dessen
  // eigene Handler ueberhaupt feuern -- gleiches Prinzip wie bei #zahnradOvl.
  const aufBedienung = t => !!(t && t.closest && (t.closest('.zoom') || t.closest('#devName')
    || t.closest('#zahnradBtn') || t.closest('#zahnradOvl') || t.closest('#termineOvl')));
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

/** Panel-Instanzen fuer die aktuell sichtbaren Panels (PanelRegistry.aktive(), also
 * config.widget.panels.<id>.sichtbar + Roboter-Typ) aufbauen. Ausgelagert aus ladeGeraet()
 * (Etappe E2d), damit die Panel-Sichtbarkeit-Toggles im Einstellungs-Overlay live neu
 * aufbauen koennen, ohne den kompletten Geraete-Ladevorgang (Karte, Subscriptions usw.) zu
 * wiederholen. Ruft panelsAbbauen() NICHT selbst auf -- der Aufrufer muss vorher abbauen
 * (ladeGeraet() tut das schon ganz am Anfang, der Panel-Toggle-Handler ruft es selbst auf).
 *
 * Reset-first (Bug-Fix nach E2e-Live-Test, WIDGET_SESSION_STATUS.md): die Panel-Container
 * sind statisches HTML ohne "hidden" im Default. Ein reines Ueberspringen der inaktiven
 * Panels (frueherer Stand) liess deren Container beim ALLERERSTEN Aufbau (leeres
 * aktivePanels, also Widget-Start/Geraete-Wechsel/?cfg=-Merge) sichtbar, aber ohne Inhalt --
 * init()/render() lief ja nie fuer sie. panelsAbbauen() haette sie nur versteckt, wenn vorher
 * schon eine Instanz existierte. Deshalb hier vor dem Aufbau ALLE toggle-baren Container
 * (PanelRegistry.alle minus kopf/fehler, die nie ausblendbar sind und kein hidden im Default
 * tragen) hart auf hidden=true setzen, danach nur die tatsaechlich aktiven wieder sichtbar
 * machen -- kein Restzustand aus einer vorherigen Session moeglich, jeder Container ist nach
 * dieser Funktion eindeutig hidden=true oder hidden=false. */
async function baueAktivePanels(config, did, typ) {
  for (const { id } of PanelRegistry.alle) {
    if (id === 'kopf' || id === 'fehler') continue;
    const el = document.getElementById('panel-' + id);
    if (el) el.hidden = true;
  }
  for (const { id, klasse } of PanelRegistry.aktive(config, typ)) {
    const el = document.getElementById('panel-' + id);
    if (el) el.hidden = false;
    const panel = new klasse(id, el, config);
    aktivePanels.push(panel);
    panel.zeige();
    await panel.init(did);
  }
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
  document.title = 'Map – ' + (geraet ? geraet.name : '?');

  const config = await Config.laden(did);
  aktiveWidgetConfig = config;
  // Etappe E2e: ?cfg=-Delta NACH dem Laden der Adapter-Config, aber VOR jeder Anwendung
  // (Zeilen unten) mergen -- config/aktiveWidgetConfig sind dieselbe Referenz, alles danach
  // (kartenDrehung, initAussehenSektion(), initPanelsSektion(), baueAktivePanels()) liest
  // die gemergten Werte automatisch mit, ohne dass eine dieser Stellen ?cfg= kennen muss.
  // schreibeLayout()/Config.speichern() laufen hier bewusst nicht -- rein im Speicher.
  const urlCfgDelta = leseUrlCfgDelta();
  if (urlCfgDelta) wendeCfgDeltaAn(aktiveWidgetConfig, urlCfgDelta);
  kartenDrehung = (config.layout && Number(config.layout.drehung)) || 0;
  // data-leiste war seit Etappe A deklariert, aber nie aktiv gesetzt (WIDGET_SESSION_STATUS.md
  // E2b-Analyse) -- ab hier steuert es Sidebar-Ausrichtung UND die Seite des Einstellungs-
  // Overlays (layout.css :root[data-leiste="links"] .zovl). Pro Geraet neu gesetzt, falls
  // Configs zwischen Geraeten abweichen.
  document.documentElement.dataset.leiste = (config.layout && config.layout.leiste) || 'rechts';
  initAussehenSektion(config); // E2c: setzt u.a. --ui aus config.layout.groesse
  initPanelsSektion(config); // E2d: Panel-Sichtbarkeit-Toggles auf den Stand DIESES Geraets
  // renderGeraeteAuswahl() erst NACH initAussehenSektion(): sie loest
  // aktualisiereOverlayRaender() aus, das den --ui-Wert DIESES Geraets schon braucht (sonst
  // rechnet der erste Aufruf nach einem Geraete-Wechsel noch mit dem alten --ui).
  renderGeraeteAuswahl(geraet);

  await baueAktivePanels(config, did, geraet && geraet.typ);

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

    // F2: vor dem ersten ladeGeraet()-Aufruf abschliessen, siehe i18n.js-Kommentarkopf --
    // Panels ab F3 rufen t() aus render()/init() heraus auf, das laeuft immer erst danach.
    await I18n.laden();
    // F3: baut die Zahnrad-Panels-Liste inkl. Sub-Toggles -- nutzt t(), muss deshalb
    // ebenfalls erst nach I18n.laden() laufen, spaetestens vor initPanelsSektion()
    // (in ladeGeraet(), noch weiter unten in dieser Sequenz).
    baueZovlPanelsListe();

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
