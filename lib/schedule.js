'use strict';

// Reine Parsing-Logik fuer status.schedule (SIID 8-2). Stateless und ohne
// ioBroker-Zugriff, damit die Bit-Formeln unabhaengig vom Adapter getestet
// werden koennen (siehe test/schedule.test.js).
// Quelle der Feldformate/Bit-Layouts: SHORTCUTS_SCHEDULE_ANALYSE.md, Runden 1-4.

// Feld[3]-Bitmaske: Index 0..6 = So..Sa (Cheatsheet, Zeile 43).
const WEEKDAY_MASK_ORDER = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
// Ausgabe Montag-zuerst fuer natuerlichere Lesbarkeit, unabhaengig von der Maskenreihenfolge.
const WEEKDAY_OUTPUT_ORDER = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

// Runde 3 Fazit: Saugkraft/Modus bei Raum-Terminen (Bits 16-19 / 20-23 von Feld[8]).
const ROOM_MODE = Object.freeze({ 0: 'vacuum', 1: 'mop', 2: 'vacuum-mop' });
const ROOM_SUCTION = Object.freeze({ 0: 'quiet', 1: 'standard', 2: 'strong', 3: 'max' });
// Runde 4 Fazit: "Alle Raeume"-Nibble-Karte von Feld[7] (n1=Saugkraft, n6=Modus, n7=Route).
// Saugkraft-Enum ist identisch zu Raum-Terminen (Vergleichstabelle Runde 4).
const ALL_ROOMS_MODE = Object.freeze({ 1: 'vacuum', 2: 'vacuum-mop', 3: 'mop', 4: 'mop-after-vacuum' });
const ALL_ROOMS_SUCTION = ROOM_SUCTION;
const ALL_ROOMS_ROUTE = Object.freeze({ 1: 'standard', 4: 'fast' });

/**
 * Loest die 7-Zeichen-Wochentagsmaske (Feld[3]) in eine kurze, lesbare Liste auf.
 * Alle 7 Bits gesetzt -> "taeglich" (Cheatsheet-Konvention).
 * @param {string} mask - 7 Zeichen "0"/"1", Index 0..6 = So..Sa
 * @returns {string} "taeglich" oder z.B. "Mo,Mi,Fr"
 */
function resolveWeekdays(mask) {
  if (mask === '1111111') return 'taeglich';
  const active = [];
  for (const label of WEEKDAY_OUTPUT_ORDER) {
    const idx = WEEKDAY_MASK_ORDER.indexOf(label);
    if (mask[idx] === '1') active.push(label);
  }
  return active.join(',');
}

/**
 * Dekodiert ein 32-Bit-Wort aus Feld[8] (ein Eintrag pro Raum bei Raum-Terminen).
 *
 * Bit-Layout (verifiziert gegen 5 Live-Messpunkte aus Runde 3 Block 2-4, u.a.
 * Baseline 1126240517 / 0x43211105 -> segmentId=5, cycles=1, suction=1, mode=2,
 * moisture=16):
 *   Bits 0-7   segmentId (direkter Wert)
 *   Bits 8-11  cycles (direkter Wert 1-3)
 *   Bits 12-15 unklar, konstant 1 (wird nicht gespiegelt, siehe main.js-Parser)
 *   Bits 16-19 suction (Enum)
 *   Bits 20-23 mode (Enum)
 *   Bits 26-31 moisture (direkter Wert 1-32) — NICHT Bits 24-31/0xFF: die
 *   Analyse-Formel "High16 = Feuchtigkeit×1024 + Rest" platziert den Wert erst
 *   ab Bit 10 des High-16-Worts (=Bit 26 des Gesamtworts), Bits 24-25 gehoeren
 *   noch zum Saugkraft/Modus-"Rest" (siehe SHORTCUTS_SCHEDULE_ANALYSE.md Runde 3
 *   Block 3 "Formel geloest").
 *
 * @param {number} word
 * @returns {{segmentId:number, mode:string|null, suction:string|null, cycles:number, moisture:number}}
 */
function decodeRoomsWord(word) {
  const segmentId = word & 0xff;
  const cycles = (word >>> 8) & 0xf;
  const suction = (word >>> 16) & 0xf;
  const mode = (word >>> 20) & 0xf;
  const moisture = (word >>> 26) & 0x3f;
  return {
    segmentId,
    mode: ROOM_MODE[mode] ?? null,
    suction: ROOM_SUCTION[suction] ?? null,
    cycles,
    moisture,
  };
}

