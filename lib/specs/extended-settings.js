'use strict';

// SIID 28 — Extended Settings
//
// AutoSwitch features (CleanGenius/SmartHost, UV, SmartDrying, HotWash, SuctionMax etc.)
// are NOT here — they use autoSwitchKey (piid 4-50 JSON blob), not direct siid/piid,
// and remain in createVacuumRemotes as autoSwitchRemotes.

module.exports = {
  statusStates: [
    { id: 'lds-state',                siid: 28, piid: 4,  nameKey: 'vacuum.status.lds-state',                type: 'number', role: 'value' },
    { id: 'dnd-disable-resume',       siid: 28, piid: 14, nameKey: 'vacuum.status.dnd-disable-resume',       type: 'number', role: 'value' },
    { id: 'dnd-disable-auto-empty',   siid: 28, piid: 15, nameKey: 'vacuum.status.dnd-disable-auto-empty',   type: 'number', role: 'value' },
    { id: 'dnd-reduce-volume',        siid: 28, piid: 16, nameKey: 'vacuum.status.dnd-reduce-volume',        type: 'number', role: 'value' },
    { id: 'dynamic-obstacle-cleaning',siid: 28, piid: 18, nameKey: 'vacuum.status.dynamic-obstacle-cleaning',type: 'number', role: 'value' },
    { id: 'smart-mop-washing',        siid: 28, piid: 22, nameKey: 'vacuum.status.smart-mop-washing',        type: 'number', role: 'value' },
    { id: 'side-brush-carpet-rotate', siid: 28, piid: 29, nameKey: 'vacuum.status.side-brush-carpet-rotate', type: 'number', role: 'value' },
  ],
  remoteStates: [
    { id: 'wetness-level',         siid: 28, piid: 1,  nameKey: 'vacuum.remote.wetness-level',         type: 'number',  role: 'level', min: 1, max: 32 },
    { id: 'clean-carpets-first',   siid: 28, piid: 2,  nameKey: 'vacuum.remote.clean-carpets-first',   type: 'boolean', role: 'switch' },
    { id: 'auto-lds-coverage',     siid: 28, piid: 3,  nameKey: 'vacuum.remote.auto-lds-coverage',     type: 'boolean', role: 'switch' },
    {
      id: 'cleangenius-mode',
      siid: 28,
      piid: 5,
      nameKey: 'vacuum.remote.cleangenius-mode',
      type: 'number',
      role: 'level',
      stateKeys: { 0: 'vacuum.cleangenius-mode.off', 1: 'vacuum.cleangenius-mode.routine', 2: 'vacuum.cleangenius-mode.deep' },
    },
    {
      id: 'water-temperature',
      siid: 28,
      piid: 8,
      nameKey: 'vacuum.remote.water-temperature',
      type: 'number',
      role: 'level',
      stateKeys: { 0: 'vacuum.water-temperature.cold', 1: 'vacuum.water-temperature.warm', 2: 'vacuum.water-temperature.hot', 3: 'vacuum.water-temperature.boiling' },
    },
    { id: 'silent-drying',           siid: 28, piid: 27, nameKey: 'vacuum.remote.silent-drying',           type: 'boolean', role: 'switch' },
    { id: 'hair-compression',        siid: 28, piid: 28, nameKey: 'vacuum.remote.hair-compression',        type: 'boolean', role: 'switch' },
    { id: 'mopping-with-detergent',  siid: 28, piid: 52, nameKey: 'vacuum.remote.mopping-with-detergent',  type: 'boolean', role: 'switch' },
  ],
};
