/*
 * Reinigungs-Panel: Modus/Route/Saugstaerke/Wassermenge (Kachel-Grid), Betriebsart
 * (Einheitlich/Individuell), Raumauswahl-Anzeige, Start-Button-Semantik.
 * ========================================================================
 * Groesstes Panel — WIDGET_UMBAU_PLAN.md Etappe C, Commit C5, "Konsolidierungs-Commit"
 * (MAP_PLAN 7.2: alle Sende-Wege ueber Adapter-Trigger).
 *
 * Herkunft: browserseitiger Teil aus RicardoHipps Fork
 *   https://github.com/RicardoHipp/ioBroker.dreame
 * Reinigungsmodus/-route/Saugstaerke/Wassermenge-Logik (CLEAN_MODES/CLEAN_ROUTES/routenFuer/
 * modeSaugt/modeWischt) 1:1 aus legacy.html "Zustand"/"Reinigungs-Panel"-Bereichen uebernommen.
 *
 * Drei bewusste Abweichungen von Ricardo, alle auf Davids ausdrueckliche Entscheidung VOR
 * diesem Commit (siehe WIDGET_SESSION_STATUS.md):
 *
 * 1. Raumauswahl -> Reinigungsbefehl: NICHT Ricardos rohe MIoT-JSON-Liste
 *    (remote.start-custom-clean mit piid-10-selects), sondern das neuere Adapter-Feature
 *    remote.custom-room-cleaning.* (Checkbox-States pro Raum, seit Adapter v0.3.22). Die
 *    eigentliche Verdrahtung steckt in trigger.js (Trigger.startCustomRoomCleaning), hier
 *    nur der Aufruf vom Start-Knopf aus (siehe kopf.js-Diff dieses Commits).
 *
 * 2. Individuelle Pro-Raum-Einstellungen (Ricardos openRoomSettings(), Popup mit eigenem
 *    Modus/Saugstaerke/Wassermenge/Wiederholung je Raum, schreibt map.cleanset.<roomId>.*)
 *    sind NICHT Teil dieses Commits — eigener Entwurf/Speichern-Fluss, vertagt auf einen
 *    spaeteren Nachtrag. Die Betriebsart-Kachel (Einheitlich/Individuell) schaltet trotzdem
 *    schon den echten Geraeteschalter (remote.customized-cleaning) — das Geraet wendet dann
 *    an, was VORHER (App/altes Widget) je Raum gespeichert wurde, auch ohne dass dieses
 *    Widget einen Editor dafuer hat.
 *
 * 3. Kein Auswahl-Overlay (openPicker/openSlider existieren im modularen Widget noch nicht,
 *    siehe station.js-Kommentarkopf zu C4): Modus/Route/Saugstaerke sind direkte
 *    <select>-Elemente im Panel selbst, kein Dialog. Fuer Saugstaerke (4 Stufen) passt das
 *    gut. Die Feuchtigkeits-Kachel (s.u.) bekam in der C5-Nachbesserung stattdessen einen
 *    <input type=range> -- 32 Stufen sprengen eine Auswahlliste, ist aber ebenso ein
 *    direktes Steuerelement im Panel, kein Dialog.
 *
 * Feuchtigkeits-Kachel bindet an remote.wetness-level (SIID 28-1, Range 1-32), NICHT mehr
 * an remote.water-volume wie im urspruenglichen C5-Commit geplant: water-volume existiert
 * am X40 nicht ("state not found", Live-Test 2026-07-23, siehe WIDGET_SESSION_STATUS.md
 * Bug 1) — wetness-level ist der tatsaechlich vorhandene State, Ricardos Legacy nutzt genau
 * den (cmd('remote.wetness-level', wert)). Die damit einhergehende Diskrepanz zur
 * custom-room-cleaning-Befehlsliste (main.js _buildCustomRoomCleaningSelects baut dort
 * weiterhin aus water-volume) ist bekannt und bewusst NICHT Teil dieser Nachbesserung — das
 * haengt an der sendeRoomAuswahl-Strategieentscheidung, die noch aussteht.
 * Existiert wetness-level fuer dieses Geraet nicht, bleibt die Kachel einfach aus — gleiches
 * "kein State = keine Zeile"-Muster wie Wartung/Statistik (C2/C3).
 *
 * Ersetzt main.js' B5-Platzhalter (customizedCleaning/globalSaug/globalWasser/raumSaugt/
 * raumWischt/raumWdh/updateCleanPanel) durch echte Werte — siehe main.js-Diff. raumSaug()/
 * raumWasser() (Pro-Raum-Werte fuer die Karten-Badges im Individuell-Betrieb) liefern wegen
 * Punkt 2 oben weiterhin den GLOBALEN Wert zurueck, nicht das echte cleanset des Raums —
 * Badges zeigen also bis zum Pro-Raum-Editor-Nachtrag denselben Wert unabhaengig von der
 * Betriebsart.
 */

