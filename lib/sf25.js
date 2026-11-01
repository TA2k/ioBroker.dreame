'use strict';

const { buildSF25Lookup, rpcPath, commandFor } = require('./specs/sf25');

class SF25Controller {
  constructor(adapter) {
    this.adapter = adapter;
    this.busy = new Set();
    this.activityInputs = new Map();
  }

  async createSF25Remotes(device) {
    const did = String(device.did);
    const lookup = buildSF25Lookup(did);
    this.adapter.specPropsToIdDict[did] = lookup.propsToId;
    this.adapter.specMetaDict[did] = lookup.metaMap;
    this.adapter.specStatusDict[did] = lookup.statusList;
    this.adapter.specActionsToIdDict[did] = {};
    for (const channel of ['status', 'remote']) {
      await this.adapter.extendObject(`${did}.${channel}`, { type: 'channel', common: { name: `SF25 ${channel}` }, native: {} });
    }
    await this.adapter.extendObject(`${did}.status.activity`, {
      type: 'state',
      common: {
        name: { en: 'Current activity (derived)', de: 'Aktueller Betrieb (abgeleitet)' },
        type: 'number', role: 'value', read: true, write: false,
        states: {
          '-1': 'Unknown', 0: 'Standby', 1: 'Running', 2: 'Paused', 3: 'Sleeping',
        },
      },
      native: {},
    });
    for (const name of ['Refresh', 'wake', 'pause', 'resume', 'open-lid']) {
      await this.adapter.extendObject(`${did}.remote.${name}`, {
        type: 'state',
        common: { name: name === 'Refresh' ? 'Refresh' : { en: name === 'open-lid' ? 'Open lid' : `SF25 ${name}`, de: { wake: 'Aufwecken', pause: 'Pausieren', resume: 'Fortsetzen', 'open-lid': 'Deckel öffnen' }[name] }, type: 'boolean', role: 'button', read: false, write: true, def: false },
        native: { did },
      });
    }
  }

  async _sf25Rpc(device, method, params, allowNoResult = false) {
    const id = Math.floor(Math.random() * 9000) + 1000;
    const did = String(device.did);
    const response = await this.adapter.requestClient({
      method: 'post', url: `https://${this.adapter.brand.domain}${rpcPath(device)}`,
      headers: this.adapter.getHeaders(),
      // Network errors after a write do not prove it failed at the device.
      'axios-retry': { retries: method === 'get_properties' ? 3 : 0 },
      data: { did, id, data: { did, id, method, params } },
    });
    const body = response?.data;
    if (body?.code !== 0) {
      if (body?.code === 80001 || body?.code === -8) await this.adapter._updateReachability(device, false);
      const error = new Error(`SF25 ${method} failed (code ${body?.code ?? 'missing'})`);
      error.code = body?.code;
      throw error;
    }
    const result = body.data?.result;
    if (result == null && !allowNoResult) throw new Error(`SF25 ${method} returned no result`);
    await this.adapter._updateReachability(device, true);
    return result;
  }

  async _sf25ApplyProperties(device, entries, push = false, pollStartedAt) {
    if (!Array.isArray(entries)) throw new Error('SF25 properties result is not an array');
    const did = String(device.did);
    const activity = this.activityInputs.get(did) || {};
    let activityChanged = false;
    for (const entry of entries) {
      if (!entry || (entry.code !== undefined && entry.code !== 0) || entry.value == null) continue;
      const key = `${entry.siid}-${entry.piid}`;
      if (!this.adapter.specPropsToIdDict[device.did]?.[key]) continue;
      if (typeof entry.value !== 'number' || !Number.isFinite(entry.value)) continue;
      this._sf25PushAt = this._sf25PushAt || {};
      const address = `${device.did}/${key}`;
      if (push) this._sf25PushAt[address] = Date.now();
      else if (pollStartedAt !== undefined && this._sf25PushAt[address] >= pollStartedAt) continue;
      this.adapter._propertyChanged(String(device.did), entry.siid, entry.piid, entry.value);
      await this.adapter._lazyCreateState(String(device.did), entry.siid, entry.piid, entry.value);
      if (key === '2-1' || key === '2-10') {
        activity[key] = entry.value;
        activityChanged = true;
      }
    }
    if (activityChanged) {
      this.activityInputs.set(did, activity);
      // Standby/sleep overrides retained phase and running flags after a cycle.
      // This indicates operation only, never completion or a safe temperature.
      const value = activity['2-1'] === 2 ? 0 : activity['2-1'] === 3 ? 3
        : activity['2-1'] === 1 && activity['2-10'] === 1 ? 1
          : activity['2-1'] === 1 && activity['2-10'] === 0 ? 2 : -1;
      await this.adapter.setStateAsync(`${did}.status.activity`, value, true);
    }
  }

  async updateSF25(device) {
    const list = this.adapter.specStatusDict[device.did] || [];
    for (let i = 0; i < list.length; i += 15) {
      const startedAt = Date.now();
      const result = await this._sf25Rpc(device, 'get_properties', list.slice(i, i + 15));
      if (!Array.isArray(result)) throw new Error('SF25 poll returned invalid result');
      // Poll results require explicit success. MQTT may omit the code.
      await this._sf25ApplyProperties(device, result.filter((entry) => entry?.code === 0), false, startedAt);
    }
  }

