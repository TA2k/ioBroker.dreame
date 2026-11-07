'use strict';

// Property meanings from maestrea76/HA-Dreame-SF25-WiFi-Integration,
// commit 6dfb9aaa4f77088731ac97c526d56584612c3ac7 (MIT).
const MODEL = 'dreame.fwd.u2527';
const isSF25 = (device) => device?.model === MODEL;

const properties = [
  { siid: 2, piid: 1, id: 'state', states: { 1: 'Working', 2: 'Standby', 3: 'Sleeping' } },
  { siid: 2, piid: 2, id: '2-2' }, // Meaning not yet established.
  { siid: 2, piid: 3, id: 'program', remote: true, states: { '-1': 'Idle', 0: 'Processing', 1: 'Extra drying', 2: 'Self-cleaning' } },
  { siid: 2, piid: 10, id: 'running-state', states: { '-1': 'Off', 0: 'Paused', 1: 'Running' } },
  { siid: 2, piid: 11, id: 'remaining-time', unit: 'min', role: 'value.interval' },
  { siid: 3, piid: 2, id: 'humidity', unit: '%', role: 'value.humidity' },
  { siid: 3, piid: 3, id: 'temperature', unit: '°C', role: 'value.temperature' },
  { siid: 3, piid: 14, id: 'energy', unit: 'Wh', role: 'value.energy' },
  { siid: 4, piid: 3, id: 'carbon-filter-life', unit: '%' },
  { siid: 4, piid: 4, id: 'carbon-filter-days', unit: 'd' },
  { siid: 4, piid: 6, id: '4-6' }, // Meaning not yet established.
  { siid: 6, piid: 10, id: 'child-lock', remote: true, type: 'boolean', role: 'switch' },
  { siid: 6, piid: 17, id: 'silent-mode', remote: true, type: 'boolean', role: 'switch' },
  { siid: 6, piid: 26, id: 'lid-open', type: 'boolean', role: 'sensor.door' },
];

function buildSF25Lookup(did) {
  const propsToId = {};
  const metaMap = {};
  const statusList = [];
  for (const p of properties) {
    const key = `${p.siid}-${p.piid}`;
    propsToId[key] = `${did}.${p.remote ? 'remote' : 'status'}.${p.id}`;
    metaMap[key] = {
      nameKey: `sf25.${p.id}`, type: p.type || 'number', role: p.role || 'value',
      unit: p.unit, write: !!p.remote,
      stateKeys: p.states && Object.fromEntries(Object.keys(p.states).map((v) => [v, `sf25.${p.id}.${v}`])),
      decode: p.type === 'boolean' ? (v) => Number(v) !== 0 : undefined,
    };
    // SF25 uses the property address, not the device ID, inside params.
    statusList.push({ did: `${p.siid}.${p.piid}`, siid: p.siid, piid: p.piid });
  }
  return { propsToId, metaMap, statusList };
}

function rpcPath(device) {
  const host = String(device.bindDomain || '').split(':')[0].split('.')[0];
  if (host && !/^[a-zA-Z0-9-]+$/.test(host)) throw new Error('Invalid SF25 bindDomain');
  return `/dreame-iot-com${host ? `-${host}` : ''}/device/sendCommand`;
}

function statusTopic(device) {
  // Current adapter uses the EU cloud. Use the device owner's UID for shares.
  if (device.masterUid == null || String(device.masterUid) === '') throw new Error('SF25 masterUid missing');
  return `/status/${device.did}/${device.masterUid}/${MODEL}/eu/`;
}

function commandFor(name, value) {
  const switches = { 'child-lock': [6, 10], 'silent-mode': [6, 17] };
  if (name === 'program') {
    // Extra drying is observed as an automatic phase; direct start unverified.
    if (typeof value !== 'number' || ![-1, 0, 2].includes(value)) throw new Error('Unsupported SF25 program');
    return { siid: 2, piid: 3, value };
  }
  if (switches[name]) {
    if (typeof value !== 'boolean') throw new Error('SF25 switch expects a boolean');
    const [siid, piid] = switches[name];
    return { siid, piid, value: value ? 1 : 0 };
  }
  if (name === 'pause' || name === 'resume') return { siid: 2, piid: 10, value: name === 'pause' ? 0 : 1 };
  throw new Error('Unknown SF25 command');
}

module.exports = { MODEL, isSF25, properties, buildSF25Lookup, rpcPath, statusTopic, commandFor };