/**
 * Dekodiert das einzelne 32-Bit-Wort aus Feld[7] bei "Alle Raeume"-Terminen.
 *
 * Bit-Layout (Runde 4 Fazit, vollstaendige Nibble-Karte, verifiziert gegen
 * Baseline 297795617 / 0x11c00021 -> route=standard, mode=vacuum-mop,
 * suction=standard, cycles=1):
 *   Bits 0-3   route (Enum)
 *   Bits 4-7   mode (Enum, 4 Werte — andere Reihenfolge als bei Raum-Terminen)
 *   Bits 8-23  unklar, konstant "c-0-0-0" (wird nicht gespiegelt, siehe main.js-Parser)
 *   Bits 24-27 suction (Enum, identisch zu Raum-Terminen)
 *   Bits 28-31 cycles (direkter Wert 1-3)
 *
 * Feuchtigkeit liegt NICHT in diesem Wort, sondern als Klartext in Feld[6].
 *
 * @param {number} word
 * @returns {{mode:string|null, suction:string|null, cycles:number, route:string|null}}
 */
function decodeAllRoomsWord(word) {
  const route = word & 0xf;
  const mode = (word >>> 4) & 0xf;
  const suction = (word >>> 24) & 0xf;
  const cycles = (word >>> 28) & 0xf;
  return {
    mode: ALL_ROOMS_MODE[mode] ?? null,
    suction: ALL_ROOMS_SUCTION[suction] ?? null,
    cycles,
    route: ALL_ROOMS_ROUTE[route] ?? null,
  };
}

/**
 * Leitet den Termin-Typ aus den 9 "-"-getrennten Feldern ab (Cheatsheet
 * "Konsequenzen fuer die Umsetzung" + Runde 3 Fazit).
 * @param {string[]} fields - 9 Elemente, Index 0-8
 * @returns {'rooms'|'shortcut'|'all_rooms'|null} null bei unbekanntem Muster
 */
function detectScheduleType(fields) {
  const f6 = fields[6];
  const f7 = fields[7];
  const f8 = fields[8];
  if (f7 === '0' && f8 !== '0') return 'rooms';
  if (f7 !== '0' && f8 === '0' && f6 === '0') return 'shortcut';
  if (f7 !== '0' && f8 === '0' && f6 !== '0') return 'all_rooms';
  return null;
}

/**
 * Parst ein einzelnes ";"-getrenntes Termin-Segment aus status.schedule.
 * @param {string} rawSegment - z.B. "5-1-07:00-0101010-1-1-0-0-1126240517"
 * @returns {object|null} Termin-Objekt oder null bei unerwartetem Format
 */
function parseScheduleSegment(rawSegment) {
  const fields = rawSegment.split('-');
  if (fields.length !== 9) return null;
  const type = detectScheduleType(fields);
  if (!type) return null;

  const result = {
    id: fields[0],
    enabled: fields[1] === '1',
    time: fields[2],
    weekdaysMask: fields[3],
    weekdays: resolveWeekdays(fields[3]),
    type,
    raw: rawSegment,
  };

  if (type === 'shortcut') {
    // shortcut_id = Feld[7] / 256 (Cheatsheet Zeile 47 / Runde 2 Block 2)
    result.shortcutId = parseInt(fields[7], 10) >>> 8;
  } else if (type === 'rooms') {
    result.rooms = fields[8].split(',').map((w) => decodeRoomsWord(parseInt(w, 10)));
  } else if (type === 'all_rooms') {
    const decoded = decodeAllRoomsWord(parseInt(fields[7], 10));
    result.parameters = {
      mode: decoded.mode,
      suction: decoded.suction,
      cycles: decoded.cycles,
      route: decoded.route,
      moisture: parseInt(fields[6], 10),
    };
  }

  return result;
}

/**
 * Parst den kompletten status.schedule-Blob in eine Liste von Termin-Objekten.
 * Leerer String -> keine Termine (kein Crash, kein 1-Element-Ergebnis).
 * @param {string} rawBlob
 * @returns {object[]}
 */
function parseScheduleBlob(rawBlob) {
  if (!rawBlob) return [];
  return rawBlob
    .split(';')
    .map((segment) => parseScheduleSegment(segment))
    .filter((r) => r !== null);
}

module.exports = {
  resolveWeekdays,
  decodeRoomsWord,
  decodeAllRoomsWord,
  detectScheduleType,
  parseScheduleSegment,
  parseScheduleBlob,
};
