'use strict';

// Mower spec modules — added incrementally as Mower Bereich 1 progresses.
// Only modules listed here are included in the mower spec lookup.
const MOWER_MODULES = [
  require('./mower-core'),       // SIID 2 (Mower Service), SIID 3 (Battery)
  // mower-work.js   — SIID 4 (Work Extend) — TODO: Bereich 1
  // mower-nav.js    — SIID 5 (RTK/GPS)     — TODO: Bereich 1
  // mower-sched.js  — SIID 8 (Schedule)    — TODO: Bereich 1
  // mower-stats.js  — SIID 12 (Statistics) — TODO: Bereich 1
];

/**
 * Builds lookup maps for a mower device.
 * Returns metadata only — no extendObject, no ioBroker API calls.
 *
 * @param {string} did - Device ID
 * @returns {{ propsToId: object, metaMap: object, statusList: Array }}
 */
function buildMowerLookup(did) {
  const propsToId = {};
  const metaMap = {};
  const statusList = [];

  for (const mod of MOWER_MODULES) {
    for (const s of (mod.statusStates || [])) {
      const key = `${s.siid}-${s.piid}`;
      const path = `${did}.status.${s.id}`;
      propsToId[key] = path;
      metaMap[key] = {
        nameKey: s.nameKey,
        type: s.type,
        role: s.role,
        unit: s.unit,
        min: s.min,
        max: s.max,
        stateKeys: s.stateKeys,
        write: false,
        decode: s.decode,
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
        min: r.min,
        max: r.max,
        stateKeys: r.stateKeys,
        write: r.write !== undefined ? r.write : true,
        decode: r.decode,
        encode: r.encode,
      };
      statusList.push({ did, siid: r.siid, code: 0, piid: r.piid, updateTime: 0 });
    }
  }

  return { propsToId, metaMap, statusList };
}

module.exports = { buildMowerLookup };
