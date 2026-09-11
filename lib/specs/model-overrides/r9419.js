'use strict';

// Model-family override for Dreame L40s / X40 Ultra (dreame.vacuum.r9419h)
// and related r9419* variants.
// See Issue #119.
//
// Provenance: PIID 6 tracked mop-pad presence 1:1 on Gina's r9419h in
// an isolated pad-remove/reinstall test (session 2026-09-07):
//   Pads mounted     -> water-tank = 1
//   Pads removed     -> water-tank = 0  (lc updated: 1788706631827)
//   Pads reinstalled -> water-tank = 1  (lc updated: 1788706761739)
// Same semantic as r6001a (see ./r6001.js) — no separately removable
// onboard water tank on this device. The tests were done outside the
// dock to rule out any station-driven state manipulation.
//
// r2253 (L20 Ultra) intentionally NOT included in the REMAP: PIID 6
// semantics on that family not yet verified (killer test outstanding).

module.exports = [
  {
    kind: 'remap',
    siid: 4,
    piid: 6,
    nameKey: 'vacuum.status.mop-pad-installed',
    stateKeys: { 0: 'common.not-installed', 1: 'common.installed' },
  },
];
