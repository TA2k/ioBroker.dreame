'use strict';

const assert = require('node:assert/strict');
const { describe, it, before } = require('mocha');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const { SF25Controller } = require('../lib/sf25');
const { isSF25, buildSF25Lookup, rpcPath, statusTopic, commandFor } = require('../lib/specs/sf25');

const device = { did: '123', model: 'dreame.fwd.u2527', bindDomain: 'app.mt.eu.iot.dreame.tech:19973', masterUid: 'owner' };
const prop = (siid, piid, value, code = 0) => ({ siid, piid, value, code });

function harness(results = []) {
  /** @type {any} */
  const context = new SF25Controller({});
  context.adapter = context;
  const lookup = buildSF25Lookup(device.did);
  Object.assign(context, {
    specPropsToIdDict: { 123: lookup.propsToId }, specMetaDict: {}, specActionsToIdDict: {},
    specStatusDict: { 123: lookup.statusList }, namespace: 'dreame.0',
    brand: { domain: 'eu.iot.dreame.tech:13267' },
    getHeaders: () => ({}), setTimeout: (callback) => callback(),
    calls: [], values: [], objects: [], reachability: [], buttons: [], warnings: [],
    log: { warn: (text) => context.warnings.push(text) },
    _propertyChanged: () => {},
    _lazyCreateState: async (did, siid, piid, value) => context.values.push({ did, siid, piid, value }),
    _updateReachability: async (d, online) => context.reachability.push(online),
    extendObject: async (id, object) => context.objects.push({ id, object }),
    setStateAsync: async (...args) => context.buttons.push(args),
    requestClient: async (request) => {
      context.calls.push(request);
      const result = results.shift();
      if (result instanceof Error) throw result;
      return result || { data: { code: 0, data: { result: [] } } };
    },
  });
  return context;
}
const reply = (result) => ({ data: { code: 0, data: { result } } });