/* global Panel, Trigger, geraetGestartet, selectedRooms, updateRoomBadges */

// ===== Reinigungsmodus: EINE Auswahl aus vier, wie das Geraet es kennt (remote.cleaning-mode,
// vom Adapter bereits auf 0-3 dekodiert — siehe lib/specs/cleaning.js CLEANING_MODE_DECODE). =====
const CLEAN_MODES = [
  { id: 0, name: 'Saugen' },
  { id: 1, name: 'Wischen' },
  { id: 2, name: 'Saugen und Wischen' },
  { id: 3, name: 'Wischen nach Saugen' },
];
const modeWischt = id => id === 1 || id === 2 || id === 3;
const modeSaugt = id => id === 0 || id === 2 || id === 3;

// ===== Reinigungsroute (status.cleaning-route lesen, remote.set-cleaning-route schreiben).
// Reihenfolge wie HAs CLEANING_ROUTE_TO_NAME. =====
const CLEAN_ROUTES = [
  { id: 4, name: 'Schnell' },
  { id: 1, name: 'Standard' },
  { id: 2, name: 'Intensiv' },
  { id: 3, name: 'Tief' },
];
// Welche Routen der eingestellte Modus zulaesst — 1:1 HA device.py 749-758/1036-1044: beim
// Saugen und beim gleichzeitigen Saugen+Wischen faellt "Intensiv"/"Tief" weg (reine
// Wisch-Stufen).
const routenFuer = m => ((m === 0 || m === 2) ? CLEAN_ROUTES.filter(r => r.id !== 2 && r.id !== 3) : CLEAN_ROUTES);

const SUCT_NAMES = ['Leise', 'Standard', 'Stark', 'Turbo'];

// ===== Globale Bruecken-Werte fuer den Karten-Layer (render.js' baueBadge()/updateRoomBadges(),
// seit B2/B5 unveraendert) — ERSETZEN main.js' B5-Platzhalter, siehe Kommentarkopf oben. =====
let customizedCleaning = false;
let globalSaug = 1;
let globalWasser = 3;
let cleanMode = 0;
// Punkt 2 im Kommentarkopf: kein Pro-Raum-Editor in diesem Commit, daher immer der globale
// Wert — unabhaengig davon, ob customizedCleaning an oder aus ist.
const raumSaugt = () => modeSaugt(cleanMode);
const raumWischt = () => modeWischt(cleanMode);
const raumWdh = () => 1;
const raumSaug = () => globalSaug;
const raumWasser = () => globalWasser;

class ReinigungPanel extends Panel {
  constructor(id, container) {
    super(id, container);
    this.modus = null;
    this.route = null;
    this.saug = null;
    this.wasser = null;
    this.wasserDa = false;
    this.custom = null;
  }

  benoetigteStates(did) {
    this._idModus = `dreame.0.${did}.remote.cleaning-mode`;
    this._idRoute = `dreame.0.${did}.status.cleaning-route`;
    this._idSaug = `dreame.0.${did}.remote.suction-level`;
    this._idWasser = `dreame.0.${did}.remote.wetness-level`;
    this._idCustom = `dreame.0.${did}.remote.customized-cleaning`;
    return [this._idModus, this._idRoute, this._idSaug, this._idWasser, this._idCustom];
  }

  init(did) {
    reinigungInstanz = this; // Bruecke fuer updateCleanPanel(), siehe Kommentarkopf
    return super.init(did);
  }

  neueDaten(stateId, wert) {
    if (stateId === this._idModus) {
      this.modus = wert == null ? null : Number(wert);
      cleanMode = this.modus ?? 0;
      this._pruefeRoute();
    } else if (stateId === this._idRoute) {
      this.route = wert == null ? null : Number(wert);
    } else if (stateId === this._idSaug) {
      this.saug = wert == null ? null : Number(wert);
      globalSaug = this.saug ?? 1;
    } else if (stateId === this._idWasser) {
      this.wasserDa = wert != null;
      this.wasser = wert == null ? null : Number(wert);
      if (this.wasser != null) globalWasser = this.wasser;
    } else if (stateId === this._idCustom) {
      this.custom = !!wert;
      customizedCleaning = this.custom;
    } else {
      return;
    }
    this.render();
  }

  /** Nach einem Moduswechsel kann die eingestellte Route wegfallen (Intensiv/Tief gibt es
   * beim Saugen nicht). HA setzt dann auf Standard zurueck — aber nur, solange KEIN Auftrag
   * laeuft: mitten in der Fahrt wuerde das die laufende Reinigung umstellen. 1:1 aus Ricardos
   * pruefeRoute() uebernommen. */
  _pruefeRoute() {
    if (this.route == null || geraetGestartet()) return;
    if (routenFuer(cleanMode).some(r => r.id === this.route)) return;
    Trigger.setCleaningRoute(this.did, 1);
  }

