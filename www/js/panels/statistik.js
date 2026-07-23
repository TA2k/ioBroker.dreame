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

/* global Panel */

// ===== Statistik-Zeilen: Objekt/Name/Formatierung. State-Namen und Einheiten (min, m²) aus
// lib/specs/statistics.js verifiziert. first-cleaning-date liefert einen Unix-Zeitstempel in
// Sekunden (wie im Original: new Date(v*1000)). =====
const STATISTIK = [
  { obj: 'cleaning-count', name: 'Reinigungen', fmt: v => String(v) },
  { obj: 'total-cleaned-area', name: 'Fläche', fmt: v => v.toLocaleString('de-DE') + ' m²' },
  { obj: 'total-cleaning-time', name: 'Dauer', fmt: v => Math.round(v / 60).toLocaleString('de-DE') + ' h' },
  { obj: 'first-cleaning-date', name: 'Seit', fmt: v => new Date(v * 1000).toLocaleDateString('de-DE') },
];

class StatistikPanel extends Panel {
  constructor(id, container) {
    super(id, container);
    this.werte = {}; // obj -> letzter Wert (fehlender Eintrag = noch nichts empfangen -> Zeile bleibt aus)
    this._idZuObj = {};
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

  render() {
    if (!this.container) return;
    const liste = document.getElementById('statistikListe');
    const titel = document.getElementById('statistikTitel');
    if (!liste || !titel) return;

    const zeilen = STATISTIK.filter(s => this.werte[s.obj] != null).map(s => {
      const wert = s.fmt(Number(this.werte[s.obj]));
      return `<div><span>${s.name}</span><span>${wert}</span></div>`;
    });

    liste.innerHTML = zeilen.join('');
    titel.hidden = !zeilen.length;
  }
}
