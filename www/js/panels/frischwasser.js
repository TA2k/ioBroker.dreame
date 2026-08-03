/*
 * Wasser & Mopp-Panel: Frischwasser-Tank-Verbrauch (Balken + Wasch-Zyklen), Tank-/Mopp-Status,
 * Feuchtigkeit/Temperatur, manueller Zaehler-Reset.
 * ========================================================================
 * Etappe D, Commit D1d. Zeigt die in D1a angelegten `config.tank.*`-States (RW-Konfiguration
 * + berechnete Restwerte) sowie den D1c-Auto-Reset-Trigger-State `clean-water-tank-status`
 * (Stations-Frischwassertank, siid 27 piid 1) — siehe TANK_ANALYSE.md fuer die vollstaendige
 * Herleitung. Layout/CSS-Klassen bewusst wiederverwendet statt neu erfunden: `.verbrauch`/
 * `.vrow`/`.vbar` wie im Wartungs-Panel (wartung.js), `.statlist` wie im Statistik-Panel
 * (statistik.js), `.warnbox`/`.wrow` wie im Fehler-Panel (fehler.js), `.saktionen` wie im
 * Station-Panel (station.js).
 */

/* global Panel, Trigger, Daten, uiIcon */

// Farben ueber vorhandene CSS-Custom-Properties (theme.css) statt neuer Klassen -- der
// Balken braucht drei Zustaende (ok/warn/critical), die bestehenden .vrow.warn/.vrow.bad-Regeln
// greifen hier nicht, weil der Balken (anders als bei wartung.js) senkrecht statt waagerecht
// neben Icon/Name steht (Vorgabe: Text UEBER dem Balken).
const TANK_FARBE = { ok: 'var(--txt)', warn: 'var(--warn,#e0a33a)', critical: 'var(--bad,#ff5c7a)' };
const TANK_WARNTEXT = {
  warn: 'Wasser bald nachfüllen',
  critical: 'Wasser dringend nachfüllen — Störungsgefahr!',
};

// Stations-Frischwassertank (siid 27, piid 1, lib/specs/station.js): 0 = Installed,
// 1 = Not installed, 2 = Low water (Zwischenzustand, zaehlt auch als installiert). Per
// TANK-DIAG-Log live bestaetigt (David, 2026-07-27) -- siehe main.js D1c-Kommentar fuer die
// Zwischenzeitlich-falsch-korrigiert-Geschichte (kurzzeitig auf status.water-tank umgestellt,
// das sich beim Tank-Rausziehen live nachweisbar nicht mitbewegt).
const TANK_EINGESETZT = wert => Number(wert) === 0 || Number(wert) === 2;

// mop-pad-installed (main.js Zeile ~1756) und mop-in-station (main.js Zeile ~1755) haben beide
// keine states-Wertetabelle in der Spec-Definition -- welcher State wann was genau aussagt, ist
// noch nicht am echten Geraet verifiziert (David-Entscheidung: beide Zeilen parallel anzeigen,
// um das empirisch zu klaeren). Reine Anzeigezeilen ohne Trigger-Logik, geringes Risiko.
const IST_EINS = wert => Number(wert) === 1;

class WasserMoppPanel extends Panel {
  static passtZuTyp = ['vacuum'];

  constructor(id, container, config) {
    super(id, container, config);
    this.werte = {}; // key -> letzter Wert, key aus _idZuKey
    this._idZuKey = {};
    this._temperaturStates = {}; // wert -> lokalisierter Text, aus common.states des Adapter-Objekts
  }

  // Temperatur-Texte kommen aus den Objekt-Metadaten statt einer eigenen Uebersetzungstabelle:
  // der Adapter uebersetzt stateKeys aus lib/specs/extended-settings.js per I18n.translate()
  // bereits beim Anlegen des States (main.js _lazyCreateState) in common.states -- dadurch
  // automatisch in der vom Adapter konfigurierten Sprache, ohne Duplikat im Widget.
  async init(did) {
    const temperaturId = `dreame.0.${did}.remote.water-temperature`;
    const obj = await Daten.getObject(temperaturId);
    this._temperaturStates = (obj && obj.common && obj.common.states) || {};
    await super.init(did);
  }

  benoetigteStates(did) {
    const suffixZuKey = {
      'config.tank.capacity-ml': 'capacityMl',
      'config.tank.wash-counter': 'washCounter',
      'config.tank.remaining-ml': 'remainingMl',
      'config.tank.remaining-washes': 'remainingWashes',
      'config.tank.status': 'status',
      'status.clean-water-tank-status': 'tankStatus',
      'status.mop-pad-installed': 'moppStatus',
      'status.mop-in-station': 'moppInStation',
      'remote.wetness-level': 'wetness',
      'remote.water-temperature': 'temperatur',
    };
    this._idZuKey = {};
    for (const [suffix, key] of Object.entries(suffixZuKey)) {
      this._idZuKey[`dreame.0.${did}.${suffix}`] = key;
    }
    return Object.keys(this._idZuKey);
  }

