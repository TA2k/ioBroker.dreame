/*
 * Station-Panel: Waschstations-Zustand + manuelle Aktionen (Entleeren, Waschen, Trocknen).
 * ========================================================================
 * Herkunft: browserseitiger Teil des Karten-Widgets aus RicardoHipps Fork
 *   https://github.com/RicardoHipp/ioBroker.dreame
 * Faehigkeits-/Zustandslogik 1:1 aus der Home-Assistant-Referenz uebernommen (siehe
 * Kommentare unten) — Ursprung:
 *   dreame-vacuum (Home Assistant Integration) von Tasshack
 *   https://github.com/Tasshack/dreame-vacuum — Copyright (c) 2022 Tasshack — MIT License
 *
 * MIT License — the above copyright notice and this permission notice shall be
 * included in all copies or substantial portions of the Software.
 * -----------------------------------------------------------------------------
 *
 * Aus www/legacy.html hierher uebernommen (WIDGET_UMBAU_PLAN.md Etappe C, Commit C4),
 * JS-Bereich "Station" (aktuell Zeilen 2152-2256, WIDGET_ARCHITEKTUR.md Tabelle 7 Zeile 10).
 * WASH/EMPTY_ACTIVE/ST-Konstanten NICHT neu deklariert — kopf.js (Commit C1) hat sie bereits
 * als globale Konstanten angelegt (Session-Status-Vorgabe fuer C4), hier nur referenziert.
 *
 * Bewusste Abweichung vom Original (David-Vorgabe vor diesem Commit): Ricardos
 * openStationMenu() sammelt alle verfuegbaren Aktionen in einem Options-Array und zeigt sie
 * in einem Auswahl-Overlay (openPicker(), gleiches generisches Overlay-System wie der
 * "Mopp wird gewaschen"-Bestaetigungsdialog beim Stop, siehe kopf.js-Kommentarkopf). Dieses
 * Overlay existiert im modularen Widget noch nicht (kommt erst Etappe D/E) — David hat vor
 * diesem Commit ausdruecklich gesagt, KEINE Bestaetigungsdialoge fuer C4 zu bauen. Die
 * Aktionen erscheinen deshalb als direkte, einzeln (de-)aktivierbare Knoepfe im Panel selbst,
 * nicht in einem Menue-Overlay — Zustandslogik (wer ist wann verfuegbar/ausgegraut) ist
 * unveraendert aus openStationMenu() uebernommen, nur die Darstellung ist neu.
 */

/* global Trigger, Panel, uiIcon, WASH, EMPTY_ACTIVE, ST, geraetGestartet */

// ===== Faehigkeits-/Zustandsfunktionen, 1:1 aus legacy.html "Station" uebernommen, nur auf
// ein vst-Objekt statt das globale VST umgestellt (gleiches Muster wie kopf.js). =====

// HA types.py 3110/3111: vorhanden, wenn das Geraet die Eigenschaft meldet.
const kannWaschen = vst => vst.wash != null;
// HA types.py 3111: auto_empty_base haengt an DUST_COLLECTION, nicht am Entleer-Status.
const kannEntleeren = vst => vst.dustcol != null;
/** HA device.py 9000-9010, vereinfacht: laedt oder haengt an der Station. */
const angedockt = vst => vst.charging === 1 || vst.charging === 3
  || vst.wash === WASH.WASHING || vst.wash === WASH.DRYING || vst.wash === WASH.PAUSED;
/** HA 8737-8744: Wassertank ODER Wischpad eingesetzt. */
const moppDrin = vst => vst.tank !== 0 || vst.mopstat === 1;
/**
 * HA device.py 9410-9425. ➖ Nicht abgebildet: returning_to_wash(_paused) und
 * returning_paused — dafuer fehlen uns die Zustaende; "returning" faengt der
 * Status BACK_HOME ab.
 */
const waschenGeht = vst => kannWaschen(vst) && moppDrin(vst)
  && !(vst.wash === WASH.WASHING || vst.wash === WASH.PAUSED || vst.wash === WASH.RETURNING
       || vst.status === ST.BACK_HOME || vst.cpaused);
/** HA device.py 9428-9439. ➖ Nicht abgebildet: self_repairing (kein State dafuer). */
const trocknenGeht = vst => kannWaschen(vst) && moppDrin(vst) && angedockt(vst)
  && vst.wash !== WASH.WASHING && vst.wash !== WASH.PAUSED
  && !geraetGestartet() && !vst.drain;
const trocknetGerade = vst => vst.wash === WASH.DRYING;
/**
 * HA device.py 8656-8672. Wichtigster Teil: waehrend eines Waschgangs geht kein
 * Entleeren (8669). ➖ Nicht abgebildet: HAs zweiter Zweig (auto_empty_mode/gen5 + started),
 * der das Entleeren auch waehrend der Fahrt erlaubt — dafuer fehlen uns die Faehigkeiten.
 * ➖ Nicht abgebildet: self_repairing (kein State dafuer).
 * Das "|| vst.wash===WASH.PAUSED" ist wie im Original redundant (jeder Wert != WASHING
 * erfuellt bereits den ersten Teil) — 1:1 uebernommen statt stillschweigend vereinfacht.
 */
