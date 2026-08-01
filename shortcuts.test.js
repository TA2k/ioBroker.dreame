'use strict';

const { expect } = require('chai');
const { parseShortcutList } = require('./lib/shortcuts');

// Real payload read from status.shortcuts of a dreame.vacuum.r95475.
const VACUUM_PAYLOAD =
  '[{"id":32,"name":"V29obnppbW1lciAtIEVzc2Vu"},' +
  '{"id":33,"name":"VMOkZ2xpY2ggLSBzYXVnZW4="},' +
  '{"id":34,"name":"VMOkZ2xpY2ggLSBTJlc="}]';

describe('parseShortcutList', () => {
  it('decodes base64 names from a vacuum payload', () => {
    const list = parseShortcutList(VACUUM_PAYLOAD);
    expect(list).to.have.lengthOf(3);
    expect(list.map((s) => s.id)).to.deep.equal([32, 33, 34]);
    expect(list.map((s) => s.name)).to.deep.equal(['Wohnzimmer - Essen', 'Täglich - saugen', 'Täglich - S&W']);
  });

  it('ignores the transient state field — no running flag is derived', () => {
    // The device reports state only as a short pulse when a shortcut is triggered
    // and never signals the end, so it must not surface as a state.
    const list = parseShortcutList([{ id: 1, name: Buffer.from('Kitchen').toString('base64'), state: '1' }]);
    expect(list).to.deep.equal([{ id: 1, name: 'Kitchen' }]);
  });

  it('ignores values that are not a shortcut list', () => {
    // Several released dreame.vacuum models declare 4-48 as a plain uint32.
    // Such devices must not get shortcut objects.
    expect(parseShortcutList('12345')).to.deep.equal([]);
    expect(parseShortcutList(12345)).to.deep.equal([]);
    expect(parseShortcutList('{"foo":1}')).to.deep.equal([]);
    expect(parseShortcutList(null)).to.deep.equal([]);
    expect(parseShortcutList(undefined)).to.deep.equal([]);
  });

  it('survives malformed JSON without throwing', () => {
    expect(parseShortcutList('[{"id":1,')).to.deep.equal([]);
  });

  it('skips entries without a usable id or name', () => {
    const list = parseShortcutList([
      { id: 1, name: Buffer.from('ok').toString('base64') },
      { name: Buffer.from('no id').toString('base64') },
      { id: 3 },
      { id: 4, name: 42 },
      null,
    ]);
    expect(list).to.have.lengthOf(1);
    expect(list[0].name).to.equal('ok');
  });

  it('accepts an already parsed array', () => {
    const list = parseShortcutList([{ id: 9, name: Buffer.from('Küche').toString('base64') }]);
    expect(list).to.deep.equal([{ id: 9, name: 'Küche' }]);
  });
});
