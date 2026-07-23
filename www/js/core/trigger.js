/*
 * trigger.js — Wrapper fuer alle Adapter-Trigger. Einziger Sende-Weg des Widgets
 * (WIDGET_ARCHITEKTUR.md Abschnitt 8.4/13) — kein Panel schreibt remote.*-States direkt,
 * alles laeuft ueber diese Funktionen.
 *
 * State-IDs recherchiert in main.js (actionStates-Array, siid/aiid siehe dort):
 *   startCleaning              remote.startCleaning        (neu, WIDGET_UMBAU_PLAN.md A1)
 *   startCustomRoomCleaning    remote.custom-room-cleaning.start  (vorhanden)
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
 */

/* global Daten */

const Trigger = (() => {
  const pfad = (did, id) => `dreame.0.${did}.remote.${id}`;

  const startCleaning = did => Daten.setState(pfad(did, 'startCleaning'), true);
  const startCustomRoomCleaning = did => Daten.setState(pfad(did, 'custom-room-cleaning.start'), true);
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

  return {
    startCleaning, startCustomRoomCleaning, stopCleaning, chargeHome,
    resetMainBrush, resetSideBrush, resetFilter, resetSensor,
    startWashing, startAutoEmpty, resumeWashing, pauseWashing, startDrying, stopDrying,
  };
})();
