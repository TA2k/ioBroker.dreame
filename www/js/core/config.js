/*
 * config.js — Widget-Config lesen/schreiben/migrieren.
 * Speicherort: dreame.0.<did>.config.widget (type: string, role: json), pro Roboter
 * getrennt. State wird adapterseitig garantiert angelegt (main.js createVacuumRemotes()).
 * Lag bis zum Umzug unter <did>.info.widgetConfig - Migration auf den neuen Pfad laeuft
 * einmalig adapterseitig, hier im Widget spielt nur noch der neue Pfad eine Rolle. Ablauf
 * beim Oeffnen, Migration bei Version-Sprung: WIDGET_ARCHITEKTUR.md Abschnitt 10.
 */

/* global Daten, PanelRegistry */

const WIDGET_CONFIG_VERSION = 5;
const WIDGET_ADAPTER_VERSION = '0.4.0'; // Zielversion dieses Umbaus, siehe WIDGET_UMBAU_PLAN.md Kopf

function defaultWidgetConfig() {
  // Panel-IDs kommen aus PanelRegistry statt aus einer hier gepflegten Liste (bis
  // configVersion 2 noch hardcodiert) - main.js registriert alle Panel-Klassen SYNCHRON
  // beim Skript-Start, bevor die Start-IIFE (und damit Config.laden()) ueberhaupt laeuft,
  // siehe WIDGET_SESSION_STATUS.md Etappe E2a fuer die Ladereihenfolge-Analyse. Jedes neue
  // Panel bekommt seinen Config-Eintrag damit automatisch, ohne diese Datei anzufassen.
  const panels = {};
  for (const { id } of PanelRegistry.alle) panels[id] = { sichtbar: true, versteckt: [] };
  return {
    configVersion: WIDGET_CONFIG_VERSION,
    adapterVersion: WIDGET_ADAPTER_VERSION,
    panels,
    // Namespace hiess bis configVersion 1 "aussehen" - umbenannt im Zuge der Etappe-E-
    // Modularitaets-Entscheidung (Namespaces layout/panels/einstellungen). Siehe
    // Migrationsschritt in migriere() weiter unten.
    layout: {
      farben: 'auto',
      hintergrund: 'gefuellt',
      leiste: 'rechts',
      drehung: 0,
      // Ab configVersion 3 (Etappe E2): Zahnrad-Overlay-Felder aus WIDGET_UMBAU_PLAN.md
      // Etappe E2. theme/color loesen "farben" perspektivisch ab, bleiben aber vorerst
      // parallel bestehen (farben wird von E2-UI-Code nicht mehr geschrieben, aber noch
      // nicht entfernt - kein Scope fuer E2a).
      // Ab configVersion 4 (Etappe E2c): theme ist jetzt ein String ('hell'/'dunkel'/
      // 'hauptfarbe'/'custom') statt der urspruenglichen Zahl 0-3 aus E2a - siehe
      // migriere() fuer die Abbildung alter Zahlenwerte. color/customBg/customPanel/
      // customLine/customText/customMuted (E2a) sind damit ebenfalls abgeloest durch
      // hauptfarbe bzw. custom.* unten, bleiben aber unveraendert stehen (gleiche Politik
      // wie bei "farben" oben - kein Scope fuer E2c, sie aufzuraeumen).
      theme: 'dunkel', // 'hell' | 'dunkel' | 'hauptfarbe' | 'custom'
      color: '', // ALT (E2a), abgeloest durch hauptfarbe
      transparent: false, // Hintergrund transparent, orthogonal zu theme
      width: 275, // Seitenleisten-Breite in px, Default = bisheriger --leiste-breite-Wert (theme.css)
      customBg: '', // ALT (E2a), abgeloest durch custom.hintergrund
      customPanel: '', // ALT (E2a), abgeloest durch custom.menue
      customLine: '', // ALT (E2a), abgeloest durch custom.rahmen
      customText: '', // ALT (E2a), abgeloest durch custom.schrift
      customMuted: '', // ALT (E2a), kein Nachfolger in E2c (--muted wird aus custom.schrift abgeleitet)
      // E2c: Basis-Hintergrundfarbe fuer theme="hauptfarbe" - Menue/Rahmen werden per
      // color-mix() daraus abgeleitet, Schrift per Kontrast-Regel (main.js waehleSchriftFarbe()).
      hauptfarbe: '#eef2f8',
      // E2c: vier frei waehlbare Farben fuer theme="custom", keine Ableitung, kein
      // automatischer Lesbarkeits-Schutz (bewusste Nutzer-Freiheit). Defaults = heutiger
      // Hell-Modus (theme.css :root[data-farben="hell"]), damit der Nutzer vom vertrauten
      // Zustand aus startet.
      custom: {
        hintergrund: '#eef2f8',
        menue: '#ffffff',
        // Ab configVersion 5 (Etappe E2c, Nachtrag 1): fuenfte Farbe fuer Buttons, getrennt
        // von "menue" -- Default = Hell-Modus-panel2, konsistent mit --knoepfe-Default in
        // theme.css (siehe migriere() fuer den v4->v5-Merge, der das bei bestehenden
        // v4-Configs nachtraeglich ergaenzt).
        knoepfe: '#f4f7fc',
        rahmen: '#dbe3ef',
        schrift: '#1a2436',
      },
      // E2c: UI-Zoom (--ui), vorher nie aus Config gelesen/geschrieben (siehe
      // WIDGET_SESSION_STATUS.md E2c-Struktur-Analyse). 1 = unveraendert, Slider 0.7-1.5.
      groesse: 1,
    },
  };
}