  async _sf25Wake(device) {
    try {
      await this._sf25Rpc(device, 'action', { did: String(device.did), siid: 2, aiid: 1, in: [] }, true);
    } catch (error) {
      // Observed on hardware: waking succeeds despite cloud code 80001.
      // Do not resend the action; the device status must confirm success.
      if (error.code !== 80001) throw error;
    }
    await this._sf25ConfirmProperty(device, 2, 1, (value) => [1, 2].includes(value), 'SF25 wake not confirmed');
  }

  async _sf25ConfirmProperty(device, siid, piid, matches, message) {
    for (let attempt = 0; attempt < 3; attempt++) {
      await new Promise((resolve) => this.adapter.setTimeout(resolve, 1500));
      const startedAt = Date.now();
      const read = await this._sf25Rpc(device, 'get_properties', [{ did: `${siid}.${piid}`, siid, piid }]);
      if (!Array.isArray(read)) throw new Error('SF25 readback returned invalid result');
      const confirmed = read.find((s) => s?.siid === siid && s.piid === piid && s.code === 0 && typeof s.value === 'number' && Number.isFinite(s.value));
      await this._sf25ApplyProperties(device, read.filter((s) => s?.code === 0), false, startedAt);
      if (confirmed && matches(confirmed.value)) return;
    }
    throw new Error(message);
  }

  async _sf25OpenLid(device) {
    // Conservative HA-side guard, not an appliance-specified cooling clearance.
    // Never rely on cached states or wake/retry a rejected lid command.
    const addresses = [[2, 1], [2, 3], [2, 10], [3, 3]];
    const startedAt = Date.now();
    const read = await this._sf25Rpc(device, 'get_properties', addresses.map(([siid, piid]) => ({ did: `${siid}.${piid}`, siid, piid })));
    if (!Array.isArray(read)) throw new Error('SF25 lid preflight returned invalid result');
    const values = addresses.map(([siid, piid]) => {
      const entries = read.filter((entry) => entry?.siid === siid && entry.piid === piid);
      const entry = entries.length === 1 ? entries[0] : undefined;
      return entry?.code === 0 && typeof entry.value === 'number' && Number.isFinite(entry.value) ? entry.value : undefined;
    });
    await this._sf25ApplyProperties(device, read.filter((entry) => entry?.code === 0), false, startedAt);
    const [status, program, running, temperature] = values;
    if (status !== 2 || program !== -1 || running !== -1 || temperature === undefined || temperature > 40) {
      throw new Error('SF25 lid opening requires fresh standby, stopped program/running flags and temperature at most 40 °C');
    }
    await this._sf25Write(device, { siid: 6, piid: 26, value: 1 }, false);
  }

  async _sf25Write(device, command, retrySleep = true) {
    const params = [{ did: `${command.siid}.${command.piid}`, ...command }];
    const write = async () => {
      const result = await this._sf25Rpc(device, 'set_properties', params);
      if (!Array.isArray(result)) throw new Error('SF25 write returned invalid result');
      return result.find((entry) => entry.siid === command.siid && entry.piid === command.piid);
    };
    let entry = await write();
    if (entry?.code === 1 && retrySleep) {
      const status = await this._sf25Rpc(device, 'get_properties', [{ did: '2.1', siid: 2, piid: 1 }]);
      if (Array.isArray(status) && status.some((s) => s.siid === 2 && s.piid === 1 && s.code === 0 && s.value === 3)) {
        await this._sf25Wake(device);
        entry = await write(); // Retry only a confirmed sleep rejection, once.
      }
    }
    if (entry?.code !== 0) throw new Error(`SF25 property ${command.siid}.${command.piid} rejected (code ${entry?.code ?? 'missing'})`);
    // Repeat reads for delayed device updates, never an accepted write.
    await this._sf25ConfirmProperty(device, command.siid, command.piid, (value) => value === command.value, 'SF25 command not confirmed by readback; not retrying');
  }

  async handleSF25State(device, id, state) {
    if (state.ack) return;
    const name = id.slice(`${this.adapter.namespace}.${device.did}.remote.`.length);
    if (!id.startsWith(`${this.adapter.namespace}.${device.did}.remote.`)) return;
    const button = ['Refresh', 'wake', 'pause', 'resume', 'open-lid'].includes(name);
    if (button && state.val !== true) return;
    const did = String(device.did);
    if (this.busy.has(did)) {
      this.adapter.log.warn('SF25 command already in progress; wait for completion');
      return;
    }
    this.busy.add(did);
    try {
      if (name === 'Refresh') await this.updateSF25(device);
      else if (name === 'wake') await this._sf25Wake(device);
      else if (name === 'open-lid') await this._sf25OpenLid(device);
      else await this._sf25Write(device, commandFor(name, state.val));
      if (name !== 'Refresh') await this.updateSF25(device);
    } catch (error) {
      this.adapter.log.warn(`SF25 command failed: ${error.message}`);
    } finally {
      this.busy.delete(did);
      if (button) await this.adapter.setStateAsync(id, false, true);
    }
  }
}

module.exports = { SF25Controller };