  neueDaten(stateId, wert) {
    const key = this._idZuKey[stateId];
    if (!key) return;
    this.werte[key] = wert;
    this.render();
  }

  render() {
    if (!this.container) return;
    const balken = document.getElementById('frischwasserBalken');
    const liste = document.getElementById('frischwasserListe');
    const titel = document.getElementById('frischwasserTitel');
    const warnung = document.getElementById('frischwasserWarnung');
    const aktionen = document.getElementById('frischwasserAktionen');
    if (!balken || !liste || !titel || !warnung || !aktionen) return;

    const w = this.werte;
    const habenBalkenDaten = w.remainingMl != null && w.capacityMl != null;

    if (habenBalkenDaten) {
      const remainingL = (Number(w.remainingMl) / 1000).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
      const capacityL = (Number(w.capacityMl) / 1000).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
      const pct = Math.max(0, Math.min(100, (Number(w.remainingMl) / Number(w.capacityMl)) * 100));
      const farbe = TANK_FARBE[w.status] || TANK_FARBE.ok;
      const knapp = Number(w.remainingMl) < 100;
      const textStil = knapp ? `font-weight:700;color:${TANK_FARBE.critical}` : '';
      // Bug 1 (Live-Test 2026-07-27): .vbar traegt "flex:1;height:8px" (layout.css) -- das
      // funktioniert nur, wenn .vbar direktes Kind eines ROW-Flex-Containers ist (wie bei den
      // Wartungs-Balken): flex-basis:0% wirkt dann auf die Haupt-Achse (Breite), height bleibt
      // unberuehrt. Die vorherige Fassung setzte .vrow per Inline-Style auf
      // flex-direction:column -- dort ist die Haupt-Achse die Hoehe, flex-basis:0% hat dann
      // height:8px ueberschrieben und den Balken auf 0px kollabiert (kein Fehler in der Farbe,
      // reines Hoehen-Problem). Fix: Text-Zeile und Balken-Zeile als zwei separate Kinder von
      // #frischwasserBalken (das bereits .verbrauch/column ist) -- der Balken selbst steckt in
      // einem UNVERAENDERTEN .vrow (Standard-Row-Richtung, exakt wie im Wartungs-Panel).
      balken.innerHTML = `<div style="${textStil}">${remainingL} / ${capacityL} L</div>`
        + `<div class="vrow"><span class="vbar"><i style="width:${pct}%;background:${farbe}"></i></span></div>`;
    } else {
      balken.innerHTML = '';
    }

    const zeilen = [];
    if (w.washCounter != null) {
      const uebrig = w.remainingWashes != null ? ` (~${w.remainingWashes} übrig)` : '';
      zeilen.push(`<div><span>Wasch-Zyklen</span><span>${w.washCounter} verbraucht${uebrig}</span></div>`);
    }
    if (w.tankStatus != null) {
      const eingesetzt = TANK_EINGESETZT(w.tankStatus);
      zeilen.push(`<div><span>Tank</span><span>${eingesetzt ? 'eingesetzt ✓' : 'draußen ✗'}</span></div>`);
    }
    if (w.moppStatus != null) {
      const drin = IST_EINS(w.moppStatus);
      zeilen.push(`<div><span>Mopp montiert</span><span>${drin ? '✓' : '✗'}</span></div>`);
    }
    if (w.moppInStation != null) {
      const inStation = IST_EINS(w.moppInStation);
      zeilen.push(`<div><span>Mopp in Station</span><span>${inStation ? '✓' : '✗'}</span></div>`);
    }
    if (w.wetness != null) {
      zeilen.push(`<div><span>Feuchtigkeit</span><span>${w.wetness}</span></div>`);
    }
    if (w.temperatur != null) {
      const temperaturText = this._temperaturStates[String(w.temperatur)] || ('Stufe ' + w.temperatur);
      zeilen.push(`<div><span>Temperatur</span><span>${temperaturText}</span></div>`);
    }
    liste.innerHTML = zeilen.join('');

    const habenInhalt = habenBalkenDaten || zeilen.length > 0;
    titel.hidden = !habenInhalt;

    const warnText = TANK_WARNTEXT[w.status];
    if (warnText) {
      warnung.innerHTML = `<div class="wrow${w.status === 'critical' ? ' bad' : ''}">${uiIcon('warnung', 15)}<span>${warnText}</span></div>`;
      warnung.hidden = false;
    } else {
      warnung.innerHTML = '';
      warnung.hidden = true;
    }

    aktionen.innerHTML = `<button class="saktion" type="button" data-id="reset-tank">`
      + `${uiIcon('frischwasser', 18)}<span>Tank gefüllt zurücksetzen</span></button>`;
    const resetBtn = aktionen.querySelector('button[data-id="reset-tank"]');
    if (resetBtn) resetBtn.onclick = () => Trigger.resetTankCounter(this.did);
  }
}