const Config = (() => {
  const konfigId = did => `dreame.0.${did}.config.widget`;

  /** Panel-Merge auf Feld-Ebene (nicht nur pro Panel-ID) - seit configVersion 3 hat jedes
   * Panel mehrere Felder (sichtbar, versteckt). Ein flacher Merge wie
   * { ...std.panels, ...gespeichert.panels } wuerde bei einem vom Nutzer bereits
   * individualisierten Panel (z.B. sichtbar:false) das komplette Sub-Objekt ersetzen und
   * damit das neue versteckt-Default verlieren - daher pro ID: Default-Panel ueberschrieben
   * von den tatsaechlich gespeicherten Feldern. Ausgelagert, weil das SOWOHL beim
   * Versionssprung ALS AUCH beim gleichversionierten Fast-Path unten noetig ist (siehe
   * Kommentar dort). */
  function mergePanels(std, gespeichert) {
    const alleIds = new Set([...Object.keys(std.panels), ...Object.keys((gespeichert && gespeichert.panels) || {})]);
    const panels = {};
    for (const id of alleIds) {
      panels[id] = { ...(std.panels[id] || { sichtbar: true, versteckt: [] }), ...(((gespeichert && gespeichert.panels) || {})[id]) };
    }
    return panels;
  }

  /** Gespeicherte Config gegen den aktuellen Stand auffuellen (neue Panels/Felder
   * bekommen ihren Default, vorhandene Nutzer-Werte bleiben erhalten). */
  function migriere(gespeichert) {
    const std = defaultWidgetConfig();
    if (!gespeichert || typeof gespeichert !== 'object') return std;
    if (gespeichert.configVersion > WIDGET_CONFIG_VERSION) {
      console.warn('[config] widgetConfig-Version', gespeichert.configVersion,
        'ist neuer als dieses Widget (', WIDGET_CONFIG_VERSION, ') — wird unveraendert genutzt.');
      return gespeichert;
    }
    if (gespeichert.configVersion === WIDGET_CONFIG_VERSION) {
      // Neue Panel-Klassen (main.js PanelRegistry.registriere()) bekommen ihren
      // Config-Eintrag automatisch, OHNE configVersion-Bump (Kommentar in
      // defaultWidgetConfig() oben) -- das gilt aber nur, wenn dieser Merge auch dann
      // laeuft, wenn die Version schon uebereinstimmt. Live-Test-Fund (F5): eine VOR der
      // Termine-Registrierung gespeicherte v5-Config kam hier vorher unveraendert durch
      // (frueher: `if (configVersion === WIDGET_CONFIG_VERSION) return gespeichert`),
      // aktiveWidgetConfig.panels.termine blieb dadurch undefined -- der Sichtbarkeit-
      // Toggle im Zahnrad (main.js `aktiveWidgetConfig.panels[id].sichtbar = ...`) griff
      // ins Leere (TypeError auf undefined, Handler brach ab, Checkbox ohne Wirkung).
      return { ...gespeichert, panels: mergePanels(std, gespeichert) };
    }
    // v1->v2: Namespace "aussehen" in "layout" umbenannt (Etappe E). Alten Wert 1:1
    // uebernehmen, BEVOR unten mit dem Default gemerged wird - sonst wuerden bestehende
    // Nutzerwerte (z.B. drehung, hintergrund) stillschweigend auf Default zurueckfallen,
    // weil ab jetzt nur noch "layout" gelesen wird.
    const _altesLayout = { ...(gespeichert.layout || gespeichert.aussehen) };
    // v3->v4 (Etappe E2c): theme war in E2a eine Zahl (0=hell,1=dunkel,2=main-Farbe,
    // 3=custom), ist jetzt ein String. Alten Zahlenwert 1:1 abbilden, BEVOR unten
    // gemerged wird - sonst wuerde die Zahl unveraendert in den neuen String-Namensraum
    // durchgereicht (main.js erwartet nur noch Strings) statt auf den neuen Default
    // zurueckzufallen oder korrekt konvertiert zu werden.
    if (typeof _altesLayout.theme === 'number') {
      const THEME_ZAHL_ZU_STRING = { 0: 'hell', 1: 'dunkel', 2: 'hauptfarbe', 3: 'custom' };
      _altesLayout.theme = THEME_ZAHL_ZU_STRING[_altesLayout.theme] || 'dunkel';
    }
    // v4->v5 (Etappe E2c, Nachtrag 1): custom bekommt eine fuenfte Farbe (knoepfe). Ein
    // flacher Merge (layout: {...std.layout, ..._altesLayout}) wuerde ein bereits
    // gespeichertes v4-custom-Objekt (ohne knoepfe) unveraendert uebernehmen und dabei den
    // neuen Default verlieren -- daher wie beim Panel-Merge unten explizit auf Feld-Ebene
    // gemerged, kein Datenverlust bei den bereits vorhandenen vier Farben.
    if (_altesLayout.custom) {
      _altesLayout.custom = { ...std.layout.custom, ..._altesLayout.custom };
    }
    const gespeichertOhneAussehen = { ...gespeichert };
    delete gespeichertOhneAussehen.aussehen;
    return {
      ...std,
      ...gespeichertOhneAussehen,
      panels: mergePanels(std, gespeichert),
      layout: { ...std.layout, ...(_altesLayout || {}) },
      configVersion: WIDGET_CONFIG_VERSION,
      adapterVersion: WIDGET_ADAPTER_VERSION,
    };
  }

  async function laden(did) {
    const id = konfigId(did);
    const roh = await Daten.getState(id);
    if (roh == null) {
      const frisch = defaultWidgetConfig();
      await speichern(did, frisch);
      return frisch;
    }
    let geparst = null;
    try { geparst = JSON.parse(roh); }
    catch (e) { console.warn('[config] widgetConfig ist kein gueltiges JSON, nutze Default:', e); }
    const migriert = migriere(geparst);
    if (JSON.stringify(migriert) !== roh) await speichern(did, migriert);
    return migriert;
  }

  async function speichern(did, config) {
    const ok = await Daten.setState(konfigId(did), JSON.stringify(config));
    if (!ok) {
      console.warn('[config] widgetConfig konnte nicht geschrieben werden fuer', did,
        '— evtl. legt der Adapter das State-Objekt noch nicht an, siehe Kommentarkopf dieser Datei.');
    }
    return ok;
  }

  return { laden, speichern, defaultWidgetConfig, konfigId };
})();
