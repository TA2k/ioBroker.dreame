// Test der lib/schedule.js Bit-Extraktion und Typ-Erkennung gegen echte
// Live-Messpunkte aus SHORTCUTS_SCHEDULE_ANALYSE.md (Runden 3+4).
const assert = require('assert');
const {
  resolveWeekdays,
  decodeRoomsWord,
  decodeAllRoomsWord,
  detectScheduleType,
  parseScheduleSegment,
  parseScheduleBlob,
} = require('../lib/schedule');

describe('lib/schedule', function () {
  it('resolveWeekdays: taeglich und Einzeltage', function () {
    assert.strictEqual(resolveWeekdays('1111111'), 'taeglich');
    assert.strictEqual(resolveWeekdays('0100000'), 'Mo'); // Runde 4 Baseline: nur Montag
    assert.strictEqual(resolveWeekdays('0101010'), 'Mo,Mi,Fr');
    assert.strictEqual(resolveWeekdays('0000000'), '');
  });

  it('decodeRoomsWord: Baseline (Runde 3 Block 1) segmentId=5 cycles=1 suction=standard mode=vacuum-mop moisture=16', function () {
    assert.deepStrictEqual(decodeRoomsWord(1126240517), {
      segmentId: 5,
      mode: 'vacuum-mop',
      suction: 'standard',
      cycles: 1,
      moisture: 16,
    });
  });

  it('decodeRoomsWord: Saugkraft Intensiv (Runde 3 Block 2)', function () {
    assert.deepStrictEqual(decodeRoomsWord(parseInt('43221105', 16)), {
      segmentId: 5,
      mode: 'vacuum-mop',
      suction: 'strong',
      cycles: 1,
      moisture: 16,
    });
  });

  it('decodeRoomsWord: Feuchtigkeit 10 (Runde 3 Block 3)', function () {
    assert.deepStrictEqual(decodeRoomsWord(723587333), {
      segmentId: 5,
      mode: 'vacuum-mop',
      suction: 'standard',
      cycles: 1,
      moisture: 10,
    });
  });

  it('decodeRoomsWord: Feuchtigkeit 32 Grenzfall (Runde 3 Block 3)', function () {
    assert.deepStrictEqual(decodeRoomsWord(2199982341), {
      segmentId: 5,
      mode: 'vacuum-mop',
      suction: 'standard',
      cycles: 1,
      moisture: 32,
    });
  });

  it('decodeRoomsWord: Zyklen 2 (Runde 3 Block 4)', function () {
    assert.deepStrictEqual(decodeRoomsWord(parseInt('43211205', 16)), {
      segmentId: 5,
      mode: 'vacuum-mop',
      suction: 'standard',
      cycles: 2,
      moisture: 16,
    });
  });

  it('decodeAllRoomsWord: Baseline (Runde 4 Block 1) route=standard mode=vacuum-mop suction=standard cycles=1', function () {
    assert.deepStrictEqual(decodeAllRoomsWord(297795617), {
      mode: 'vacuum-mop',
      suction: 'standard',
      cycles: 1,
      route: 'standard',
    });
  });

  it('detectScheduleType: rooms / shortcut / all_rooms', function () {
    // "5-1-07:00-0101010-1-1-0-0-1126240517" -> rooms
    assert.strictEqual(detectScheduleType(['5', '1', '07:00', '0101010', '1', '1', '0', '0', '1126240517']), 'rooms');
    // "7-1-08:00-0000100-1-1-0-8192-0" -> shortcut (8192/256=32)
    assert.strictEqual(detectScheduleType(['7', '1', '08:00', '0000100', '1', '1', '0', '8192', '0']), 'shortcut');
    // "1-1-09:00-0100000-1-0-16-297795617-0" -> all_rooms
    assert.strictEqual(
      detectScheduleType(['1', '1', '09:00', '0100000', '1', '0', '16', '297795617', '0']),
      'all_rooms',
    );
  });

  it('parseScheduleSegment: rooms-Termin komplett', function () {
    const r = parseScheduleSegment('5-1-07:00-0101010-1-1-0-0-1126240517');
    assert.strictEqual(r.id, '5');
    assert.strictEqual(r.enabled, true);
    assert.strictEqual(r.time, '07:00');
    assert.strictEqual(r.weekdays, 'Mo,Mi,Fr');
    assert.strictEqual(r.type, 'rooms');
    assert.deepStrictEqual(r.rooms, [{ segmentId: 5, mode: 'vacuum-mop', suction: 'standard', cycles: 1, moisture: 16 }]);
  });

  it('parseScheduleSegment: rooms-Termin mit Multi-Raum (Feld[8] komma-getrennt)', function () {
    const r = parseScheduleSegment('9-1-07:00-1111111-1-1-0-0-1126240517,723587333');
    assert.strictEqual(r.rooms.length, 2);
    assert.strictEqual(r.rooms[0].segmentId, 5);
    assert.strictEqual(r.rooms[0].moisture, 16);
    assert.strictEqual(r.rooms[1].moisture, 10);
  });

  it('parseScheduleSegment: shortcut-Termin', function () {
    const r = parseScheduleSegment('7-1-08:00-0000100-1-1-0-8192-0');
    assert.strictEqual(r.type, 'shortcut');
    assert.strictEqual(r.shortcutId, 32);
  });

  it('parseScheduleSegment: all_rooms-Termin komplett', function () {
    const r = parseScheduleSegment('1-1-09:00-0100000-1-0-16-297795617-0');
    assert.strictEqual(r.type, 'all_rooms');
    assert.deepStrictEqual(r.parameters, {
      mode: 'vacuum-mop',
      suction: 'standard',
      cycles: 1,
      route: 'standard',
      moisture: 16,
    });
  });

  it('parseScheduleBlob: leerer String -> leeres Array, kein Crash', function () {
    assert.deepStrictEqual(parseScheduleBlob(''), []);
  });

  it('parseScheduleBlob: mehrere Termine getrennt durch ";"', function () {
    const blob = '5-1-07:00-0101010-1-1-0-0-1126240517;7-1-08:00-0000100-1-1-0-8192-0';
    const result = parseScheduleBlob(blob);
    assert.strictEqual(result.length, 2);
    assert.strictEqual(result[0].type, 'rooms');
    assert.strictEqual(result[1].type, 'shortcut');
  });
});
