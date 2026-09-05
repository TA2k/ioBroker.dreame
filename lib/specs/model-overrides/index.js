'use strict';

// Modell-spezifische Overrides fuer die von lib/specs/index.js (buildVacuumLookup)
// gebauten generischen Property-Dicts. Erlaubt es, einzelne Modell-Familien
// (z. B. r6001*, deren SIID 4 PIID 6/52/53 vom generischen Verhalten abweichen)
// zu korrigieren, ohne den generischen Lookup oder die statischen Fallback-Tabellen
// in main.js anzufassen. Siehe Issue #119 (ISSUE_119_ANALYSE.md Abschnitt 4.2/6).
//
// Aufrufstelle: Ende von createVacuumRemotes() in main.js, unmittelbar vor dem
// "Vacuum states created ..."-Log — zu diesem Zeitpunkt sind specPropsToIdDict[did],
// specMetaDict[did] und specStatusDict[did] vollstaendig befuellt, und fuer neu
// entfernte/umbenannte SIID-PIID-Kombinationen existiert noch kein ioBroker-Objekt
// (_lazyCreateState hat noch nicht gelaufen). Nicht frueher aufrufen - die
// statischen Fallback-Loops (statusStates/remoteStates/autoSwitchRemotes/
// actionStates) wuerden einen hier entfernten Eintrag sonst wieder anlegen.
//
// Seit Issue #119 Phase 2b aktiv fuer r6001 (REMOVE 4-52, RENAME 4-53 - siehe
// ./r6001.js). Familien ohne Eintrag in FAMILY_OVERRIDES (r2253, r9419, und jedes
// unbekannte Modell -> getModelFamily liefert null) bleiben unveraendert.

// Prefix-Tabelle fuer die Modell-Familienerkennung, analog MODEL_IV_TABLE in
// lib/dreame.js. "Familie" ist orthogonal zur Geraeteart (getDeviceType) - ein
// r6001* ist weiterhin ein vacuum, nur mit abweichenden Property-Details.
const MODEL_FAMILY_TABLE = [
  { prefix: 'dreame.vacuum.r6001', family: 'r6001' },
  { prefix: 'dreame.vacuum.r2253', family: 'r2253' },
  { prefix: 'dreame.vacuum.r9419', family: 'r9419' },
];

// Dispatcher: Familie -> Array von Override-Objekten. Wird erst befuellt, sobald
// eine Familie tatsaechlich Overrides braucht.
const FAMILY_OVERRIDES = {
  r6001: require('./r6001'),
  // r2253: require('./r2253'),   // future
};

/**
 * @param {{model?: string}} device
 * @returns {string|null} family key (e.g. 'r6001', 'r2253') or null if no family matches
 */
function getModelFamily(device) {
  if (!device || !device.model) return null;
  const m = String(device.model).toLowerCase();
  const entry = MODEL_FAMILY_TABLE.find(e => m.startsWith(e.prefix));
  return entry ? entry.family : null;
}

/**
 * Mutiert props/meta/status in place fuer die gegebene Modell-Familie. Kein
 * Rueckgabewert, keine ioBroker-API-Aufrufe (ausser optionaler Alt-State-Migration
 * innerhalb eines Override-Eintrags, falls spaeter noetig).
 *
 * @param {string} family
 * @param {string} did
 * @param {{
 *   props:  Object<string, string>,
 *   meta:   Object<string, object>,
 *   status: Object<string, Array<object>>,
 * }} dicts
 * @param {{
 *   translate: (key: string) => string,
 *   log: object,
 * }} ctx
 */
function applyModelOverrides(family, did, dicts, ctx) {
  const overrides = FAMILY_OVERRIDES[family];
  if (!overrides) {
    ctx.log.debug(`No overrides defined for family ${family}`);
    return;
  }
  for (const entry of overrides) {
    const key = `${entry.siid}-${entry.piid}`;
    switch (entry.kind) {
      case 'remove': {
        if (!dicts.meta[key]) {
          ctx.log.warn(`[model-overrides] remove: no meta entry for ${key} (family ${family})`);
          break;
        }
        delete dicts.props[key];
        delete dicts.meta[key];
        if (dicts.status[did]) {
          dicts.status[did] = dicts.status[did].filter(
            e => !(e.siid === entry.siid && e.piid === entry.piid),
          );
        }
        break;
      }
      case 'rename': {
        if (!dicts.meta[key]) {
          ctx.log.warn(`[model-overrides] rename: no meta entry for ${key} (family ${family})`);
          break;
        }
        dicts.meta[key].nameKey = entry.nameKey;
        // entry.desc is currently informational only — main.js _lazyCreateState does not
        // propagate it to ioBroker common.desc yet.
        if (entry.desc) dicts.meta[key].desc = entry.desc;
        break;
      }
      case 'remap': {
        if (!dicts.meta[key]) {
          ctx.log.warn(`[model-overrides] remap: no meta entry for ${key} (family ${family})`);
          break;
        }
        if (entry.nameKey !== undefined) dicts.meta[key].nameKey = entry.nameKey;
        if (entry.stateKeys !== undefined) dicts.meta[key].stateKeys = entry.stateKeys;
        if (entry.decode !== undefined) dicts.meta[key].decode = entry.decode;
        break;
      }
      case 'extendStateKeys': {
        if (!dicts.meta[key]) {
          ctx.log.warn(`[model-overrides] extendStateKeys: no meta entry for ${key} (family ${family})`);
          break;
        }
        dicts.meta[key].stateKeys = Object.assign(dicts.meta[key].stateKeys || {}, entry.add);
        break;
      }
      default:
        ctx.log.warn(`Unknown override kind: ${entry.kind}`);
    }
  }
}

module.exports = { getModelFamily, applyModelOverrides };
