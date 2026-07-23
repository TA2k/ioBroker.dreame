/*
 * Wartungs-Panel: Verschleiss-Anzeige (Hauptbuerste, Seitenbuerste, Filter, Sensoren) mit
 * Reset-Buttons, dazu optional eine Saugbeutel-Statuszeile.
 * ========================================================================
 * Herkunft: Namen/Icons/Balkendarstellung wie www/legacy.html Bereich "Verbrauchsmaterial,
 * Meldungen, Statistik" (dortiges VERBRAUCH-Array), portiert aus RicardoHipps Fork
 *   https://github.com/RicardoHipp/ioBroker.dreame
 *
 * Aus www/legacy.html hierher uebernommen (WIDGET_UMBAU_PLAN.md Etappe C, Commit C2) — aber
 * NICHT die volle VERBRAUCH-Tabelle (10 Zeilen): der Plan-Text fuer C2 zaehlt nur vier
 * Verschleissteile auf ("Hauptbürste, Seitenbürste, Filter, Sensoren-Verschleiß") plus
 * optional Saugbeutel. Die uebrigen sechs legacy-Zeilen (Wischtuch, Reinigungsmittel,
 * Silberionen, Abstreifer, Tankfilter, Räder) haben weder im Plan-Text einen Platz noch einen
 * Reset-Trigger im Adapter (trigger.js, Commit B3, kennt nur reset-main-brush/-side-brush/
 * -filter/-sensor) — bleiben unuebernommen, bis ein spaeterer Plan-Schritt sie vorsieht.
 *
 * Reset-Buttons pro Zeile sind KEINE Extraktion — Ricardos Original zeigte den Verschleiss nur
 * an, ohne Aktion. Neu gebaut laut WIDGET_UMBAU_PLAN.md Etappe C, Commit C2 ("Reset-Buttons
 * für jede Zeile, senden über bestehende Adapter-Trigger").
 */

/* global Trigger, Panel, uiIcon */

// ===== Verschleiss-Zeilen: Objekt/Name/Icon/Reset-Trigger. Objekt-Namen und Prozent-Semantik
// (0-100, geringerer Wert = staerker verschlissen) aus lib/specs/consumables.js verifiziert. =====
const VERSCHLEISS = [
  { obj: 'main-brush-left', name: 'Hauptbürste', ikon: 'hauptbuerste', reset: did => Trigger.resetMainBrush(did) },
  { obj: 'side-brush-left', name: 'Seitenbürste', ikon: 'seitenbuerste', reset: did => Trigger.resetSideBrush(did) },
  { obj: 'filter-left', name: 'Filter', ikon: 'filter', reset: did => Trigger.resetFilter(did) },
  { obj: 'sensor-dirty-left', name: 'Sensoren', ikon: 'sensoren', reset: did => Trigger.resetSensor(did) },
];

// Saugbeutel-Status (lib/specs/station.js dust-bag-status, SIID 27/PIID 3): 0=installiert,
// 1=nicht installiert, 2=pruefen. Texte 1:1 aus lib/i18n/de.json common.* uebernommen (nicht neu
// formuliert — gleiche Begruendung wie FEHLER_DE in kopf.js: sonst driften Adapter- und
// Widget-Text auseinander). Kein Reset-Trigger vorgesehen: der Beutel wird gewechselt, nicht
// zurueckgesetzt — anders als bei den vier Verschleissteilen oben gibt es dafuer keine Aktion.
const SAUGBEUTEL_TEXT = { 0: 'Installiert', 1: 'Nicht installiert', 2: 'Überprüfen' };
const SAUGBEUTEL_OBJ = 'dust-bag-status';

class WartungPanel extends Panel {
  constructor(id, container) {
    super(id, container);
    this.werte = {}; // obj -> letzter Wert (fehlender Eintrag = noch nichts empfangen -> Zeile bleibt aus)
    this._idZuObj = {};
  }

  benoetigteStates(did) {
    const pfad = obj => `dreame.0.${did}.status.${obj}`;
    this._idZuObj = {};
    for (const v of VERSCHLEISS) this._idZuObj[pfad(v.obj)] = v.obj;
    this._idZuObj[pfad(SAUGBEUTEL_OBJ)] = SAUGBEUTEL_OBJ;
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
    const liste = document.getElementById('wartungListe');
    const titel = document.getElementById('wartungTitel');
    if (!liste || !titel) return;

    const zeilen = VERSCHLEISS.filter(v => this.werte[v.obj] != null).map(v => {
      const p = Math.max(0, Math.min(100, Number(this.werte[v.obj]) || 0));
      const st = p <= 10 ? 'bad' : (p <= 20 ? 'warn' : '');
      return `<div class="vrow ${st}">${uiIcon(v.ikon, 15)}<span class="vname">${v.name}</span>`
        + `<span class="vbar"><i style="width:${p}%"></i></span>`
        + `<span class="vpct">${p} %</span>`
        + `<button class="vreset" type="button" data-obj="${v.obj}" title="${v.name} zurücksetzen" aria-label="${v.name} zurücksetzen">${uiIcon('zoomReset', 14)}</button>`
        + `</div>`;
    });

    const beutel = this.werte[SAUGBEUTEL_OBJ];
    if (beutel != null) {
      const n = Number(beutel);
      const st = n === 1 ? 'bad' : (n === 2 ? 'warn' : '');
      zeilen.push(`<div class="vrow ${st}">${uiIcon('staubbeutel', 15)}<span class="vname">Saugbeutel</span>`
        + `<span class="vstatus">${SAUGBEUTEL_TEXT[n] || ('Status ' + n)}</span></div>`);
    }

    liste.innerHTML = zeilen.join('');
    titel.hidden = !zeilen.length;
    for (const btn of liste.querySelectorAll('button[data-obj]')) {
      const eintrag = VERSCHLEISS.find(v => v.obj === btn.dataset.obj);
      if (eintrag) btn.onclick = () => eintrag.reset(this.did);
    }
  }
}
