'use strict';

// SIID 27 — Station Status (clean/dirty water tanks, dust bag, detergent, drainage, hot water)

module.exports = {
  statusStates: [
    {
      id: 'clean-water-tank-status',
      siid: 27,
      piid: 1,
      nameKey: 'vacuum.status.clean-water-tank-status',
      type: 'number',
      role: 'value',
      stateKeys: { 0: 'common.installed', 1: 'common.not-installed', 2: 'common.low-water', 3: 'common.not-installed' },
    },
    {
      id: 'dirty-water-tank-status',
      siid: 27,
      piid: 2,
      nameKey: 'vacuum.status.dirty-water-tank-status',
      type: 'number',
      role: 'value',
      stateKeys: { 0: 'common.installed', 1: 'common.not-installed-or-full' },
    },
    {
      id: 'dust-bag-status',
      siid: 27,
      piid: 3,
      nameKey: 'vacuum.status.dust-bag-status',
      type: 'number',
      role: 'value',
      stateKeys: { 0: 'common.installed', 1: 'common.not-installed', 2: 'common.check' },
    },
    { id: 'detergent-status',        siid: 27, piid: 4,  nameKey: 'vacuum.status.detergent-status',        type: 'number', role: 'value' },
    { id: 'station-drainage-status', siid: 27, piid: 5,  nameKey: 'vacuum.status.station-drainage-status', type: 'number', role: 'value' },
    { id: 'hot-water-status',        siid: 27, piid: 15, nameKey: 'vacuum.status.hot-water-status',        type: 'number', role: 'value' },
  ],
  remoteStates: [],
};
