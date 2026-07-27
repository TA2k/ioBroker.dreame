/*
 * config.js — Widget-Config lesen/schreiben/migrieren.
 * Speicherort: dreame.0.<did>.info.widgetConfig (type: string, role: json), pro Roboter
 * getrennt. Ablauf beim Oeffnen, Migration bei Version-Sprung: WIDGET_ARCHITEKTUR.md
 * Abschnitt 10.
 *
 * WICHTIG (siehe WIDGET_SESSION_STATUS.md): Etappe A hat nur dreame.0.info.devices als
 * neues Adapter-State-Objekt angelegt, kein <did>.info.widgetConfig. Ob Daten.setState()
 * auf ein noch nicht existierendes State-Objekt schreiben kann, haengt von der
 * Socket.io-Konfiguration des web-Adapters ab und ist hier NICHT verifiziert (kein Zugriff
 * auf eine laufende Instanz waehrend der Entwicklung). speichern() protokolliert eine
 * Warnung, wenn das Schreiben fehlschlaegt — Live-Test-Punkt B muss das pruefen.
 */

/* global Daten */

const WIDGET_CONFIG_VERSION = 2;
const WIDGET_ADAPTER_VERSION = '0.4.0'; // Zielversion dieses Umbaus, siehe WIDGET_UMBAU_PLAN.md Kopf

function defaultWidgetConfig() {
  return {
    configVersion: WIDGET_CONFIG_VERSION,
    adapterVersion: WIDGET_ADAPTER_VERSION,
    // Panel-Liste nach WIDGET_UMBAU_PLAN.md Etappe C/D (siehe auch Commit-B1-Notiz in
    // WIDGET_SESSION_STATUS.md zur Abweichung von der Beispiel-Liste in WIDGET_ARCHITEKTUR.md §9).
    panels: {
      kopf: { sichtbar: true },
      reinigung: { sichtbar: true },
      wartung: { sichtbar: true },
      statistik: { sichtbar: true },
      station: { sichtbar: true },
      fehler: { sichtbar: true },
      frischwasser: { sichtbar: true },
    },
    // Namespace hiess bis configVersion 1 "aussehen" - umbenannt im Zuge der Etappe-E-
    // Modularitaets-Entscheidung (Namespaces layout/panels/einstellungen). Siehe
    // Migrationsschritt in migriere() weiter unten.
    layout: {
      farben: 'auto',
      hintergrund: 'gefuellt',
      leiste: 'rechts',
      drehung: 0,
    },
  };
}

const Config = (() => {
  const konfigId = did => `dreame.0.${did}.info.widgetConfig`;

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
    return {
      ...std,
      ...gespeichertOhneAussehen,
      panels: { ...std.panels, ...(gespeichert.panels || {}) },
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
