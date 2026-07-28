/*
 * config.js — Widget-Config lesen/schreiben/migrieren.
 * Speicherort: dreame.0.<did>.config.widget (type: string, role: json), pro Roboter
 * getrennt. State wird adapterseitig garantiert angelegt (main.js createVacuumRemotes()).
 * Lag bis zum Umzug unter <did>.info.widgetConfig - Migration auf den neuen Pfad laeuft
 * einmalig adapterseitig, hier im Widget spielt nur noch der neue Pfad eine Rolle. Ablauf
 * beim Oeffnen, Migration bei Version-Sprung: WIDGET_ARCHITEKTUR.md Abschnitt 10.
 */

/* global Daten, PanelRegistry */

const WIDGET_CONFIG_VERSION = 3;
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
      theme: 1, // 0=hell, 1=dunkel, 2=main-Farbe, 3=custom
      color: '', // Basis-Farbe fuer theme=2
      transparent: false, // Hintergrund transparent, orthogonal zu theme
      width: 275, // Seitenleisten-Breite in px, Default = bisheriger --leiste-breite-Wert (theme.css)
      customBg: '',
      customPanel: '',
      customLine: '',
      customText: '',
      customMuted: '',
    },
  };
}

const Config = (() => {
  const konfigId = did => `dreame.0.${did}.config.widget`;

  /** Gespeicherte Config gegen den aktuellen Stand auffuellen (neue Panels/Felder
   * bekommen ihren Default, vorhandene Nutzer-Werte bleiben erhalten). */
  function migriere(gespeichert) {
    const std = defaultWidgetConfig();
    if (!gespeichert || typeof gespeichert !== 'object') return std;
    if (gespeichert.configVersion === WIDGET_CONFIG_VERSION) return gespeichert;
    if (gespeichert.configVersion > WIDGET_CONFIG_VERSION) {
      console.warn('[config] widgetConfig-Version', gespeichert.configVersion,
        'ist neuer als dieses Widget (', WIDGET_CONFIG_VERSION, ') — wird unveraendert genutzt.');
      return gespeichert;
    }
    // v1->v2: Namespace "aussehen" in "layout" umbenannt (Etappe E). Alten Wert 1:1
    // uebernehmen, BEVOR unten mit dem Default gemerged wird - sonst wuerden bestehende
    // Nutzerwerte (z.B. drehung, hintergrund) stillschweigend auf Default zurueckfallen,
    // weil ab jetzt nur noch "layout" gelesen wird.
    const _altesLayout = gespeichert.layout || gespeichert.aussehen;
    const gespeichertOhneAussehen = { ...gespeichert };
    delete gespeichertOhneAussehen.aussehen;
    // Panel-Merge auf Feld-Ebene (nicht nur pro Panel-ID) - seit configVersion 3 hat jedes
    // Panel mehrere Felder (sichtbar, versteckt). Ein flacher Merge wie beim alten
    // { ...std.panels, ...gespeichert.panels } wuerde bei einem vom Nutzer bereits
    // individualisierten Panel (z.B. sichtbar:false) das komplette Sub-Objekt ersetzen und
    // damit das neue versteckt-Default verlieren - analog zum layout-Merge unten daher
    // pro ID: Default-Panel ueberschrieben von den tatsaechlich gespeicherten Feldern.
    const alleIds = new Set([...Object.keys(std.panels), ...Object.keys(gespeichert.panels || {})]);
    const panels = {};
    for (const id of alleIds) {
      panels[id] = { ...(std.panels[id] || { sichtbar: true, versteckt: [] }), ...((gespeichert.panels || {})[id]) };
    }
    return {
      ...std,
      ...gespeichertOhneAussehen,
      panels,
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
