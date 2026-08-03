/*
 * i18n.js — Widget-eigene Text-Uebersetzung (F2, WIDGET_FEATURE_PLAN.md).
 *
 * Eigener, komplett getrennter Mechanismus von der Adapter-i18n (lib/i18n/*.json, uebersetzt
 * State-Namen/common.states) — hier geht es um Texte, die NUR im Widget selbst vorkommen
 * (Panel-Ueberschriften, Auswahllisten, Button-Beschriftungen usw.), siehe
 * DevScripts/DEV-README.md Abschnitt "State-Wert-Uebersetzung" fuer die Abgrenzung.
 *
 * Sprachdateien liegen unter www/i18n/<sprache>.json (flache Key->Text-Tabelle, ein File pro
 * Sprache). Sprache kommt aus dem ioBroker-Systemobjekt `system.config` (Feld
 * `common.language`) — KEINE State, siehe Verifikation in WIDGET_SESSION_STATUS.md
 * "Verifikation vor Feature-Ausbau": `Daten.getObject('system.config')` ist der einzige
 * funktionierende Weg, `Daten.getState('system.config.common.language')` liefert nie einen
 * Wert. Aendert sich praktisch nie zur Laufzeit -> einmaliges Auslesen beim Start reicht,
 * kein Subscribe noetig (anders als Config.laden()/Geraete.starten()).
 *
 * Bare globale Funktion t(key) statt eines I18n.t(key)-Aufrufs, analog zum bereits
 * bestehenden bare-global uiIcon()-Helper (panel.js) — kuerzere Aufrufe in den kommenden
 * Panel-Umstellungen (F3, F6-F9), gleiches Prinzip wie dort schon etabliert.
 *
 * WICHTIG fuer die kommenden Panel-Umstellungen: t() liefert erst ab dem Abschluss von
 * laden() (in main.js awaited, VOR dem ersten ladeGeraet()-Aufruf) sinnvolle Werte. Panels
 * duerfen uebersetzte Auswahllisten (aehnlich CLEAN_MODES in reinigung.js) deshalb NICHT als
 * Modul-Top-Level-Konstante mit t() befuellen (das Skript wird synchron beim Laden geparst,
 * lange bevor laden() fertig ist) -- t()-Aufrufe muessen in render()/init() oder einer
 * anderen erst zur Laufzeit aufgerufenen Methode stehen.
 */

/* global Daten */

const I18n = (() => {
  let tabellen = {}; // Sprachkuerzel -> { key: text }
  let sprache = 'en';

  /** Eine Sprachdatei laden, still auf {} zurueckfallen wenn sie fehlt/kaputt ist -- ein
   * einzelnes fehlendes/fehlerhaftes Sprachfile darf das Widget nicht am Start hindern. */
  async function ladeSprachdatei(kuerzel) {
    try {
      const antwort = await fetch(`i18n/${kuerzel}.json`);
      if (!antwort.ok) return {};
      return await antwort.json();
    } catch (e) {
      console.warn('[i18n] Sprachdatei konnte nicht geladen werden:', kuerzel, e);
      return {};
    }
  }

  /** Systemsprache + Sprachdateien laden. Muss vor dem ersten ladeGeraet()-Aufruf
   * abgeschlossen sein (siehe main.js Start-IIFE) -- vorher liefert t() nur Fallback-Werte. */
  async function laden() {
    const [en, de] = await Promise.all([ladeSprachdatei('en'), ladeSprachdatei('de')]);
    tabellen = { en, de };
    const sysConfig = await Daten.getObject('system.config');
    const gewuenscht = (sysConfig && sysConfig.common && sysConfig.common.language) || 'en';
    // Nur uebernehmen, wenn dafuer auch tatsaechlich eine Sprachdatei existiert (aktuell
    // nur en/de, siehe Kommentarkopf) -- sonst bleibt sprache beim sicheren 'en'-Default.
    sprache = tabellen[gewuenscht] ? gewuenscht : 'en';
  }

  /** Uebersetzten Text zu key in der aktuellen Sprache. Fallback-Kette: aktuelle Sprache ->
   * Englisch -> der Key selbst (nie undefined/Crash, auch nicht vor Abschluss von laden()). */
  function t(key) {
    const wert = (tabellen[sprache] || {})[key];
    if (wert != null) return wert;
    const enWert = (tabellen.en || {})[key];
    if (enWert != null) return enWert;
    return key;
  }

  return { laden, t, get sprache() { return sprache; } };
})();

function t(key) { return I18n.t(key); }