const entleerenGeht = vst => kannEntleeren(vst) && vst.dustcol === 1
  && vst.state !== 28 // RETURNING_AUTO_EMPTY
  && (vst.wash !== WASH.WASHING || vst.wash === WASH.PAUSED)
  && !vst.drain;

class StationPanel extends Panel {
  constructor(id, container) {
    super(id, container);
    this.vst = {
      wash: null, dustcol: null, charging: null, tank: null, mopstat: null,
      status: null, cpaused: null, drain: null, empty: null, state: null,
    };
    this._idZuVst = {};
  }

  benoetigteStates(did) {
    const pfad = suffix => `dreame.0.${did}.status.${suffix}`;
    const vstSuffix = {
      wash: 'self-wash-base-status', dustcol: 'dust-collection', charging: 'charging-status',
      tank: 'water-tank', mopstat: 'mop-in-station', status: 'status',
      cpaused: 'cleaning-paused', drain: 'drainage-status', empty: 'auto-empty-status',
      state: 'state',
    };
    this._idZuVst = {};
    for (const [key, suffix] of Object.entries(vstSuffix)) this._idZuVst[pfad(suffix)] = key;
    return Object.keys(this._idZuVst);
  }

  neueDaten(stateId, wert) {
    const vstKey = this._idZuVst[stateId];
    if (!vstKey) return;
    this.vst[vstKey] = (wert == null || wert === '') ? null : Number(wert);
    this.render();
  }

  render() {
    if (!this.container) return;
    const liste = document.getElementById('stationAktionen');
    const titel = document.getElementById('stationTitel');
    if (!liste || !titel) return;

    const vst = this.vst;
    const knoepfe = [];

    if (kannEntleeren(vst)) {
      const laeuft = vst.empty === EMPTY_ACTIVE;
      const geht = entleerenGeht(vst);
      knoepfe.push({
        id: 'empty', text: 'Entleeren', icon: 'staubbeutel', disabled: laeuft || !geht,
        titel: laeuft ? 'Läuft gerade'
          : geht ? 'Behälter in die Station absaugen'
            : (vst.wash === WASH.WASHING ? 'Erst nach dem Mopp-Waschen'
              : !angedockt(vst) ? 'Nur an der Station möglich' : 'Gerade nicht möglich'),
        onclick: () => Trigger.startAutoEmpty(this.did),
      });
    }

    if (kannWaschen(vst)) {
      const waschtGerade = vst.wash === WASH.WASHING, pausiert = vst.wash === WASH.PAUSED;
      const geht = waschenGeht(vst);
      knoepfe.push({
        id: 'wash', text: pausiert ? 'Fortsetzen' : waschtGerade ? 'Anhalten' : 'Waschen', icon: 'wasser',
        disabled: (pausiert || waschtGerade) ? false : !geht,
        titel: pausiert ? 'Angehaltenen Waschgang weiterlaufen lassen'
          : waschtGerade ? 'Läuft gerade — anhalten, ohne den Auftrag zu beenden'
            : geht ? 'Wischpad in der Station reinigen'
              : (!moppDrin(vst) ? 'Kein Wischpad eingesetzt' : 'Gerade nicht möglich'),
        onclick: () => {
          if (pausiert) Trigger.resumeWashing(this.did);
          else if (waschtGerade) Trigger.pauseWashing(this.did);
          else Trigger.startWashing(this.did);
        },
      });

      const trocknet = trocknetGerade(vst);
      const trockenGeht = trocknenGeht(vst);
      knoepfe.push({
        id: 'dry', text: trocknet ? 'Trocknen beenden' : 'Trocknen', icon: 'wischtuch',
        disabled: !trocknet && !trockenGeht,
        titel: trocknet ? 'Laufende Trocknung abbrechen'
          : trockenGeht ? 'Wischpad trocknen'
            : waschtGerade ? 'Erst nach dem Mopp-Waschen'
              : (!angedockt(vst) ? 'Nur an der Station möglich'
                : geraetGestartet() ? 'Erst nach der Reinigung' : 'Gerade nicht möglich'),
        onclick: () => { if (trocknet) Trigger.stopDrying(this.did); else Trigger.startDrying(this.did); },
      });
    }

    liste.innerHTML = knoepfe.map(k => `<button class="saktion" type="button" data-id="${k.id}"`
      + ` title="${k.titel}" aria-label="${k.text}: ${k.titel}"${k.disabled ? ' disabled' : ''}>`
      + `${uiIcon(k.icon, 18)}<span>${k.text}</span></button>`).join('');
    titel.hidden = !knoepfe.length;
    for (const btn of liste.querySelectorAll('button[data-id]')) {
      const eintrag = knoepfe.find(k => k.id === btn.dataset.id);
      if (eintrag) btn.onclick = eintrag.onclick;
    }
  }
}
