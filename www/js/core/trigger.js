/*
 * trigger.js — Wrapper fuer alle Adapter-Trigger. Einziger Sende-Weg des Widgets
 * (WIDGET_ARCHITEKTUR.md Abschnitt 8.4/13) — kein Panel schreibt remote.*-States direkt,
 * alles laeuft ueber diese Funktionen.
 *
 * State-IDs recherchiert in main.js (actionStates-Array, siid/aiid siehe dort):
 *   startCleaning              remote.startCleaning        (neu, WIDGET_UMBAU_PLAN.md A1)
 *   stopCleaning               remote.stop                 (vorhanden, MIoT 4-2)
 *   chargeHome                 remote.return-to-dock        (vorhanden, MIoT 3-1)
 *   resetMainBrush/-SideBrush/-Filter/-Sensor  remote.reset-*  (vorhanden)
 *   startWashing/startAutoEmpty       remote.start-washing/-auto-empty  (vorhanden, 4-4/15-1)
 *   resumeWashing/pauseWashing/       remote.resume-washing/pause-washing/
 *   startDrying/stopDrying             start-drying/stop-drying  (vorhanden, alle 4-4)
 * Erste Gruppe (Buttons) ist boolean/role:button — write:true loest die Aktion aus.
 *
 * Zweite Gruppe (Wasch-/Trocken-Aktionen, Etappe C, Commit C4) ist ANDERS: main.js legt sie
 * als role:text (string) an, weil ihr "in"-Parameter (das MIoT-Code-Paar in piid 10, z.B.
 * "3,1" fuer Trocknen-an) nicht leer ist (main.js ~2578-2587, `a.in.length===0` entscheidet
 * boolean vs. string). Der onStateChange-Handler (main.js ~5824-5839) sendet bei einem
 * booleschen Wert immer "in: []" (= Standard-Aktion, hier "waschen"/"entleeren"), bei einem
 * String-Wert JSON.parse(state.val) als "in" — deshalb schreiben resumeWashing/pauseWashing/
 * startDrying/stopDrying denselben JSON-Text, den main.js als Objekt-Default (`def`) fuer den
 * jeweiligen State bereits hinterlegt hat (1:1 aus www/legacy.html cmd()-Aufrufen in
 * openStationMenu() uebernommen, dort per JSON.stringify() gesendet).
 *
 * startCustomRoomCleaning (Etappe C, Commit C5) ist KEIN einfacher Button-Trigger mehr,
 * siehe Kommentar dort — Ricardos Original sendet eine rohe MIoT-JSON-Liste direkt im
 * Startbefehl, der Adapter hat seit v0.3.22 aber ein eigenes Feature dafuer
 * (remote.custom-room-cleaning.*, benannte Checkbox-States pro Raum). Auf Davids
 * ausdrueckliche Entscheidung nutzt das Widget dieses neuere Feature statt Ricardos JSON.
 */

/* global Daten */

