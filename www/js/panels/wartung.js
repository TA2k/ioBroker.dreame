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

/* global Trigger, Panel, uiIcon, t */

// ===== Verschleiss-Zeilen: Objekt/Name/Icon/Reset-Trigger. Objekt-Namen und Prozent-Semantik
// (0-100, geringerer Wert = staerker verschlissen) aus lib/specs/consumables.js verifiziert.
// name -> nameKey (F7a, WIDGET_FEATURE_PLAN.md): i18n-Key statt fester deutscher String,
// gleiches Muster wie CLEAN_MODES/CLEAN_ROUTES in reinigung.js (F3). =====
const VERSCHLEISS = [
  { obj: 'main-brush-left', nameKey: 'panel.wartung.hauptbuerste.label', ikon: 'hauptbuerste', reset: did => Trigger.resetMainBrush(did) },
  { obj: 'side-brush-left', nameKey: 'panel.wartung.seitenbuerste.label', ikon: 'seitenbuerste', reset: did => Trigger.resetSideBrush(did) },
  { obj: 'filter-left', nameKey: 'panel.wartung.filter.label', ikon: 'filter', reset: did => Trigger.resetFilter(did) },
  { obj: 'sensor-dirty-left', nameKey: 'panel.wartung.sensoren.label', ikon: 'sensoren', reset: did => Trigger.resetSensor(did) },
];

// Saugbeutel-Status (lib/specs/station.js dust-bag-status, SIID 27/PIID 3): 0=installiert,
// 1=nicht installiert, 2=pruefen. Texte waren 1:1 aus lib/i18n/de.json common.* uebernommen
// (Begruendung wie urspruenglich bei FEHLER_DE in fehler.js, seit F9 selbst FEHLER_TEXT_KEY:
// sonst driften Adapter- und Widget-Text auseinander) --
// jetzt eigene panel.wartung.saugbeutel.*-Keys (F7a), EN-Uebersetzung dafuer eigenstaendig,
// keine harte Kopplung mehr an die Adapter-i18n-Tabelle. Kein Reset-Trigger vorgesehen: der
// Beutel wird gewechselt, nicht zurueckgesetzt — anders als bei den vier Verschleissteilen
// oben gibt es dafuer keine Aktion.
const SAUGBEUTEL_TEXT_KEY = { 0: 'panel.wartung.saugbeutel.installiert', 1: 'panel.wartung.saugbeutel.nicht-installiert', 2: 'panel.wartung.saugbeutel.ueberpruefen' };
const SAUGBEUTEL_OBJ = 'dust-bag-status';

class WartungPanel extends Panel {
  // F7a (WIDGET_FEATURE_PLAN.md): jede Verschleiss-Zeile + die Saugbeutel-Zeile einzeln
  // ausblendbar, gleiches F3-Blueprint wie bei Reinigung/Station.
  static versteckbareFelder = [
    { id: 'main-brush-left', labelKey: 'panel.wartung.hauptbuerste.label' },
    { id: 'side-brush-left', labelKey: 'panel.wartung.seitenbuerste.label' },
    { id: 'filter-left', labelKey: 'panel.wartung.filter.label' },
    { id: 'sensor-dirty-left', labelKey: 'panel.wartung.sensoren.label' },
    { id: SAUGBEUTEL_OBJ, labelKey: 'panel.wartung.saugbeutel.label' },
  ];

  constructor(id, container, config) {
    super(id, container, config);
    this.werte = {}; // obj -> letzter Wert (fehlender Eintrag = noch nichts empfangen -> Zeile bleibt aus)
    this._idZuObj = {};
    this._statischeTexteGesetzt = false;
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

  _renderStatischeTexte() {
    if (this._statischeTexteGesetzt) return;
    this._statischeTexteGesetzt = true;
    const titel = document.getElementById('wartungTitel');
    if (titel) titel.textContent = t('panel.wartung.titel');
  }

  render() {
    if (!this.container) return;
    this._renderStatischeTexte();
    const liste = document.getElementById('wartungListe');
    const titel = document.getElementById('wartungTitel');
    if (!liste || !titel) return;

    const zeilen = VERSCHLEISS.filter(v => this.werte[v.obj] != null && !this.feldVersteckt(v.obj)).map(v => {
      const p = Math.max(0, Math.min(100, Number(this.werte[v.obj]) || 0));
      const st = p <= 10 ? 'bad' : (p <= 20 ? 'warn' : '');
      const name = t(v.nameKey);
      return `<div class="vrow ${st}">${uiIcon(v.ikon, 15)}<span class="vname">${name}</span>`
        + `<span class="vbar"><i style="width:${p}%"></i></span>`
        + `<span class="vpct">${p} %</span>`
        + `<button class="vreset" type="button" data-obj="${v.obj}" title="${t('panel.wartung.zuruecksetzen')}" aria-label="${name}: ${t('panel.wartung.zuruecksetzen')}">${uiIcon('zoomReset', 14)}</button>`
        + `</div>`;
    });

    const beutel = this.werte[SAUGBEUTEL_OBJ];
    if (beutel != null && !this.feldVersteckt(SAUGBEUTEL_OBJ)) {
      const n = Number(beutel);
      const st = n === 1 ? 'bad' : (n === 2 ? 'warn' : '');
      const beutelText = SAUGBEUTEL_TEXT_KEY[n] ? t(SAUGBEUTEL_TEXT_KEY[n]) : `${t('panel.wartung.saugbeutel.status-unbekannt')} ${n}`;
      zeilen.push(`<div class="vrow ${st}">${uiIcon('staubbeutel', 15)}<span class="vname">${t('panel.wartung.saugbeutel.label')}</span>`
        + `<span class="vstatus">${beutelText}</span></div>`);
    }

    liste.innerHTML = zeilen.join('');
    titel.hidden = !zeilen.length;
    for (const btn of liste.querySelectorAll('button[data-obj]')) {
      const eintrag = VERSCHLEISS.find(v => v.obj === btn.dataset.obj);
      if (eintrag) btn.onclick = () => eintrag.reset(this.did);
    }
  }
}
