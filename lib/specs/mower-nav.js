'use strict';

// SIID 5 — RTK/GPS + DND (navigation status + DND write settings)
// Sources: createMowerRemotes, docs/mower-protocol.md

module.exports = {
  statusStates: [
    { id: 'rtk-status',        siid: 5, piid: 100, nameKey: 'mower.status.rtk-status',        type: 'number', role: 'value' },
    { id: 'gps-satellites',    siid: 5, piid: 106, nameKey: 'mower.status.gps-satellites',    type: 'number', role: 'value' },
    { id: 'positioning-mode',  siid: 5, piid: 107, nameKey: 'mower.status.positioning-mode',  type: 'number', role: 'value' },
  ],
  remoteStates: [
    { id: 'dnd-enable', siid: 5, piid: 1, nameKey: 'mower.remote.dnd-enable', type: 'boolean', role: 'switch' },
    { id: 'dnd-start',  siid: 5, piid: 2, nameKey: 'mower.remote.dnd-start',  type: 'string',  role: 'text' },
    { id: 'dnd-end',    siid: 5, piid: 3, nameKey: 'mower.remote.dnd-end',    type: 'string',  role: 'text' },
  ],
};
