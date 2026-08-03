/*
 * Statistik-Panel: Gesamt-Reinigungsstatistiken (Reinigungen, Flaeche, Dauer, Seit).
 * ========================================================================
 * Herkunft: Werte-Array (STATISTIK) aus www/legacy.html Bereich "Verbrauchsmaterial,
 * Meldungen, Statistik", portiert aus RicardoHipps Fork
 *   https://github.com/RicardoHipp/ioBroker.dreame
 *
 * Aus www/legacy.html hierher uebernommen (WIDGET_UMBAU_PLAN.md Etappe C, Commit C3) —
 * State-Namen/Formatierung 1:1 aus dem dortigen STATISTIK-Array, gegen lib/specs/
 * statistics.js verifiziert (SIID 12, PIID 1-4).
 *
 * Anders als im Original KEIN Dialog mehr (Ricardos openStatistik() oeffnete ein Overlay
 * ueber einen eigenen "Statistik"-Knopf, statistikZeilen() lieferte dafuer die Zeilen) —
 * laut WIDGET_UMBAU_PLAN.md Commit C3 "aus dem heutigen 'Statistik'-Menue ausgekoppelt,
 * jetzt eigenes Panel". Dauerhaft sichtbare Liste wie Wartungs-Panel (Commit C2), kein
 * Knopf/Overlay noetig — openPicker()/oeffneOvl() werden hier nicht gebraucht.
 */

/* global Panel, t, localeFuerZahlen */

// F7b (WIDGET_FEATURE_PLAN.md): toLocaleString()/toLocaleDateString() liefen bisher hart auf
// 'de-DE' -- ein EN-Nutzer sah trotz uebersetzter Zeilennamen weiterhin deutsch formatierte
// Zahlen/Datumsangaben (Tausenderpunkt statt -komma usw.). Jetzt an I18n.sprache gekoppelt
// (localeFuerZahlen(), core/i18n.js -- gemeinsam mit frischwasser.js genutzt, siehe dort).

// ===== Statistik-Zeilen: Objekt/Name/Formatierung. State-Namen und Einheiten (min, m²) aus
// lib/specs/statistics.js verifiziert. first-cleaning-date liefert einen Unix-Zeitstempel in
// Sekunden (wie im Original: new Date(v*1000)). name -> nameKey (F7b): i18n-Key statt festem
// deutschen String, gleiches Muster wie VERSCHLEISS in wartung.js (F7a). =====
const STATISTIK = [
  { obj: 'cleaning-count', nameKey: 'panel.statistik.reinigungen.label', fmt: v => String(v) },
  { obj: 'total-cleaned-area', nameKey: 'panel.statistik.flaeche.label', fmt: v => v.toLocaleString(localeFuerZahlen()) + ' m²' },
  { obj: 'total-cleaning-time', nameKey: 'panel.statistik.dauer.label', fmt: v => Math.round(v / 60).toLocaleString(localeFuerZahlen()) + ' h' },
  { obj: 'first-cleaning-date', nameKey: 'panel.statistik.seit.label', fmt: v => new Date(v * 1000).toLocaleDateString(localeFuerZahlen()) },
];

class StatistikPanel extends Panel {
  // F7b: jede Zeile einzeln ausblendbar, gleiches F3-Blueprint wie bei den vorigen Panels.
  static versteckbareFelder = STATISTIK.map(s => ({ id: s.obj, labelKey: s.nameKey }));

  constructor(id, container, config) {
    super(id, container, config);
    this.werte = {}; // obj -> letzter Wert (fehlender Eintrag = noch nichts empfangen -> Zeile bleibt aus)
    this._idZuObj = {};
    this._statischeTexteGesetzt = false;
  }

  benoetigteStates(did) {
    const pfad = obj => `dreame.0.${did}.status.${obj}`;
    this._idZuObj = {};
    for (const s of STATISTIK) this._idZuObj[pfad(s.obj)] = s.obj;
    return Object.keys(this._idZuObj);
  }

  neueDaten(stateId, wert) {
    const obj = this._idZuObj[stateId];
    if (!obj) return;
    this.werte[obj] = wert;
    this.render();
  }

  _renderStatischeTexte() {
    if (this._statischeTexteGesetzt) return;
    this._statischeTexteGesetzt = true;
    const titel = document.getElementById('statistikTitel');
    if (titel) titel.textContent = t('panel.statistik.titel');
  }

  render() {
    if (!this.container) return;
    this._renderStatischeTexte();
    const liste = document.getElementById('statistikListe');
    const titel = document.getElementById('statistikTitel');
    if (!liste || !titel) return;

    const zeilen = STATISTIK.filter(s => this.werte[s.obj] != null && !this.feldVersteckt(s.obj)).map(s => {
      const wert = s.fmt(Number(this.werte[s.obj]));
      return `<div><span>${t(s.nameKey)}</span><span>${wert}</span></div>`;
    });

    liste.innerHTML = zeilen.join('');
    titel.hidden = !zeilen.length;
  }
}
