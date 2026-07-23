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
 * Alle sind boolean/role:button — write:true loest die Aktion aus.
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

  return {
    startCleaning, startCustomRoomCleaning, stopCleaning, chargeHome,
    resetMainBrush, resetSideBrush, resetFilter, resetSensor,
  };
})();
