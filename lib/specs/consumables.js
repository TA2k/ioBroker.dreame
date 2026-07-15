'use strict';

// SIID 9  — Main Brush
// SIID 10 — Side Brush
// SIID 11 — Filter
// SIID 16 — Sensor (cliff / wall)
// SIID 18 — Mop Pad
// SIID 26 — Dirty Water Tank
// SIID 30 — Wheel

module.exports = {
  statusStates: [
    // SIID 9 — Main Brush
    { id: 'main-brush-time-left', siid: 9,  piid: 1, nameKey: 'vacuum.status.main-brush-time-left', type: 'number', role: 'value', unit: 'h' },
    { id: 'main-brush-left',      siid: 9,  piid: 2, nameKey: 'vacuum.status.main-brush-left',      type: 'number', role: 'value', unit: '%' },
    // SIID 10 — Side Brush
    { id: 'side-brush-time-left', siid: 10, piid: 1, nameKey: 'vacuum.status.side-brush-time-left', type: 'number', role: 'value', unit: 'h' },
    { id: 'side-brush-left',      siid: 10, piid: 2, nameKey: 'vacuum.status.side-brush-left',      type: 'number', role: 'value', unit: '%' },
    // SIID 11 — Filter
    { id: 'filter-left',          siid: 11, piid: 1, nameKey: 'vacuum.status.filter-left',          type: 'number', role: 'value', unit: '%' },
    { id: 'filter-time-left',     siid: 11, piid: 2, nameKey: 'vacuum.status.filter-time-left',     type: 'number', role: 'value', unit: 'h' },
    // SIID 16 — Sensor
    { id: 'sensor-dirty-left',      siid: 16, piid: 1, nameKey: 'vacuum.status.sensor-dirty-left',      type: 'number', role: 'value', unit: '%' },
    { id: 'sensor-dirty-time-left', siid: 16, piid: 2, nameKey: 'vacuum.status.sensor-dirty-time-left', type: 'number', role: 'value', unit: 'h' },
    // SIID 18 — Mop Pad
    { id: 'mop-pad-left',      siid: 18, piid: 1, nameKey: 'vacuum.status.mop-pad-left',      type: 'number', role: 'value', unit: '%' },
    { id: 'mop-pad-time-left', siid: 18, piid: 2, nameKey: 'vacuum.status.mop-pad-time-left', type: 'number', role: 'value', unit: 'h' },
    // SIID 26 — Dirty Water Tank
    { id: 'dirty-water-tank-left',      siid: 26, piid: 1, nameKey: 'vacuum.status.dirty-water-tank-left',      type: 'number', role: 'value', unit: '%' },
    { id: 'dirty-water-tank-time-left', siid: 26, piid: 2, nameKey: 'vacuum.status.dirty-water-tank-time-left', type: 'number', role: 'value', unit: 'h' },
    // SIID 30 — Wheel
    { id: 'wheel-dirty-time-left', siid: 30, piid: 1, nameKey: 'vacuum.status.wheel-dirty-time-left', type: 'number', role: 'value', unit: 'h' },
    { id: 'wheel-dirty-left',      siid: 30, piid: 2, nameKey: 'vacuum.status.wheel-dirty-left',      type: 'number', role: 'value', unit: '%' },
  ],
  remoteStates: [],
};
