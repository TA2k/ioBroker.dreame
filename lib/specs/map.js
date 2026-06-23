'use strict';

// SIID 6 — Map (metadata/configuration properties only)
//
// piid 1, 2, 4, 5, 6, 13 are raw map-protocol binary/streaming fields handled
// via setMapInfos() — NOT stored as ioBroker states (internal protocol use).
// piid 3 (object_name) is the map-objects URL/reference pushed by the device
// and exposed as a readable state.
// piid 10 (map_recovery write command) is in PROPERTY_ALIASES only, not a state.

module.exports = {
  statusStates: [
    { id: 'map-object-name',     siid: 6, piid: 3,  nameKey: 'vacuum.status.map-object-name',     type: 'string', role: 'text' },
    { id: 'multi-floor-map',     siid: 6, piid: 7,  nameKey: 'vacuum.status.multi-floor-map',     type: 'number', role: 'value' },
    { id: 'map-list',            siid: 6, piid: 8,  nameKey: 'vacuum.status.map-list',            type: 'string', role: 'json' },
    { id: 'recovery-map-list',   siid: 6, piid: 9,  nameKey: 'vacuum.status.recovery-map-list',   type: 'string', role: 'json' },
    { id: 'map-recovery-status', siid: 6, piid: 11, nameKey: 'vacuum.status.map-recovery-status', type: 'number', role: 'value' },
    { id: 'map-backup-status',   siid: 6, piid: 14, nameKey: 'vacuum.status.map-backup-status',   type: 'number', role: 'value' },
    { id: 'wifi-map',            siid: 6, piid: 15, nameKey: 'vacuum.status.wifi-map',            type: 'string', role: 'text' },
  ],
  remoteStates: [],
};
