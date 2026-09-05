'use strict';

// Model-family override for Dreame X60 Pro Ultra Complete
// (dreame.vacuum.r6001a) and related r6001* variants.
// See Issue #119 and ISSUE_119_ANALYSE.md section 4.2.
//
// Provenance: live traces from @SilentM1978 in issue #119
//   #issuecomment-5477752912  (installation + removal test)
//   #issuecomment-5492429062  (isolated manual test:
//                              confirms PIID 6 = pad presence,
//                              PIID 52 dead, PIID 53 pulse only)

module.exports = [
  // SIID 4 / PIID 52 mop-in-station:
  //   permanently 0 on r6001*, never updates (lc unchanged
  //   for weeks in the reporter's log). Not usable as a
  //   station-presence indicator. Removed entirely.
  { kind: 'remove', siid: 4, piid: 52 },

  // SIID 4 / PIID 53 mop-pad-installed:
  //   emits short ~1s 0->1->0 pulses during mechanical
  //   mop handling (install/remove), stays 0 during manual
  //   handling. Not a persistent installed-state on r6001*.
  //   Renamed to mop-handling-pulse; path stays the same
  //   to avoid breaking user scripts.
  {
    kind: 'rename',
    siid: 4,
    piid: 53,
    nameKey: 'vacuum.status.mop-handling-pulse',
    desc: 'r6001*: ~1s-Puls bei mechanischem Mopp-Handling, kein Dauerzustand',
  },

  // REMAP 4-6 (water-tank -> mop-pad-installed) intentionally
  // NOT in this commit. See follow-up 2c.
];
