'use strict';

const MODULES = [
  require('./core'),
  require('./cleaning'),
  // weitere Module werden hier ergänzt, sobald die jeweiligen SIIDs portiert sind:
  // require('./dnd'),
  // require('./map'),
  // require('./audio'),
  // require('./schedule'),
  // require('./consumables'),
  // require('./statistics'),
  // require('./auto-empty'),
  // require('./station'),
  // require('./extended-settings'),
  // require('./camera'),
];

/**
 * Baut Lookup-Maps für ein Gerät auf.
 * Gibt NUR Metadaten zurück — kein extendObject, kein ioBroker-API-Aufruf.
 *
 * @param {string} did - Geräte-ID
 * @returns {{ propsToId: object, metaMap: object, statusList: Array, actionsToId: object }}
 */
function buildVacuumLookup(did) {
  const propsToId = {};
  const metaMap = {};
  const statusList = [];
  const actionsToId = {};

  for (const mod of MODULES) {
    for (const s of (mod.statusStates || [])) {
      const key = `${s.siid}-${s.piid}`;
      const path = `${did}.status.${s.id}`;
      propsToId[key] = path;
      metaMap[key] = {
        nameKey: s.nameKey,
        type: s.type,
        role: s.role,
        unit: s.unit,
        states: s.states,
        write: false,
      };
      statusList.push({ did, siid: s.siid, code: 0, piid: s.piid, updateTime: 0 });
    }

    for (const r of (mod.remoteStates || [])) {
      const key = `${r.siid}-${r.piid}`;
      const path = `${did}.remote.${r.id}`;
      propsToId[key] = path;
      metaMap[key] = {
        nameKey: r.nameKey,
        type: r.type,
        role: r.role,
        unit: r.unit,
        states: r.states,
        write: r.write !== undefined ? r.write : true,
      };
      // Auch als Status-Poll aufnehmen (Gerät sendet aktuellen Wert beim Poll)
      statusList.push({ did, siid: r.siid, code: 0, piid: r.piid, updateTime: 0 });
    }
  }

  return { propsToId, metaMap, statusList, actionsToId };
}

module.exports = { buildVacuumLookup };
