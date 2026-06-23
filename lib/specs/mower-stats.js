'use strict';

// SIID 12 — Statistics (lifetime usage counters, read-only)
// Sources: createMowerRemotes

module.exports = {
  statusStates: [
    { id: 'first-mow-time',   siid: 12, piid: 1, nameKey: 'mower.status.first-mow-time',   type: 'number', role: 'value' },
    { id: 'total-mow-time',   siid: 12, piid: 2, nameKey: 'mower.status.total-mow-time',   type: 'number', role: 'value', unit: 'min' },
    { id: 'total-mow-count',  siid: 12, piid: 3, nameKey: 'mower.status.total-mow-count',  type: 'number', role: 'value' },
    { id: 'total-mow-area',   siid: 12, piid: 4, nameKey: 'mower.status.total-mow-area',   type: 'number', role: 'value', unit: 'm²' },
    { id: 'total-runtime',    siid: 12, piid: 5, nameKey: 'mower.status.total-runtime',    type: 'number', role: 'value', unit: 'min' },
    { id: 'total-cruise-time',siid: 12, piid: 6, nameKey: 'mower.status.total-cruise-time',type: 'number', role: 'value', unit: 'min' },
  ],
  remoteStates: [],
};
