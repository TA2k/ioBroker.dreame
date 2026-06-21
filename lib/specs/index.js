'use strict';

const MODULES = [
  require('./core'),
  require('./cleaning'),
  require('./dnd'),
  require('./audio'),
  require('./schedule'),
  require('./consumables'),
  require('./statistics'),
  require('./extended-settings'),
  require('./station'),
  require('./auto-empty'),
  require('./map'),
  require('./camera'),
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
        stateKeys: s.stateKeys,
        write: false,
        decode: s.decode,
        encode: s.encode,
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
        stateKeys: r.stateKeys,
        write: r.write !== undefined ? r.write : true,
        decode: r.decode,
        encode: r.encode,
      };
      // Auch als Status-Poll aufnehmen (Gerät sendet aktuellen Wert beim Poll)
      statusList.push({ did, siid: r.siid, code: 0, piid: r.piid, updateTime: 0 });
    }
  }

  return { propsToId, metaMap, statusList, actionsToId };
}

module.exports = { buildVacuumLookup };
