'use strict';

// SIID 8 — Schedule (timezone + mow schedule, both writable)
// Sources: createMowerRemotes

module.exports = {
  statusStates: [],
  remoteStates: [
    { id: 'timezone', siid: 8, piid: 1, nameKey: 'mower.remote.timezone', type: 'string', role: 'text' },
    { id: 'schedule', siid: 8, piid: 2, nameKey: 'mower.remote.schedule', type: 'string', role: 'text' },
  ],
};