describe('SF25 protocol and state handling', () => {
  it('recognizes only the known FWD model', () => {
    assert.equal(isSF25(device), true);
    for (const model of ['dreame.vacuum.r2320', 'dreame.mower.p2255', 'dreame.fwd.other']) assert.equal(isSF25({ model }), false);
    assert.equal(isSF25(null), false);
  });
  it('keeps tri-state and raw unknown properties separate from vacuum meanings', () => {
    const lookup = buildSF25Lookup('123');
    assert.equal(lookup.statusList.length, 14);
    assert.equal(lookup.propsToId['3-3'], '123.status.temperature');
    assert.equal(lookup.propsToId['2-10'], '123.status.running-state');
    assert.equal(lookup.metaMap['2-10'].type, 'number');
    assert.equal(lookup.metaMap['2-2'].write, false);
    assert.equal(lookup.metaMap['6-26'].write, false);
    assert.equal(lookup.propsToId['3-1'], undefined);
    assert.equal(lookup.statusList.find((p) => p.siid === 3 && p.piid === 3)?.did, '3.3');
  });
  it('uses device binding for RPC and owner UID for MQTT', () => {
    assert.equal(rpcPath(device), '/dreame-iot-com-app/device/sendCommand');
    assert.equal(rpcPath({}), '/dreame-iot-com/device/sendCommand');
    assert.equal(statusTopic(device), '/status/123/owner/dreame.fwd.u2527/eu/');
    assert.throws(() => statusTopic({ ...device, masterUid: null }));
    assert.throws(() => rpcPath({ bindDomain: 'bad/host' }));
  });
  it('rejects unverified programs and coerced switch values before transmission', () => {
    for (const value of [1, 3, '0', null, false, NaN]) assert.throws(() => commandFor('program', value));
    for (const value of [1, 'false', null]) assert.throws(() => commandFor('child-lock', value));
    assert.deepEqual(commandFor('child-lock', true), { siid: 6, piid: 10, value: 1 });
    assert.deepEqual(commandFor('resume', true), { siid: 2, piid: 10, value: 1 });
    assert.throws(() => commandFor('open-lid', true));
  });
  it('creates commands without inheriting robot actions', async () => {
    const c = harness();
    await c.createSF25Remotes(device);
    assert.equal(c.objects.length, 8);
    assert(c.objects.some((o) => o.id === '123.remote.pause'));
    assert(c.objects.some((o) => o.id === '123.remote.open-lid' && o.object.common.role === 'button'));
    assert(!c.objects.some((o) => /map|mop|battery|start/.test(o.id)));
  });
  it('polls explicit successes and discards errors, unknown addresses and invalid values', async () => {
    const c = harness([reply([prop(3, 3, 42), prop(3, 2, 90, 1), prop(88, 1, 4), prop(4, 3, null), prop(4, 4, 'bad')])]);
    await c.updateSF25(device);
    assert.deepEqual(c.values, [{ did: '123', siid: 3, piid: 3, value: 42 }]);
    assert.equal(c.calls[0].data.data.params.length, 14);
    assert.equal(c.calls[0].data.did, '123');
  });
  it('does not accept a poll result without a property success code', async () => {
    const c = harness([reply([{ siid: 3, piid: 3, value: 42 }])]);
    await c.updateSF25(device);
    assert.equal(c.values.length, 0);
  });
  it('accepts MQTT updates without code and resolves property addresses to the device', async () => {
    const c = harness();
    await c._sf25ApplyProperties(device, [{ did: '6.26', siid: 6, piid: 26, value: 1 }], true);
    assert.deepEqual(c.values, [{ did: '123', siid: 6, piid: 26, value: 1 }]);
  });
  it('keeps a push arriving during a poll instead of overwriting it with the poll', async () => {
    const c = harness();
    const start = Date.now();
    await c._sf25ApplyProperties(device, [prop(6, 26, 1)], true);
    await c._sf25ApplyProperties(device, [prop(6, 26, 0)], false, start);
    assert.equal(c.values.length, 1);
    assert.equal(c.values[0].value, 1);
  });
  it('shows standby after cycle end despite retained program and running flags', async () => {
    const c = harness();
    await c._sf25ApplyProperties(device, [prop(2, 1, 1), prop(2, 3, 0), prop(2, 10, 1)]);
    assert.deepEqual(c.buttons.at(-1), ['123.status.activity', 1, true]);
    await c._sf25ApplyProperties(device, [prop(2, 1, 2), prop(2, 3, 1), prop(2, 10, 1)], true);
    assert.deepEqual(c.buttons.at(-1), ['123.status.activity', 0, true]);
    assert.deepEqual(c.values.at(-1), { did: '123', siid: 2, piid: 10, value: 1 });
  });
  it('derives pause and sleep from separate MQTT updates without changing raw states', async () => {
    const c = harness();
    await c._sf25ApplyProperties(device, [prop(2, 1, 1)], true);
    assert.equal(c.buttons.at(-1)[1], -1);
    await c._sf25ApplyProperties(device, [prop(2, 10, 0)], true);
    assert.equal(c.buttons.at(-1)[1], 2);
    await c._sf25ApplyProperties(device, [prop(2, 1, 3)], true);
    assert.equal(c.buttons.at(-1)[1], 3);
    await c._sf25ApplyProperties(device, [prop(2, 10, 1)], true);
    assert.equal(c.buttons.at(-1)[1], 3);
  });
  it('does not derive activity from failed, invalid or stale poll properties', async () => {
    const c = harness();
    await c._sf25ApplyProperties(device, [prop(2, 1, 2)], true);
    const writes = c.buttons.length;
    await c._sf25ApplyProperties(device, [prop(2, 1, 1)], false, Date.now() - 1000);
    await c._sf25ApplyProperties(device, [prop(2, 1, 1, 1), prop(2, 10, '1')]);
    assert.equal(c.buttons.length, writes);
    assert.equal(c.buttons.at(-1)[1], 0);
  });
  it('writes numeric booleans once, checks readback and disables transport retries', async () => {
    const c = harness([reply([prop(6, 17, undefined)]), reply([prop(6, 17, 1)])]);
    await c._sf25Write(device, commandFor('silent-mode', true));
    assert.deepEqual(c.calls[0].data.data.params, [{ did: '6.17', siid: 6, piid: 17, value: 1 }]);
    assert.equal(c.calls[0]['axios-retry'].retries, 0);
    assert.equal(c.calls[1].data.data.method, 'get_properties');
  });
  const lidPreflight = (temperature = 40) => [prop(2, 1, 2), prop(2, 3, -1), prop(2, 10, -1), prop(3, 3, temperature)];
  it('opens the lid only after fresh idle readings and confirms lid readback', async () => {
    const c = harness([reply(lidPreflight()), reply([prop(6, 26, undefined)]), reply([prop(6, 26, 1)])]);
    await c.handleSF25State(device, 'dreame.0.123.remote.open-lid', { val: true, ack: false });
    assert.equal(c.warnings.length, 0);
    assert.deepEqual(c.calls[0].data.data.params.map((p) => p.did), ['2.1', '2.3', '2.10', '3.3']);
    assert.deepEqual(c.calls[1].data.data.params, [{ did: '6.26', siid: 6, piid: 26, value: 1 }]);
    assert.equal(c.calls[1]['axios-retry'].retries, 0);
    assert.deepEqual(c.buttons.at(-1), ['dreame.0.123.remote.open-lid', false, true]);
  });
  it('blocks lid opening while hot, working, paused, sleeping or retaining old running flags', async () => {
    for (const [index, value] of [[3, 41], [0, 1], [0, 3], [1, 0], [1, 1], [2, 0], [2, 1]]) {
      const readings = lidPreflight();
      readings[index].value = value;
      const c = harness([reply(readings)]);
      await assert.rejects(c._sf25OpenLid(device), /lid opening requires/);
      assert.equal(c.calls.length, 1);
    }
  });
  it('fails closed on missing, failed, duplicate or nonnumeric lid preflight values', async () => {
    for (let index = 0; index < 4; index++) {
      for (const invalid of ['missing', 'failed', 'duplicate', 'string', 'nan', 'infinity']) {
        const readings = lidPreflight();
        if (invalid === 'missing') readings.splice(index, 1);
        else if (invalid === 'failed') readings[index].code = 1;
        else if (invalid === 'duplicate') readings.push({ ...readings[index] });
        else readings[index].value = invalid === 'string' ? String(readings[index].value) : invalid === 'nan' ? NaN : Infinity;
        const c = harness([reply(readings)]);
        await assert.rejects(c._sf25OpenLid(device), /lid opening requires/);
        assert.equal(c.calls.length, 1);
      }
    }
  });
  it('does not use cached standby data when the fresh lid preflight fails', async () => {
    const c = harness([new Error('offline')]);
    await c._sf25ApplyProperties(device, lidPreflight());
    await c.handleSF25State(device, 'dreame.0.123.remote.open-lid', { val: true, ack: false });
    assert.equal(c.calls.length, 1);
    assert(c.warnings.some((text) => text.includes('offline')));
    assert.deepEqual(c.buttons.at(-1), ['dreame.0.123.remote.open-lid', false, true]);
  });
  it('never wakes or retries a rejected or uncertain lid write', async () => {
    for (const response of [reply([prop(6, 26, undefined, 1)]), reply([]), new Error('timeout')]) {
      const c = harness([reply(lidPreflight()), response]);
      await assert.rejects(c._sf25OpenLid(device));
      assert.deepEqual(c.calls.map((r) => r.data.data.method), ['get_properties', 'set_properties']);
    }
  });
  it('does not repeat an accepted lid command when opening is not confirmed', async () => {
    const c = harness([reply(lidPreflight()), reply([prop(6, 26, undefined)]), reply([prop(6, 26, 0)])]);
    await assert.rejects(c._sf25OpenLid(device), /not confirmed/);
    assert.equal(c.calls.filter((r) => r.data.data.method === 'set_properties').length, 1);
  });
  it('ignores false or acknowledged lid buttons and refuses concurrent commands', async () => {
    const c = harness();
    const id = 'dreame.0.123.remote.open-lid';
    await c.handleSF25State(device, id, { val: false, ack: false });
    await c.handleSF25State(device, id, { val: true, ack: true });
    c.busy.add('123');
    await c.handleSF25State(device, id, { val: true, ack: false });
    assert.equal(c.calls.length, 0);
    assert(c.warnings.some((text) => text.includes('already in progress')));
  });
  it('retries a sleep rejection once after wake and verifies awake status', async () => {
    const c = harness([
      reply([prop(6, 17, undefined, 1)]), reply([prop(2, 1, 3)]), reply(undefined),
      reply([prop(2, 1, 2)]), reply([prop(6, 17, undefined)]), reply([prop(6, 17, 1)]),
    ]);
    await c._sf25Write(device, commandFor('silent-mode', true));
    assert.deepEqual(c.calls.map((r) => r.data.data.method), ['set_properties', 'get_properties', 'action', 'get_properties', 'set_properties', 'get_properties']);
    assert.deepEqual(c.calls[2].data.data.params, { did: '123', siid: 2, aiid: 1, in: [] });
  });
  it('does not wake or retry a rejection while already awake', async () => {
    const c = harness([reply([prop(2, 3, undefined, 1)]), reply([prop(2, 1, 2)])]);
    await assert.rejects(c._sf25Write(device, commandFor('program', 0)), /rejected/);
    assert.equal(c.calls.length, 2);
  });
  it('continues a sleeping write only after wake code 80001 is confirmed by device status', async () => {
    const c = harness([
      reply([prop(6, 17, undefined, 1)]), reply([prop(2, 1, 3)]), { data: { code: 80001 } },
      reply([prop(2, 1, 3)]), reply([prop(2, 1, 2)]),
      reply([prop(6, 17, undefined)]), reply([prop(6, 17, 1)]),
    ]);
    await c._sf25Write(device, commandFor('silent-mode', true));
    assert.equal(c.calls.filter((r) => r.data.data.method === 'action').length, 1);
    assert.equal(c.calls.filter((r) => r.data.data.method === 'set_properties').length, 2);
    assert.equal(c.reachability.at(-1), true);
  });
  it('does not retry a sleeping write when wake code 80001 remains unconfirmed', async () => {
    const c = harness([
      reply([prop(6, 17, undefined, 1)]), reply([prop(2, 1, 3)]), { data: { code: 80001 } },
      reply([prop(2, 1, 3)]), reply([prop(2, 1, 3)]), reply([prop(2, 1, 3)]),
    ]);
    await assert.rejects(c._sf25Write(device, commandFor('silent-mode', true)), /wake not confirmed/);
    assert.equal(c.calls.filter((r) => r.data.data.method === 'set_properties').length, 1);
    assert.equal(c.calls.filter((r) => r.data.data.method === 'action').length, 1);
  });
  it('preserves other wake failures instead of treating them as success', async () => {
    for (const response of [{ data: { code: -8 } }, new Error('timeout')]) {
      const c = harness([response]);
      await assert.rejects(c._sf25Wake(device));
      assert.equal(c.calls.length, 1);
    }
  });
  it('waits for delayed switch readback without resending the accepted write', async () => {
    const c = harness([
      reply([prop(6, 17, undefined)]), reply([prop(6, 17, 1)]),
      reply([prop(6, 17, 1)]), reply([prop(6, 17, 0)]),
    ]);
    await c._sf25Write(device, commandFor('silent-mode', false));
    assert.equal(c.calls.filter((r) => r.data.data.method === 'set_properties').length, 1);
    assert.equal(c.calls.filter((r) => r.data.data.method === 'get_properties').length, 3);
    assert.equal(c.values.at(-1).value, 0);
  });
  it('requires a valid successful numeric readback even after waiting', async () => {
    const c = harness([
      reply([prop(6, 17, undefined)]), reply([prop(6, 17, 1, 1)]),
      reply([prop(6, 17, '1')]), reply([prop(6, 17, NaN)]),
    ]);
    await assert.rejects(c._sf25Write(device, commandFor('silent-mode', true)), /not confirmed/);
    assert.equal(c.calls.filter((r) => r.data.data.method === 'set_properties').length, 1);
    assert.equal(c.values.length, 0);
  });
  it('does not retry other failures or mismatched readback', async () => {
    for (const results of [
      [reply([prop(2, 3, undefined, -1)])],
      [reply([])],
      [new Error('timeout')],
      [reply([prop(2, 3, undefined)]), reply([prop(2, 3, -1)])],
    ]) {
      const c = harness(results);
      await assert.rejects(c._sf25Write(device, commandFor('program', 0)));
      assert.equal(c.calls.filter((r) => r.data.data.method === 'set_properties').length, 1);
    }
  });
  it('reports offline and rejects missing or malformed results', async () => {
    const c = harness([{ data: { code: 80001 } }]);
    await assert.rejects(c.updateSF25(device), /80001/);
    assert.deepEqual(c.reachability, [false]);
    for (const result of [undefined, {}, 'ok']) {
      await assert.rejects(harness([reply(result)]).updateSF25(device));
    }
  });
  it('ignores acked values and false button resets', async () => {
    const c = harness();
    await c.handleSF25State(device, 'dreame.0.123.remote.program', { val: 0, ack: true });
    await c.handleSF25State(device, 'dreame.0.123.remote.pause', { val: false, ack: false });
    assert.equal(c.calls.length, 0);
  });
  it('prevents concurrent commands and resets buttons after failure', async () => {
    const c = harness([new Error('timeout')]);
    c.busy = new Set(['123']);
    await c.handleSF25State(device, 'dreame.0.123.remote.program', { val: 0, ack: false });
    assert.equal(c.calls.length, 0);
    c.busy.clear();
    await c.handleSF25State(device, 'dreame.0.123.remote.pause', { val: true, ack: false });
    assert.equal(c.busy.size, 0);
    assert.deepEqual(c.buttons, [['dreame.0.123.remote.pause', false, true]]);
  });
});