  render() {
    if (!this.container) return;
    this._renderRaum();
    this._renderModus();
    this._renderRoute();
    this._renderSaug();
    this._renderWasser();
    this._renderBetriebsart();
    updateRoomBadges();
  }

  _renderRaum() {
    const el = document.getElementById('reinigungRaum');
    if (!el) return;
    const n = selectedRooms.size;
    el.textContent = n === 0 ? 'Raum antippen zum Wählen' : (n === 1 ? '1 Raum gewählt' : n + ' Räume gewählt');
  }

  _renderModus() {
    const el = document.getElementById('reinigungModus');
    if (!el) return;
    if (!el.dataset.gefuellt) {
      el.innerHTML = CLEAN_MODES.map(m => `<option value="${m.id}">${m.name}</option>`).join('');
      el.dataset.gefuellt = '1';
      el.onchange = () => Trigger.setCleaningMode(this.did, Number(el.value));
    }
    if (this.modus != null) el.value = String(this.modus);
    el.disabled = customizedCleaning || geraetGestartet();
  }

  _renderRoute() {
    const el = document.getElementById('reinigungRoute');
    if (!el) return;
    const optionen = routenFuer(cleanMode);
    const schluessel = optionen.map(r => r.id).join(',');
    if (el.dataset.schluessel !== schluessel) {
      el.innerHTML = optionen.map(r => `<option value="${r.id}">${r.name}</option>`).join('');
      el.dataset.schluessel = schluessel;
      el.onchange = () => Trigger.setCleaningRoute(this.did, Number(el.value));
    }
    if (this.route != null && optionen.some(r => r.id === this.route)) el.value = String(this.route);
    el.disabled = customizedCleaning;
  }

  _renderSaug() {
    const el = document.getElementById('reinigungSaug');
    if (!el) return;
    if (!el.dataset.gefuellt) {
      el.innerHTML = SUCT_NAMES.map((n, i) => `<option value="${i}">${n}</option>`).join('');
      el.dataset.gefuellt = '1';
      el.onchange = () => Trigger.setSuctionLevel(this.did, Number(el.value));
    }
    if (this.saug != null) el.value = String(this.saug);
    el.disabled = customizedCleaning || !modeSaugt(cleanMode);
  }

  /** Feuchtigkeits-Regler (remote.wetness-level, 1-32) -- Slider statt Dropdown, s.
   * Kommentarkopf. oninput haelt nur Wert-Anzeige/Fuellstand waehrend des Ziehens nach,
   * gesendet wird erst bei onchange (Loslassen) -- gleiches Muster wie overlays.js' uiRange/
   * lgRange. --fill setzt den Slider hier selbst (reglerFuellung() aus legacy.html existiert
   * im modularen Widget noch nicht). */
  _renderWasser() {
    const karte = document.getElementById('reinigungWasserKarte');
    const el = document.getElementById('reinigungWasser');
    const wertEl = document.getElementById('reinigungWasserWert');
    if (!el || !karte) return;
    karte.hidden = !this.wasserDa;
    if (!this.wasserDa) return;
    const fuellen = () => {
      const pct = (Number(el.value) - Number(el.min)) / (Number(el.max) - Number(el.min)) * 100;
      el.style.setProperty('--fill', pct + '%');
      if (wertEl) wertEl.textContent = el.value;
    };
    if (!el.dataset.gefuellt) {
      el.dataset.gefuellt = '1';
      el.oninput = fuellen;
      el.onchange = () => Trigger.setWetnessLevel(this.did, Number(el.value));
    }
    if (this.wasser != null && document.activeElement !== el) el.value = String(this.wasser);
    fuellen();
    el.disabled = customizedCleaning || !modeWischt(cleanMode);
  }

  _renderBetriebsart() {
    const el = document.getElementById('reinigungBetriebsart');
    if (!el) return;
    el.onchange = () => Trigger.setCustomizedCleaning(this.did, el.checked);
    if (this.custom != null) el.checked = this.custom;
    el.disabled = geraetGestartet();
  }

  dispose() {
    if (reinigungInstanz === this) reinigungInstanz = null;
    super.dispose();
  }
}

// Bruecke zum Karten-Layer (render.js' selectRoom() ruft updateCleanPanel() bei jedem
// Raum-Klick auf, seit B2/B5 als main.js-Platzhalter — hier ERSETZT, gleiches Muster wie
// kopf.js' geraetGestartet()/updateBadges()).
let reinigungInstanz = null;
function updateCleanPanel() { if (reinigungInstanz) reinigungInstanz.render(); }
