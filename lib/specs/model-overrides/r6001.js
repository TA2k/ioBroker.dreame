'use strict';

// Model-family override for Dreame X60 Pro Ultra Complete
// (dreame.vacuum.r6001a) and related r6001* variants.
// See Issue #119.
//
// Provenance: live traces from @SilentM1978
//   #issuecomment-5492429062 (isolated manual mop test)
//
// Note: The REMOVE for SIID 4/PIID 52 and the RENAME for SIID 4/PIID 53
// were moved to broader scopes after the same behavior was observed on
// r6001*, r9419* (Gina) and r2253* (L20 Ultra):
//   REMOVE 4-52 -> lib/specs/model-overrides/all-vacuum.js (global)
//   RENAME 4-53 -> lib/specs/cleaning.js (nameKey directly on the
//                  generic spec entry, path unchanged)
// The REMAP for PIID 6 stays r6001-specific.
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