describe('SF25 adapter integration', () => {
  let Adapter;
  before(function () {
    // Loading the real adapter and its dependencies can exceed 2 s on a cold disk.
    this.timeout(10000);
    // Load the real adapter methods without starting ioBroker or a cloud login.
    const filename = path.join(__dirname, '../main.js');
    const realRequire = createRequire(filename);
    const sandbox = {
      module: { exports: {} }, __dirname: path.dirname(filename),
      require: (name) => name === '@iobroker/adapter-core'
        ? { Adapter: class {}, I18n: { getTranslatedObject: (key) => ({ en: key }), translate: (key) => key } } : realRequire(name),
    };
    vm.runInNewContext(fs.readFileSync(filename, 'utf8') + '\nmodule.exports = Dreame;', sandbox, { filename });
    Adapter = sandbox.module.exports;
  });
  function adapter(results) {
    const c = harness(results);
    Object.setPrototypeOf(c, Adapter.prototype);
    c.sf25 = new SF25Controller(c);
    c.deviceArray = [device];
    c.states = {};
    c.specs = {};
    c.config = { getMap: true };
    c.log.info = c.log.debug = c.log.error = () => {};
    c.json2iob = { parse: () => {} };
    return c;
  }
  it('routes the SF25 independently while retaining existing device types', () => {
    const c = adapter();
    assert.equal(c.getDeviceType(device), 'fwd');
    assert.equal(c.isVacuum(device), false);
    assert.equal(c.getDeviceType({ model: 'dreame.vacuum.r2320' }), 'vacuum');
    assert.equal(c.getDeviceType({ model: 'dreame.mower.p2255' }), 'mower');
    assert.equal(c.getDeviceType({ model: 'dreame.airp.p1' }), 'airp');
  });
  it('builds SF25 remotes without requiring an external MIoT spec', async () => {
    const c = adapter();
    await c.fetchSpecs();
    await c.createRemotes();
    assert.equal(c.calls.length, 0);
    assert.equal(c.specStatusDict[device.did].length, 14);
    assert(c.specMetaDict[device.did]['3-3']);
  });
  it('uses the SF25 poll even when robot map fetching is enabled', async () => {
    const c = adapter([reply([prop(3, 3, 42)])]);
    c.getMap = () => { throw new Error('SF25 must not fetch a robot map'); };
    await c.updateDevicesViaSpec();
    assert.equal(c.calls.length, 1);
    assert.equal(c.values[0].value, 42);
    await c._bridgeStatusSummary({ ...device, latestStatus: 999, battery: 80 });
    assert.equal(c.values.length, 1);
  });
  it('writes boolean SF25 states with the real state writer without robot specs', async () => {
    const c = adapter([reply([prop(6, 10, 1), prop(6, 17, 0), prop(6, 26, 1)])]);
    delete c._lazyCreateState;
    delete c.specs;
    c.specMetaDict[device.did] = buildSF25Lookup(device.did).metaMap;
    c.createdStates = new Set();
    c.compoundRaw = {};
    c.setState = (id, value, ack) => c.values.push({ id, value, ack });
    await c.sf25.updateSF25(device);
    assert.deepEqual(c.values, [
      { id: '123.remote.child-lock', value: true, ack: true },
      { id: '123.remote.silent-mode', value: false, ack: true },
      { id: '123.status.lid-open', value: true, ack: true },
    ]);
  });
  it('keeps SF25 out of robot widgets and skips initial map fetching', async () => {
    const c = adapter([{ data: { code: 0, data: { page: { records: [device] } } } }]);
    c.getMap = () => { throw new Error('must not fetch map'); };
    await c.getDeviceList();
    assert(!c.objects.some((o) => o.id === '123.map'));
    const list = c.buttons.find((args) => args[0] === 'info.devices');
    assert.equal(list[1], '[]');
    const tabList = c.buttons.find((args) => args[0] === 'info.sf25Devices');
    assert.deepEqual(JSON.parse(tabList[1]), [{ did: '123', name: device.model, typ: 'fwd' }]);
  });
  it('dispatches only the SF25 handler for its commands', async () => {
    const c = adapter();
    const calls = [];
    c.sf25.handleSF25State = async (...args) => calls.push(args);
    await c.onStateChange('dreame.0.123.remote.pause', { ack: false, val: true });
    assert.equal(calls.length, 1);
    assert.equal(calls[0][0].model, device.model);
  });
});