const Trigger = (() => {
  const pfad = (did, id) => `dreame.0.${did}.remote.${id}`;
  const crcPfad = (did, id) => pfad(did, `custom-room-cleaning.${id}`);
  const tankPfad = (did, id) => `dreame.0.${did}.config.tank.${id}`;

  const startCleaning = did => Daten.setState(pfad(did, 'startCleaning'), true);
  const stopCleaning = did => Daten.setState(pfad(did, 'stop'), true);
  const chargeHome = did => Daten.setState(pfad(did, 'return-to-dock'), true);
  const resetMainBrush = did => Daten.setState(pfad(did, 'reset-main-brush'), true);
  const resetSideBrush = did => Daten.setState(pfad(did, 'reset-side-brush'), true);
  const resetFilter = did => Daten.setState(pfad(did, 'reset-filter'), true);
  const resetSensor = did => Daten.setState(pfad(did, 'reset-sensor'), true);
  const startWashing = did => Daten.setState(pfad(did, 'start-washing'), true);
  const startAutoEmpty = did => Daten.setState(pfad(did, 'start-auto-empty'), true);
  const resumeWashing = did => Daten.setState(pfad(did, 'resume-washing'), JSON.stringify([{ piid: 10, value: '1,1' }]));
  const pauseWashing = did => Daten.setState(pfad(did, 'pause-washing'), JSON.stringify([{ piid: 10, value: '1,0' }]));
  const startDrying = did => Daten.setState(pfad(did, 'start-drying'), JSON.stringify([{ piid: 10, value: '3,1' }]));
  const stopDrying = did => Daten.setState(pfad(did, 'stop-drying'), JSON.stringify([{ piid: 10, value: '3,0' }]));

  // ===== Kachel-Grid (Etappe C, Commit C5): globale Geraete-Eigenschaften, gelten fuer
  // jeden Auftrag (Komplett- wie Raum-Reinigung) unabhaengig voneinander. =====
  const setCleaningMode = (did, wert) => Daten.setState(pfad(did, 'cleaning-mode'), wert);
  const setCleaningRoute = (did, wert) => Daten.setState(pfad(did, 'set-cleaning-route'), wert);
  const setSuctionLevel = (did, wert) => Daten.setState(pfad(did, 'suction-level'), wert);
  const setWetnessLevel = (did, wert) => Daten.setState(pfad(did, 'wetness-level'), wert);
  // Betriebsart: aus = einheitlich (ein Wert fuer alle Raeume), an = individuell (jeder
  // Raum nach seinem gespeicherten cleanset). remote.customized-cleaning ist boolean/switch
  // (SIID 4-26) -- deshalb true/false, nicht 0/1.
  const setCustomizedCleaning = (did, an) => Daten.setState(pfad(did, 'customized-cleaning'), !!an);

  // ===== Pro-Raum-Einstellungen ins gespeicherte cleanset schreiben (Individuell-Betrieb).
  // Feld = Level | WaterVolume | CleaningMode | Route | Repeat. Der Adapter (main.js
  // UpdateRoomSettings -> customeClean) liest die uebrigen Felder des Raums dazu und
  // uebertraegt alle sechs dauerhaft ans Geraet -- die Aenderung ueberlebt also den
  // naechsten App-Start, anders als die globalen Kacheln. =====
  const cleansetPfad = (did, raumId, feld) => `dreame.0.${did}.map.cleanset.${raumId}.${feld}`;
  const setCleansetFeld = (did, raumId, feld, wert) => Daten.setState(cleansetPfad(did, raumId, feld), wert);

  // ===== Tank-Verbrauch (Etappe D, Commit D1d): manueller Reset zusaetzlich zum
  // Auto-Reset-Timer im Adapter (D1c) -- fuer den Fall, dass der Nutzer sofort
  // zuruecksetzen will oder die 10s-Erkennung mal danebenliegt. =====
  const resetTankCounter = did => Daten.setState(tankPfad(did, 'wash-counter'), 0);

  /**
   * Aktive Karte fuer custom-room-cleaning ermitteln. Bevorzugt den bereits gesetzten
   * active-map-Wert; ist er leer (Erstlauf — niemand hat je eine Karte wirksam gewaehlt),
   * wird die Karte automatisch uebernommen, WENN es genau eine gibt (der ueberwiegende
   * Fall — ein Roboter mit einer Wohnung). Mehrere Karten bleiben hier ungeloest: ein
   * Karten-/Geraete-Umschalter ist Etappe E, siehe WIDGET_SESSION_STATUS.md.
   */
  async function ermittleAktiveKarte(did) {
    const bisher = await Daten.getState(crcPfad(did, 'active-map'));
    if (bisher) return String(bisher);
    const obj = await Daten.getObject(crcPfad(did, 'active-map'));
    const karten = Object.keys((obj && obj.common && obj.common.states) || {});
    if (karten.length !== 1) {
      console.warn('[trigger] custom-room-cleaning: aktive Karte nicht eindeutig ermittelbar', karten);
      return null;
    }
    await Daten.setState(crcPfad(did, 'active-map'), karten[0]);
    return karten[0];
  }

  /**
   * Reinigung der aktuell ausgewaehlten Raeume ueber das Adapter-eigene
   * custom-room-cleaning-Feature (seit v0.3.22). Deutlich schlanker als vor Etappe C5.5:
   * die Checkbox-States sind bereits aktuell (jeder Kartenklick schreibt seit C5.5-3 sofort,
   * siehe reinigung.js raumUmschalten()) -- kein Batch-Write mehr hier noetig, kein
   * roomIds-Parameter mehr. Die frueher hier erzwungene customized-cleaning=true entfaellt
   * ebenfalls: der Adapter verlangte das nie wirklich vom Geraet, das war reine
   * Adapter-Logik, per Fix b78772e entfernt (siehe WIDGET_SESSION_STATUS.md).
   * Nach dem Start werden die Checkbox-States auf false zurueckgesetzt, damit Widget und
   * Adapter danach wieder "keine Auswahl" zeigen -- der Adapter hat die Auswahl beim
   * Verarbeiten von `.start=true` bereits gelesen (main.js Teil C), das Zuruecksetzen
   * beeinflusst den gerade abgeschickten Befehl nicht mehr.
   * @param did  Geraete-ID
   * @returns true, wenn der Start-Befehl abgeschickt werden konnte
   */
  async function startCustomRoomCleaning(did) {
    const mapId = await ermittleAktiveKarte(did);
    if (!mapId) return false;
    await Daten.setState(crcPfad(did, 'start'), true);
    const objekte = await Daten.getObjects(crcPfad(did, `map-${mapId}.*`));
    const raumStates = Object.keys(objekte).filter(id => objekte[id] && objekte[id].native && objekte[id].native.roomId !== undefined);
    await Promise.all(raumStates.map(id => Daten.setState(id, false)));
    return true;
  }

  return {
    startCleaning, startCustomRoomCleaning, stopCleaning, chargeHome,
    resetMainBrush, resetSideBrush, resetFilter, resetSensor,
    startWashing, startAutoEmpty, resumeWashing, pauseWashing, startDrying, stopDrying,
    setCleaningMode, setCleaningRoute, setSuctionLevel, setWetnessLevel, setCustomizedCleaning,
    setCleansetFeld,
    resetTankCounter,
  };
})();
