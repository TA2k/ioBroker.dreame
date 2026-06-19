# ioBroker.dreame — Refactoring-Plan: Lazy-Create + i18n

Diese Datei dokumentiert alle getroffenen Architektur-Entscheidungen und den
Umsetzungsfortschritt. Eine neue Sitzung kann direkt hier einsteigen.

---

## 1. Entschiedene Architektur

### 1.1 Lazy-Create (größter Hebel)

Kein State wird beim Adapterstart vorab angelegt. Ein State entsteht erst wenn
die erste MQTT-Nachricht für die passende `siid-piid`-Kombination ankommt
(`properties_changed`-Handler) — oder wenn der initiale HTTP-Poll
(`get_properties`) einen Wert zurückgibt.

Ausnahmen (bleiben upfront angelegt):
- **Action-States** (`aiid`, kein `piid`) — können nicht aus `properties_changed` entstehen,
  müssen in Vis/Skripten sichtbar sein bevor der Nutzer sie aufruft (→ Frage 3)
- **AutoSwitch-Remotes** (`autoSwitchKey`, kein `siid/piid`) — werden über
  `parseVacuumAutoSwitch` befüllt, keine MQTT-Property
- **Kanal-Objekte** (`status`, `remote`) — kein Overhead, nötig für Baumstruktur

### 1.2 Zwei Achsen (keine Breaking Changes)

- `status.*` — read-only (MQTT-Properties, write: false)
- `remote.*` — read+write (MQTT-Properties, write: true)

Bestehende Objekt-IDs werden NICHT geändert.

### 1.3 Modulstruktur (nur Metadaten, keine extendObject-Aufrufe)

```
lib/specs/
├── core.js              SIID 2 (robot state, error), SIID 3 (battery)
├── cleaning.js          SIID 4 (vacuum extend — core cleaning)
├── dnd.js               SIID 5                      ← folgt nach Test
├── map.js               SIID 6                      ← folgt nach Test
├── audio.js             SIID 7                      ← folgt nach Test
├── schedule.js          SIID 8                      ← folgt nach Test
├── consumables.js       SIID 9, 10, 11, 16, 30      ← folgt nach Test
├── statistics.js        SIID 12                     ← folgt nach Test
├── auto-empty.js        SIID 15                     ← folgt nach Test
├── station.js           SIID 27                     ← folgt nach Test
├── extended-settings.js SIID 28                     ← folgt nach Test
├── camera.js            SIID 10001                  ← folgt nach Test
└── index.js             baut flache Lookup-Map
```

Jedes Modul exportiert reine Metadaten:
```javascript
module.exports = {
  statusStates: [
    { id: 'battery-level', piid: 1, siid: 3, nameKey: 'vacuum.status.battery-level',
      type: 'number', role: 'value.battery', unit: '%' },
  ],
  remoteStates: [
    { id: 'suction-level', piid: 4, siid: 4, nameKey: 'vacuum.remote.suction-level',
      type: 'number', role: 'level', states: { 0: 'Quiet', 1: 'Standard', 2: 'Strong', 3: 'Turbo' } },
  ],
};
```

`lib/specs/index.js` baut daraus:
- `specPropsToIdDict[did][siid-piid]` → Pfad-String (bleibt wie bisher)
- `specMetaDict[did][siid-piid]` → `{ nameKey, type, role, unit, states, write }` (NEU)
- `specStatusDict[did]` → Array für HTTP-Poll (bleibt wie bisher)

### 1.4 i18n via @iobroker/adapter-core

- `lib/i18n/en.json` — einzige Handpflege-Datei (flache Key-Value-Liste)
- `npm run translate` — erzeugt alle anderen Sprachdateien automatisch
- `I18n.init(join(__dirname, 'lib'), this)` — einmalig in `onReady`
- `I18n.getTranslatedObject(nameKey)` — synchroner O(1)-Lookup, direkt beim Lazy-Create

### 1.5 Neuer Lazy-Create-Helper in main.js

```javascript
async _lazyCreateState(did, siid, piid, value) {
  const key = `${siid}-${piid}`;
  const path = this.specPropsToIdDict[did]?.[key];
  if (!path) return null;
  if (!this.createdStates.has(path)) {
    const meta = this.specMetaDict?.[did]?.[key];
    const { I18n } = require('@iobroker/adapter-core');
    await this.extendObject(path, {
      type: 'state',
      common: {
        name: meta?.nameKey ? I18n.getTranslatedObject(meta.nameKey) : path,
        type: meta?.type ?? 'mixed',
        role: meta?.role ?? 'state',
        read: true,
        write: meta?.write ?? false,
        unit: meta?.unit || '',
        ...(meta?.states ? { states: meta.states } : {}),
      },
      native: { siid, piid },
    });
    this.createdStates.add(path);
  }
  if (value != null) {
    this.setState(path, typeof value === 'object' ? JSON.stringify(value) : value, true);
  }
  return path;
}
```

---

