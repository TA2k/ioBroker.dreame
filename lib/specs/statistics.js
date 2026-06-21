'use strict';

// SIID 12 — Cleaning Statistics

module.exports = {
  statusStates: [
    { id: 'first-cleaning-date', siid: 12, piid: 1, nameKey: 'vacuum.status.first-cleaning-date', type: 'number', role: 'date' },
    { id: 'total-cleaning-time', siid: 12, piid: 2, nameKey: 'vacuum.status.total-cleaning-time', type: 'number', role: 'value', unit: 'min' },
    { id: 'cleaning-count',      siid: 12, piid: 3, nameKey: 'vacuum.status.cleaning-count',      type: 'number', role: 'value' },
    { id: 'total-cleaned-area',  siid: 12, piid: 4, nameKey: 'vacuum.status.total-cleaned-area',  type: 'number', role: 'value', unit: 'm²' },
    { id: 'total-runtime',       siid: 12, piid: 5, nameKey: 'vacuum.status.total-runtime',       type: 'number', role: 'value', unit: 'min' },
    { id: 'total-cruise-time',   siid: 12, piid: 6, nameKey: 'vacuum.status.total-cruise-time',   type: 'number', role: 'value', unit: 'min' },
  ],
  remoteStates: [],
};
