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
// FAMILY_OVERRIDES['all-vacuum'] gilt fuer JEDES Vacuum unabhaengig vom
// family-Match und wird zuerst angewendet; family-specific overrides run second
// and can redefine or extend what all-vacuum did. Familien ohne eigenen Eintrag
// (und jedes unbekannte Modell -> getModelFamily liefert null) bekommen nur den
// all-vacuum-Durchlauf.
//
// Seit Issue #119: all-vacuum entfernt SIID 4/PIID 52 (auf jeder Familie tot);
// r6001 und r9419 remappen SIID 4/PIID 6 auf die echte Mopp-Pad-Praesenz. Das
// fruehere r6001-REMOVE 4-52 / RENAME 4-53 liegt jetzt in all-vacuum.js bzw.
// lib/specs/cleaning.js.

// Prefix-Tabelle fuer die Modell-Familienerkennung, analog MODEL_IV_TABLE in
// lib/dreame.js. "Familie" ist orthogonal zur Geraeteart (getDeviceType) - ein
// r6001* ist weiterhin ein vacuum, nur mit abweichenden Property-Details.
const MODEL_FAMILY_TABLE = [
  { prefix: 'dreame.vacuum.r6001', family: 'r6001' },
  { prefix: 'dreame.vacuum.r2253', family: 'r2253' },
  { prefix: 'dreame.vacuum.r9419', family: 'r9419' },
];

// Dispatcher: Familie -> Array von Override-Objekten. Der Pseudo-Key 'all-vacuum'
// ist keine echte Familie (kein Prefix in MODEL_FAMILY_TABLE) und wird von
// applyModelOverrides() fuer jedes Vacuum zuerst angewendet.
const FAMILY_OVERRIDES = {
  'all-vacuum': require('./all-vacuum'),
  r6001: require('./r6001'),
  r9419: require('./r9419'),
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
 * Wendet EINE Override-Liste sequentiell auf dicts an. Aus applyModelOverrides()
 * extrahiert, damit der all-vacuum- und der familien-spezifische Durchlauf
 * dieselbe Logik nutzen. Nicht exportiert - Implementationsdetail.
 *
 * @param {Array<object>} overrides
 * @param {string} label   fuer Log-Meldungen: family key oder 'all-vacuum'
 * @param {string} did
 * @param {{ props: object, meta: object, status: object }} dicts
 * @param {{ translate: (key: string) => string, log: object }} ctx
 */
function applyOverrideList(overrides, label, did, dicts, ctx) {
  for (const entry of overrides) {
    const key = `${entry.siid}-${entry.piid}`;
    switch (entry.kind) {
      case 'remove': {
        if (!dicts.meta[key]) {
          ctx.log.warn(`[model-overrides] remove: no meta entry for ${key} (${label})`);
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
          ctx.log.warn(`[model-overrides] rename: no meta entry for ${key} (${label})`);
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
          ctx.log.warn(`[model-overrides] remap: no meta entry for ${key} (${label})`);
          break;
        }
        if (entry.nameKey !== undefined) dicts.meta[key].nameKey = entry.nameKey;
        if (entry.stateKeys !== undefined) dicts.meta[key].stateKeys = entry.stateKeys;
        if (entry.decode !== undefined) dicts.meta[key].decode = entry.decode;
        break;
      }
      case 'extendStateKeys': {
        if (!dicts.meta[key]) {
          ctx.log.warn(`[model-overrides] extendStateKeys: no meta entry for ${key} (${label})`);
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

/**
 * Mutiert props/meta/status in place. Wendet immer zuerst die 'all-vacuum'-Liste
 * an (gilt fuer jedes Vacuum), danach - falls family erkannt und registriert -
 * die familien-spezifische Liste. family-specific overrides run second and can
 * redefine or extend what all-vacuum did. Kein Rueckgabewert, keine
 * ioBroker-API-Aufrufe (ausser optionaler Alt-State-Migration innerhalb eines
 * Override-Eintrags, falls spaeter noetig).
 *
 * @param {string|null} family  family key or null when no family match
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
  // 1. Immer zuerst all-vacuum, unabhaengig vom family-Match.
  if (FAMILY_OVERRIDES['all-vacuum']) {
    applyOverrideList(FAMILY_OVERRIDES['all-vacuum'], 'all-vacuum', did, dicts, ctx);
  }
  // 2. Dann familien-spezifisch, falls Familie erkannt und registriert.
  const overrides = family && FAMILY_OVERRIDES[family];
  if (!overrides) {
    ctx.log.debug(`No family-specific overrides for ${family ?? '(no family)'}`);
    return;
  }
  applyOverrideList(overrides, family, did, dicts, ctx);
}

module.exports = { getModelFamily, applyModelOverrides };
