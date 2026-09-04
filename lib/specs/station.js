'use strict';

// SIID 27 — Station Status (clean/dirty water tanks, dust bag, detergent, drainage, hot water)

// r2253c/r2253w (L20 Ultra) senden SIID 27/1 als Bit-Maske statt als Enum wie
// die X40-Reihe: Bit 1 (Wert 2) = Tank installiert, Bit 0 (Wert 1) = Tank voll.
// Bestaetigt in TA2k/ioBroker.dreame#126 durch luckyheiko (r2253c) und
// ralfheitz (r2253w). isR2253Model() wird auch von main.js (_lazyCreateState)
// fuer ein einmaliges Debug-Log bei Rohwert 1 wiederverwendet.
const R2253_MODEL_PREFIX = 'dreame.vacuum.r2253';
const isR2253Model = (device) => typeof device?.model === 'string' && device.model.startsWith(R2253_MODEL_PREFIX);

// Normalisiert r2253-Rohwerte auf die X40-Enum-Semantik (0=Installed,
// 1=Not installed, 2=Low water). Rohwert 1 (theoretisch "voll aber draussen",
// Uebergangs-/Fehlerzustand) faellt bewusst mit Rohwert 0 unter "Not installed"
// zusammen. Alle Nicht-r2253-Modelle: Rohwert unveraendert durchreichen.
const CLEAN_WATER_TANK_STATUS_DECODE = (raw, _mopPadLifting, device) => {
  if (!isR2253Model(device)) return raw;
  const installed = (raw & 2) !== 0;
  const full = (raw & 1) !== 0;
  if (!installed) return 1; // Not installed (deckt Rohwerte 0 und 1 ab)
  return full ? 0 : 2; // 0=Installed, 2=Low water
};

module.exports = {
  statusStates: [
    {
      id: 'clean-water-tank-status',
      siid: 27,
      piid: 1,
      nameKey: 'vacuum.status.clean-water-tank-status',
      type: 'number',
      role: 'value',
      stateKeys: { 0: 'common.installed', 1: 'common.not-installed', 2: 'common.low-water', 3: 'common.not-installed' },
      decode: CLEAN_WATER_TANK_STATUS_DECODE,
    },
    {
      id: 'dirty-water-tank-status',
      siid: 27,
      piid: 2,
      nameKey: 'vacuum.status.dirty-water-tank-status',
      type: 'number',
      role: 'value',
      stateKeys: { 0: 'common.installed', 1: 'common.not-installed-or-full' },
    },
    {
      id: 'dust-bag-status',
      siid: 27,
      piid: 3,
      nameKey: 'vacuum.status.dust-bag-status',
      type: 'number',
      role: 'value',
      stateKeys: { 0: 'common.installed', 1: 'common.not-installed', 2: 'common.check' },
    },
    { id: 'detergent-status',        siid: 27, piid: 4,  nameKey: 'vacuum.status.detergent-status',        type: 'number', role: 'value' },
    { id: 'station-drainage-status', siid: 27, piid: 5,  nameKey: 'vacuum.status.station-drainage-status', type: 'number', role: 'value' },
    { id: 'hot-water-status',        siid: 27, piid: 15, nameKey: 'vacuum.status.hot-water-status',        type: 'number', role: 'value' },
  ],
  remoteStates: [],
};
module.exports.isR2253Model = isR2253Model;
