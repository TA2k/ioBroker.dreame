'use strict';

// SIID 8 — Schedule (timezone, cleaning schedule, cruise schedule)

module.exports = {
  statusStates: [
    { id: 'timezone',        siid: 8, piid: 1, nameKey: 'vacuum.status.timezone',        type: 'string', role: 'text' },
    { id: 'schedule',        siid: 8, piid: 2, nameKey: 'vacuum.status.schedule',        type: 'string', role: 'json' },
    { id: 'cruise-schedule', siid: 8, piid: 5, nameKey: 'vacuum.status.cruise-schedule', type: 'string', role: 'text' },
  ],
  remoteStates: [],
};
