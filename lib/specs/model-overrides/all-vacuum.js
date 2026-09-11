'use strict';

// Model-family override that applies to ALL vacuum devices, regardless of
// model family. Used for properties that are defined in the generic spec
// (lib/specs/cleaning.js) but observed as unusable across every family
// encountered so far.
//
// Applied BEFORE any family-specific override (see applyModelOverrides in
// ./index.js), so family overrides can still refine or partially undo
// effects from here if needed.

module.exports = [
  // SIID 4 / PIID 52 mop-in-station:
  //   Permanently 0 on r6001*, r9419* (Gina) and r2253* (L20 Ultra) — never
  //   updates during mop handling or docking transitions. Not usable as a
  //   station-presence indicator. Removed at spec load time; existing
  //   objects are deleted by Adapter#_cleanupDeadMopInStation on first
  //   adapter start after upgrade (per-device marker
  //   ${did}.info.mopInStationCleanupV1).
  { kind: 'remove', siid: 4, piid: 52 },
];
