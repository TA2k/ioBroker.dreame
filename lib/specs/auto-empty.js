'use strict';

// SIID 15 — Auto Empty (dust collection station)

module.exports = {
  statusStates: [
    { id: 'dust-collection',   siid: 15, piid: 3, nameKey: 'vacuum.status.dust-collection',   type: 'number', role: 'value' },
    { id: 'auto-empty-status', siid: 15, piid: 5, nameKey: 'vacuum.status.auto-empty-status', type: 'number', role: 'value' },
  ],
  remoteStates: [
    { id: 'auto-dust-collecting',  siid: 15, piid: 1, nameKey: 'vacuum.remote.auto-dust-collecting',  type: 'number',  role: 'level' },
    { id: 'auto-empty-frequency',  siid: 15, piid: 2, nameKey: 'vacuum.remote.auto-empty-frequency',  type: 'number',  role: 'level' },
  ],
};