## 2. Entscheidungen zu den drei offenen Fragen

### Frage 1 — Möbel-Metadaten in der Karte

**Entscheidung: Option B — `delete multiMap.furniture` vor `json2iob.parse`**

Begründung:
- Furniture-States entstehen als Nebeneffekt von `json2iob.parse(... '.info', multiMap)` in `getMap()`.
- `multiMap.furniture` wird beim Canvas-Rendering NICHT verwendet (das Rendering
  liest nur `mapInfo`, `vw`, `vws`, `areaInfo`, `chargerPos`, `robotPos`).
- Kein interner Verbraucher, kein Eintrag in README, kein dokumentierter Zweck.
- Adapter noch nicht im offiziellen ioBroker-Repo → kein Migrations-Aufwand für
  bestehende Nutzer.
- Symmetrisch zu `delete multiMap.mapInfo` / `delete multiMap.floorMapInfo` die
  bereits bewusst entfernt werden.

Umsetzung: Eine Zeile in `getMap()` nach Zeile 3857 (main.js):
```javascript
delete multiMap.furniture;
```

### Frage 2 — `map.maps.current` vs. `map.maps.<id>`

**Entscheidung: Beide behalten — kein Duplikat, unterschiedliche Semantik**

Analyse der `stateMapId`-Logik (main.js:3838–3840):
- `fetchAllMaps=true` (nur beim Start) → schreibt `map.maps.<real-id>` (z. B. `maps.1`, `maps.2`)
  Snapshot aller Karten bei Adapterstart; bei Mehrgeschoss-Haushalten nützlich.
- `fetchAllMaps=false` (Polling-Intervall + Remote-Taste) → schreibt `map.maps.current`
  Immer aktuell, stabiler Pfad für Vis-Bindungen unabhängig davon auf welche
  Karte der Roboter wechselt.

→ Keine Änderung nötig.

### Frage 3 — Action-States

**Entscheidung: Bleiben upfront angelegt**

Action-States haben `aiid` statt `piid` — es gibt keine entsprechende MQTT-Property
und daher keinen `properties_changed`-Trigger. Sie müssen vorab existieren damit
Nutzer sie in Vis/Skripten sehen und nutzen können.

---

## 3. Neue Datenstruktur in main.js

| Feld | Typ | Zweck | Status |
|---|---|---|---|
| `specPropsToIdDict[did][siid-piid]` | `string` | Pfad (z. B. `did.status.battery-level`) | bisher vorhanden |
| `specStatusDict[did]` | `Array` | Einträge für HTTP-Poll | bisher vorhanden |
| `specActionsToIdDict[did][siid-aiid]` | `string` | Pfad für Actions | bisher vorhanden |
| `specMetaDict[did][siid-piid]` | `object` | Metadaten für lazy extendObject | **NEU** |
| `createdStates` | `Set<string>` | Verhindert doppelte extendObject-Aufrufe | **NEU** |

---

## 4. Status der Umsetzung

### Pilot: Vacuum (SIID 2, 3, 4)

- [x] lib/i18n/en.json (SIID 2,3,4 Keys)
- [x] lib/specs/core.js (SIID 2, 3)
- [x] lib/specs/cleaning.js (SIID 4)
- [x] lib/specs/index.js
- [x] main.js: I18n.init() + _lazyCreateState-Helper
- [x] main.js: createVacuumRemotes auf Lookup-Aufbau umgestellt (SIID 2,3,4)
- [x] main.js: properties_changed-Handler + updateDevicesViaSpec nutzen _lazyCreateState
- [x] main.js: delete multiMap.furniture in getMap()
- [ ] Getestet am echten Gerät

### Folge-Schritt: Restliche Vacuum-SIIDs (nach erfolgreichem Test)

- [ ] lib/specs/dnd.js (SIID 5)
- [ ] lib/specs/map.js (SIID 6)
- [ ] lib/specs/audio.js (SIID 7)
- [ ] lib/specs/schedule.js (SIID 8)
- [ ] lib/specs/consumables.js (SIID 9, 10, 11, 16, 30)
- [ ] lib/specs/statistics.js (SIID 12)
- [ ] lib/specs/auto-empty.js (SIID 15)
- [ ] lib/specs/station.js (SIID 27)
- [ ] lib/specs/extended-settings.js (SIID 28)
- [ ] lib/specs/camera.js (SIID 10001)
- [ ] lib/i18n/en.json (restliche Keys)
- [ ] main.js: createVacuumRemotes vollständig auf Lookup-Aufbau umgestellt
- [ ] npm run translate (alle Sprachdateien erzeugen)
- [ ] io-package.json: news-Eintrag (lazy object creation)

### Folge-Schritt: Weitere Gerätetypen (nach Vacuum-Abschluss)

- [ ] mower: lib/specs/mower-core.js, lib/specs/mower-mowing.js
- [ ] swbot / airp / hold: können extractRemotesFromSpec-Pfad nutzen
