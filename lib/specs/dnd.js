'use strict';

// SIID 5 — Do Not Disturb (DND)

module.exports = {
  statusStates: [
    { id: 'dnd-task', siid: 5, piid: 4, nameKey: 'vacuum.status.dnd-task', type: 'string', role: 'json' },
  ],
  remoteStates: [
    { id: 'dnd-enable', siid: 5, piid: 1, nameKey: 'vacuum.remote.dnd-enable', type: 'boolean', role: 'switch' },
    { id: 'dnd-start',  siid: 5, piid: 2, nameKey: 'vacuum.remote.dnd-start',  type: 'string',  role: 'text' },
    { id: 'dnd-end',    siid: 5, piid: 3, nameKey: 'vacuum.remote.dnd-end',    type: 'string',  role: 'text' },
  ],
};
