// Karten-Steuerung des Adapters: alles, was zwischen Geraet, Cloud und States vermittelt.
//
// Abgrenzung zu den Nachbardateien: haDecode.js, haMap.js und mapMerge.js rechnen nur
// (Bytes rein, Karte raus) und kennen den Adapter nicht. Hier steht das Gegenstueck —
// Pakete entgegennehmen, Vollbilder anfordern, Ergebnisse in States schreiben.
//
// Warum ein Klassenrumpf, dessen Methoden angeheftet werden, statt einer eigenen Klasse
// mit `this.adapter.…`: die Methoden stammen unveraendert aus main.js und arbeiten
// durchgehend mit `this.log`, `this.setState`, `this.sendCommand`. Werden sie an den
// Adapter-Prototyp geheftet, ist `this` genau dasselbe wie vorher — die Verschiebung
// aendert damit KEINE einzige Zeile im Rumpf. Ein Umbau auf `this.adapter.…` haette
// hunderte Aenderungen bedeutet, und jede davon waere eine Fehlerquelle gewesen.
//
// Eingehaengt wird in main.js mit:  mapController.einhaengen(Dreame);

// BEIDE Namen sind noetig: der verschobene Code benutzt an manchen Stellen `zlib`
// (so heisst es in main.js) und an anderen `_zlib`. Weil beim Verschieben bewusst keine
// Zeile im Rumpf angefasst wurde, muessen hier beide Namen vorhanden sein.
const zlib = require('node:zlib');
const _zlib = zlib;
const { MapMerger, readHeader, HEADER_SIZE } = require('./mapMerge');
const { DreameVacuumTaskStatus, deviceStatusFlags } = require('./haMap');

// Eigenschaften, an denen in HA das Neuzeichnen der Karte haengt (device.py 435, 500-506).
// Schluessel im Format siid-piid, passend zu PROPERTY_NAME_MAP in main.js.
const PROP_STATE = '2-1'; // HA DreameVacuumProperty.STATE
const PROP_STATUS = '4-1'; // HA DreameVacuumProperty.STATUS
const PROP_TASK_STATUS = '4-7'; // HA DreameVacuumProperty.TASK_STATUS
const PROP_CLEANING_PAUSED = '4-17'; // HA DreameVacuumProperty.CLEANING_PAUSED
const PROP_CUSTOMIZED_CLEANING = '4-26'; // HA DreameVacuumProperty.CUSTOMIZED_CLEANING
const PROP_AUTO_EMPTY_STATUS = '15-5'; // HA DreameVacuumProperty.AUTO_EMPTY_STATUS

// Traeger der Methoden. Wird nie selbst erzeugt — der Rumpf dient nur dazu, die
// Methoden im gleichen Wortlaut aufnehmen zu koennen wie in der Adapter-Klasse.
class MapController {
  /**
   * Fehler aus einem catch melden — mit Unterscheidung nach Art.
   *
   * Hintergrund: Die Sammel-catch-Bloecke hier waren fuer den Betrieb gedacht (Cloud
   * antwortet nicht, Objekt gerade nicht abrufbar). Das sind voruebergehende Zustaende,
   * die sich von selbst erledigen — dafuer ist debug richtig, sonst steht das Log voll.
   *
   * Ein catch faengt aber auch ReferenceError und TypeError, und das sind
   * Programmierfehler: sie gehen nie von selbst weg. Genau so ein Fehler
   * ("UpdateCleanset is not defined", spaeter "zlib is not defined") hat sich hier als
   * harmlose debug-Zeile getarnt und mehrere Testrunden ueberlebt. Deshalb gehen die
   * beiden Arten jetzt als error raus.
   */
  _meldeFehler(text, e) {
    const programmierfehler = e instanceof ReferenceError || e instanceof TypeError;
    const meldung = `${text}: ${(e && e.message) || e}`;
    if (programmierfehler) this.log.error(meldung + ' — das ist ein Fehler im Adapter, bitte melden');
    else this.log.debug(meldung);
  }

  // ===== Kartenhilfen: Frame-Diagnose, Eigenschaftsspeicher, Geraetestatus, Neuzeichnen =====
  /**
   * [FRAME-DIAG] Prüft, ob ein base64-Wert ein binärer Dreame-Karten-Frame ist,
   * und loggt Typ (73=I / 80=P), Größe und Dimensionen. Nur zur Analyse.
   */
  _diagFrame(tag, b64) {
    try {
      if (typeof b64 !== 'string' || b64.length < 20) {
        this.log.debug(`[FRAME-DIAG] ${tag}: kein/zu kurzer String (len=${b64 && b64.length})`);
        return;
      }
      let raw;
      try {
        raw = Buffer.from(_zlib.inflateSync(Buffer.from(b64.replace(/-/g, '+').replace(/_/g, '/'), 'base64')));
      } catch (e) {
        this.log.debug(`[FRAME-DIAG] ${tag}: NICHT inflatebar (wohl JSON/cleanset), b64-len=${b64.length}`);
        return;
      }
      if (raw.length < HEADER_SIZE) {
        this.log.debug(`[FRAME-DIAG] ${tag}: inflated, aber < Header (${raw.length})`);
        return;
      }
      const h = readHeader(raw);
      const typeStr = h.frameType === 73 ? 'I-Frame' : h.frameType === 80 ? 'P-Frame' : `? (${h.frameType})`;
      this.log.debug(
        `[FRAME-DIAG] ${tag}: ${typeStr} map=${h.mapId} frame=${h.frameId} ${h.width}x${h.height} grid=${h.gridSize} origin=(${h.originX},${h.originY}) rawLen=${raw.length}`,
      );
    } catch (e) {
      this.log.debug(`[FRAME-DIAG] ${tag}: Fehler ${e.message}`);
    }
  }

  /**
   * Laedt ein Karten-Objekt aus der Cloud und liefert es als base64-zlib-Frame-String
   * (robuste Byte-Erkennung: base64-Text / Rohbytes / Byte-Objekt). null bei Fehler.
   */
  async _downloadMapB64(objName, device) {
    try {
      const url = await this.getFile(objName, device);
      const resp = await this.requestClient({ method: 'get', url }).catch(() => null);
      if (!resp || !resp.data) return null;
      const data = resp.data;
      let buf = null;
      if (Buffer.isBuffer(data)) buf = data;
      else if (data instanceof ArrayBuffer) buf = Buffer.from(data);
      else if (typeof data === 'string') {
        const b1 = Buffer.from(data, 'base64');
        if (b1.length > 2 && b1[0] === 0x78) buf = b1;
        else {
          const b2 = Buffer.from(data, 'latin1');
          if (b2[0] === 0x78) buf = b2;
        }
      } else if (data && typeof data === 'object') {
        const ks = Object.keys(data).filter((k) => /^\d+$/.test(k)).map(Number).sort((a, b) => a - b);
        if (ks.length) buf = Buffer.from(ks.map((k) => data[k]));
      }
      if (buf && buf.length && buf[0] === 0x78) return buf.toString('base64');
    } catch (e) {
      this.log.debug('[MAP] _downloadMapB64: ' + (e && e.message));
    }
    return null;
  }

  /**
   * VSLAM-Geraete (Kamera-Navigation, z.B. Mijia 1C/1T, Dreame F9): die Kartendarstellung
   * dieses Forks ist NUR fuer Lidar-Roboter gebaut und getestet. Fuer VSLAM fehlen bewusst
   * (siehe PORT_STATUS.md, "VSLAM zurueckgestellt"): map_version-0-Auswahl, der
   * Karten-Optimizer (map.py 12503 ff.), die Docked-Ersatzkarte (device.py 3035-3056),
   * der Skalierungsfix (device.py 3274-3282) und die VSLAM-Icons. Ohne Testgeraet wird
   * das nicht blind portiert — erst wenn sich echte Nutzer melden.
   */
  _checkVslamSupport(did, lidarNavigation, model) {
    if (lidarNavigation) return;
    if (!this._vslamErrorShown) this._vslamErrorShown = {};
    if (this._vslamErrorShown[did]) return;
    this._vslamErrorShown[did] = true;
    this.log.error(
      `VSLAM-Geraet erkannt (${model || 'unbekanntes Modell'}): Kamera-/VSLAM-Roboter werden von der ` +
        `Kartendarstellung dieses Adapters nicht unterstuetzt (nicht eingebaut, ungetestet). ` +
        `Bei Interesse bitte ein Issue eroeffnen: https://github.com/RicardoHipp/ioBroker.dreame/issues`,
    );
  }

  /**
   * Eigenschaftsspeicher — Gegenstueck zu HAs `self._properties` im Geraeteobjekt.
   * TA2ks Adapter schreibt MQTT-Werte direkt in States und haelt sie nirgends; HA braucht
   * sie aber synchron und mit Vorgaengerwert, weil mehrere Entscheidungen genau daran
   * haengen (device.py _task_status_changed: `previous_task_status`).
   */
  _propertyChanged(did, siid, piid, value) {
    if (!did || siid == null || piid == null) return;
    const key = `${siid}-${piid}`;
    if (!this._props) this._props = {};
    if (!this._props[did]) this._props[did] = {};
    const previous = this._props[did][key];
    this._props[did][key] = value;
    if (previous === value) return; // HA feuert nur bei echter Aenderung

    // HA device.py 435 + 500-506: genau diese Eigenschaften sind an das Neuzeichnen
    // der Karte gekoppelt. Namen aus unserer Property-Tabelle (siehe oben im File).
    if (key === PROP_TASK_STATUS) {
      this._taskStatusChanged(did, previous, value);
    } else if (key === PROP_STATE || key === PROP_CUSTOMIZED_CLEANING || key === PROP_AUTO_EMPTY_STATUS) {
      // device.py 877-880 _map_property_changed: "Update last update time of the map when a
      // property associated with rendering map changed."
      this._mapPropertyChanged(did, previous);
    }
  }

  /** Aktueller Geraetestatus aus dem Speicher (HA: self.status.* in device.py). */
  _deviceStatus(did) {
    const p = (this._props && this._props[did]) || {};
    const num = (k) => (p[k] != null ? Number(p[k]) : null);
    return { taskStatus: num(PROP_TASK_STATUS), status: num(PROP_STATUS), cleaningPaused: !!num(PROP_CLEANING_PAUSED) };
  }

  /**
   * 1:1-Port von device.py `_map_property_changed` (877-880).
   * HA: "Update last update time of the map when a property associated with rendering map
   * changed." — nur wenn ein Vorgaengerwert existierte.
   */
  _mapPropertyChanged(did, previousProperty) {
    if (!this.mapMerger || previousProperty === undefined) return;
    this.mapMerger.setDeviceStatus(this._deviceStatus(did));
    this._refreshMap(did);
  }

  /**
   * 1:1-Port von device.py `_task_status_changed` (1127-1160, Karten-Teil).
   * HA-Kommentar: "Task status is a very important property and must be listened to trigger
   * necessary actions when a task started or ended".
   *
   * ➖ NICHT portiert: HAs Buchhaltung im selben Block (1159-1215) — cleanup_started/
   * cleanup_completed, Reinigungsverlauf-Trigger, CleanGenius-Wiederherstellung,
   * cleaning_route-Ruecksetzung, Cruise-Point-Behandlung. Das speist HA-Sensoren und
   * -Automationen, nicht die Karte. (In PORT_STATUS.md vermerkt.)
   */
  _taskStatusChanged(did, previousTaskStatus, taskStatus) {
    if (!this.mapMerger || previousTaskStatus === undefined) return;
    const T = DreameVacuumTaskStatus;
    const prev = Number(previousTaskStatus);
    const now = Number(taskStatus);
    this.mapMerger.setDeviceStatus(this._deviceStatus(did));

    const current = this.mapMerger.current;
    if (!current || current.dirty) return; // HA: `if current_map is not None and not current_map.dirty`

    let merged;
    if (prev === T.COMPLETED) {
      if (
        now === T.AUTO_CLEANING ||
        now === T.ZONE_CLEANING ||
        now === T.SEGMENT_CLEANING ||
        now === T.SPOT_CLEANING ||
        now === T.CRUISING_PATH ||
        now === T.CRUISING_POINT
      ) {
        // Clear path on current map on cleaning start as implemented on the app
        merged = this.mapMerger.clearPath();
      } else if (now === T.FAST_MAPPING) {
        // Clear current map on mapping start as implemented on the app
        merged = this.mapMerger.resetMap();
      } else {
        merged = this.mapMerger.refresh();
      }
    } else {
      merged = this.mapMerger.refresh();
    }
    if (merged) {
      this.log.debug(`[MERGE] task_status ${prev} -> ${now}: Karte neu gebaut`);
      this._writeMerged(did, merged).catch((e) => this._meldeFehler('[MERGE] refresh', e));
    }
  }

  /**
   * HAs `refresh_map` nutzt einen 0.2s-Timer als Sammelfenster (map.py 1919-1921), damit
   * mehrere Eigenschaftsaenderungen aus einem MQTT-Paket nur ein Neuzeichnen ausloesen.
   */
  _refreshMap(did) {
    if (this._refreshTimer) clearTimeout(this._refreshTimer);
    this._refreshTimer = setTimeout(() => {
      this._refreshTimer = null;
      if (!this.mapMerger) return;
      const merged = this.mapMerger.refresh();
      if (merged) this._writeMerged(did, merged).catch((e) => this._meldeFehler('[MERGE] refresh', e));
    }, 200);
  }

  /** Schreibt die gemergte Karte als CloudData-Blob (Format wie dreamehome) in einen State. */
  async _writeMerged(did, mergedB64) {
    if (!mergedB64) return;
    const id = `${did}.map.mergedCloud`;
    await this.setObjectNotExistsAsync(id, {
      type: 'state',
      common: { name: 'Gemergte Live-Karte (CloudData-Format)', type: 'string', role: 'json', read: true, write: false },
      native: {},
    });
    await this.setStateAsync(id, JSON.stringify({ mapstr: [{ id: 0, name: '', angle: '0', map: mergedB64 }], curr_id: 1 }), true);
  }

  /**
   * Wie _writeMerged, aber auf this._liveMapDebounceMs (Admin-Option liveMapUpdateSeconds,
   * Default 5000ms) gedrosselt: der eigentliche Lastpunkt ist NICHT das Rendering, sondern
   * die State-Schreibfrequenz waehrend der Reinigung (JEDER P-Frame loest hier sonst einen
   * eigenen setState eines potenziell mehrere 100 KB grossen Base64-Blobs aus). Trailing-Edge:
   * die letzte gemergte Karte innerhalb des Fensters geht nie verloren, sie wird spaetestens
   * am Fensterende geschrieben. mapMerger.process() selbst laeuft unthrottled weiter, nur die
   * sichtbare State-Ausgabe wird gedrosselt.
   */
  _writeMergedThrottled(did, mergedB64) {
    this._liveMapThrottle = this._liveMapThrottle || {};
    const t = (this._liveMapThrottle[did] = this._liveMapThrottle[did] || { lastWrite: 0, timer: null, pending: null });
    t.pending = mergedB64;
    const minGap = this._liveMapDebounceMs || 5000;
    const wait = minGap - (Date.now() - t.lastWrite);
    if (wait <= 0) {
      t.lastWrite = Date.now();
      const merged = t.pending;
      t.pending = null;
      this._writeMerged(did, merged).catch((e) => this._meldeFehler('[MERGE] write', e));
      return;
    }
    if (t.timer) return;
    t.timer = setTimeout(() => {
      t.timer = null;
      t.lastWrite = Date.now();
      const merged = t.pending;
      t.pending = null;
      if (merged) this._writeMerged(did, merged).catch((e) => this._meldeFehler('[MERGE] write', e));
    }, wait);
  }

  // ===== Raum-Einstellungen aus dem cleanset in States schreiben =====

  // Hier stand _applyCleansetRoom — eine Kopie von ~72 Zeilen aus setMapInfos in main.js.
  // Entfernt: der Nachladeweg ruft jetzt setMapInfos selbst auf (s. _applyCleansetFromInflated),
  // damit dieser Originalcode nur an einer Stelle steht und Aenderungen von TA2k dort
  // konfliktfrei durchmergen.

  // ===== Karten-Objekt nachladen und cleanset daraus uebernehmen =====
  /**
   * Laedt das Karten-Objekt hinter einem object_name (siid 6-3) und uebernimmt die darin
   * enthaltenen Raum-Einstellungen (cleanset) in die States.
   *
   * Hintergrund: Aendert man in der App die Einstellung eines Raums, pusht das Geraet sofort
   * einen neuen object_name — die Werte selbst stecken aber im dahinterliegenden Cloud-Objekt
   * (zlib-komprimiertes JSON mit u.a. dem Feld "cleanset"). Ohne dieses Nachladen waeren die
   * Raum-Einstellungen nur so aktuell wie der letzte Kartenframe, der ein cleanset trug —
   * praktisch also nur nach einer Reinigung. HA macht dasselbe (map.py handle_properties ->
   * _add_cloud_map_data).
   *
   * Bewusst NUR das cleanset: Kartendaten (rism, robot, tr, ...) kommen ueber die Live-Frames,
   * der Rest des Objekts sind Statistiken bzw. Felder, die es schon als eigene Properties gibt.
   */
  async _loadCleansetFromObject(objName, device) {
    try {
      const url = await this.getFile(objName, device);
      if (!url) return;
      const res = await this.requestClient({
        method: 'get',
        headers: { Accept: '*/*', 'Accept-Language': 'de-de', Connection: 'keep-alive',
          'User-Agent': 'Dreame_Smarthome/1043 CFNetwork/1240.0.4 Darwin/20.6.0' },
        url,
      });
      const raw = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
      // Objekt ist base64+zlib (Anfang "eF" = 0x78 0x9c)
      let b64 = raw.replace(/-/g, '+').replace(/_/g, '/');
      b64 += '='.repeat((4 - (b64.length % 4)) % 4);
      const inflated = zlib.inflateSync(Buffer.from(b64, 'base64')).toString('latin1');
      await this._applyCleansetFromInflated(inflated, String(device.did), 'Nachladen', objName);
    } catch (e) {
      this._meldeFehler(`[CLEANSET] Nachladen von ${objName} fehlgeschlagen`, e);
    }
  }

  /**
   * Nimmt den ENTPACKTEN Inhalt eines Karten-Objekts und uebernimmt daraus die
   * Raum-Einstellungen (Feld "cleanset") in die States.
   *
   * Getrennt vom Laden, weil derselbe Inhalt an zwei Stellen anfaellt:
   *   - beim object_name-Push (App-Aenderung, siehe _loadCleansetFromObject)
   *   - beim Adapterstart in getMap(), wo das Objekt ohnehin geladen wird
   * Beim Start kommt naemlich kein Push — ohne das blieben Aenderungen, die waehrend
   * der Adapter aus war gemacht wurden, unbemerkt.
   */
  async _applyCleansetFromInflated(inflated, did, quelle, objName = '') {
    const j = inflated.indexOf('{');
    if (j < 0) return 0;
    let obj;
    try {
      obj = JSON.parse(inflated.slice(j));
    } catch (e) {
      return 0;
    }
    if (!obj || obj.cleanset === undefined) return 0;
    // cleanset ist ein JSON-String: {"<raumId>":[Level,Wasser,Wdh,Reihenfolge,Modus,Route], ...}
    const cs = typeof obj.cleanset === 'string' ? JSON.parse(obj.cleanset) : obj.cleanset;
    if (!cs || typeof cs !== 'object') return 0;
    const raeume = Object.entries(cs).filter(([, arr]) => Array.isArray(arr) && arr.length === 6);
    if (!raeume.length) return 0;
    // Schreiben laesst main.js erledigen: setMapInfos kennt den Weg von einem cleanset in
    // die States bereits, und dieser Code stammt vom Original. Frueher haben wir ihn
    // herauskopiert — dadurch war er doppelt gepflegt, und die sieben Bezeichner aus dem
    // Modulrahmen von main.js (UpdateCleanset, DreameLevel, …) waren hier gar nicht
    // sichtbar. Jetzt geht nur { cleanset: … } hinein, also schreibt die Schleife dort
    // auch nur die Raum-Einstellungen und nichts anderes aus dem Kartenbaum.
    await this.setMapInfos(null, `${did}.map.`, { cleanset: Object.fromEntries(raeume) });
    this.log.debug(`[CLEANSET] ${raeume.length} Raeume uebernommen (Quelle: ${quelle}${objName ? ', ' + objName : ''})`);
    return raeume.length;
  }


  // ===== Vollbild der Arbeitskarte anfordern (aus getMap herausgeloest) =====
  /**
   * Fordert per force-I ein komplettes, aktuelles Kartenbild an und setzt es als Basis.
   *
   * Stand bis Umbau 2/3 eingebettet in getMap(). Herausgeloest, weil getMap() selbst vom
   * Original stammt und moeglichst unveraendert bleiben soll.
   *
   * @param device  Geraet aus this.deviceArray
   */
  async _holeFrischeKarte(device) {
    // --- Wie HA: force-I-Request (siid 6/aiid 1) erzwingt einen KOMPLETTEN, AKTUELLEN
    //     I-Frame der Arbeitskarte. Die Adresse kommt in der Aktions-ANTWORT zurück
    //     (out/piid 3 = object_name), NICHT über die (veralteten) MAP_LIST-Properties.
    //     Ohne force_type liefert der Roboter nur die alte gespeicherte Karte. ---
    let freshBase64 = null;
    try {
      const rm = await this.sendCommand({
        did: device.did,
        method: 'action',
        params: {
          did: device.did,
          siid: 6,
          aiid: 1,
          in: [{ piid: 2, value: '{"req_type":1,"frame_type":"I","force_type":1}' }],
        },
      });
      const res = rm && (rm.result !== undefined ? rm.result : rm);
      const out = res && res.out;
      // Antwort wie HA _request_i_map auswerten: piid 3 = object_name, piid 1 = Karte
      // DIREKT als Rohdaten (kommt v.a. WAEHREND der Reinigung statt object_name!),
      // piid 13 = old_map_data ("0,<raw>" oder "<x>,<object_name>[,<aes-key>]").
      let freshObj = null;
      let freshRaw = null;
      if (Array.isArray(out)) {
        for (const p of out) {
          if (p.value === undefined || p.value === null || p.value === '') continue;
          if (p.piid === 3) freshObj = p.value;
          else if (p.piid === 1) freshRaw = p.value;
          else if (p.piid === 13) {
            const values = String(p.value).split(',');
            if (values[0] === '0') {
              if (!freshRaw) freshRaw = values[1];
            } else if (!freshObj) {
              if (values.length === 3) {
                this.log.warn('[MAP] Karten-Objekt mit AES-Key erhalten — Entschluesselung nicht implementiert');
              } else {
                freshObj = values[1];
              }
            }
          }
        }
      }
      if (freshObj) {
        await new Promise((r) => setTimeout(r, 1500)); // kurz warten, bis Upload bereit
        const url = await this.getFile(freshObj, device);
        const resp = await this.requestClient({ method: 'get', url }).catch((e) => {
          this.log.warn('[MAP] frisches Objekt Download-Fehler: ' + (e && e.message));
          return null;
        });
        if (resp && resp.data) {
          // Rohbytes robust holen (je nach Transport: Buffer / ArrayBuffer / Byte-Objekt /
          // Binär-String). NICHT Buffer.from(string) mit UTF-8 -> das bläht Bytes>127 auf.
          // Das Objekt kommt i.d.R. als base64-TEXT des zlib-Frames (wie mapstr[].map),
          // kann je nach Transport aber auch Rohbytes/Byte-Objekt sein. Ziel: zlib-Buffer.
          const data = resp.data;
          let buf = null;
          if (Buffer.isBuffer(data)) buf = data;
          else if (data instanceof ArrayBuffer) buf = Buffer.from(data);
          else if (typeof data === 'string') {
            const b1 = Buffer.from(data, 'base64'); // base64-Text -> Bytes
            if (b1.length > 2 && b1[0] === 0x78) buf = b1; // zlib-Magic 0x78 -> war base64
            else {
              const b2 = Buffer.from(data, 'latin1');
              if (b2[0] === 0x78) buf = b2;
            }
          } else if (data && typeof data === 'object') {
            const ks = Object.keys(data).filter((k) => /^\d+$/.test(k)).map(Number).sort((a, b) => a - b);
            if (ks.length) buf = Buffer.from(ks.map((k) => data[k]));
          }
          if (buf && buf.length && buf[0] === 0x78) {
            // zlib-Frame -> base64 (gleiche Form wie mapstr[].map, Merger inflatet es)
            freshBase64 = buf.toString('base64');
            this.log.info(`[MAP] frische Karte geladen (force I): ${freshObj} (${buf.length} B)`);
            // Raum-Einstellungen (cleanset) aus demselben Objekt mitnehmen. Beim Adapterstart
            // kommt kein object_name-Push, d.h. Aenderungen, die waehrend der Adapter aus war
            // in der App gemacht wurden, wuerden sonst nie ankommen. Kein zusaetzlicher
            // Download — der Inhalt liegt hier bereits vor.
            try {
              await this._applyCleansetFromInflated(
                zlib.inflateSync(buf).toString('latin1'), String(device.did), 'Kartenabruf', freshObj);
            } catch (e) {
              this._meldeFehler('[CLEANSET] aus Kartenabruf nicht lesbar', e);
            }
          } else {
            this.log.warn('[MAP] frisches Objekt: kein zlib-Frame erkannt (' + typeof data + ')');
          }
        }
      } else if (freshRaw) {
        // Karte kam DIREKT in der Aktions-Antwort (base64-zlib-Frame) — wie HA raw_map_data
        freshBase64 = String(freshRaw);
        this.log.info(`[MAP] frische Karte direkt aus Antwort erhalten (${freshBase64.length} Zeichen)`);
      } else {
        this.log.debug('[MAP] force-I lieferte weder object_name noch Rohdaten -> Fallback');
      }
    } catch (e) {
      this.log.warn('[MAP] request_map(force I) fehlgeschlagen: ' + (e && e.message));
    }

    // Frische Karte in den Merger geben. KEIN reset(): die HA-Sequenzregeln im Merger
    // entscheiden selbst (aelterer I-Frame per timestamp wird uebersprungen — so kann
    // die veraltete gespeicherte Karte eine frischere Live-Basis nicht ueberschreiben).
    let freshBaseSet = false;
    if (freshBase64) {
      try {
        if (!this.mapMerger) {
          this.mapMerger = new MapMerger({ log: this.log });
          // Geraete-Faehigkeiten wie HA (types.py 3105 + 3243) — s. MQTT-Pfad.
          const lidarNavigation = !(this.specPropsToIdDict[device.did] && this.specPropsToIdDict[device.did]['13-1']);
          const objectShift = lidarNavigation && String(device.model || '').includes('p20');
          this.mapMerger.setCapability({ lidarNavigation, objectShift });
          this._checkVslamSupport(device.did, lidarNavigation, device.model);
        }
        this._diagFrame('getMap-Fresh', freshBase64);
        const base = this.mapMerger.process(freshBase64);
        if (base) {
          await this._writeMerged(device.did, base);
          freshBaseSet = true;
        }
      } catch (e) {
        this.log.warn('[MERGE] frische Basis: ' + (e && e.message));
      }
    }
  }

  // ===== _kartenPaketEmpfangen (aus dem MQTT-Empfaenger herausgeloest) =====
  /**
   * Nimmt ein Kartenpaket aus dem MQTT-Strom (Eigenschaft 6-1) entgegen, gibt es an den
   * Zusammenbau weiter und fordert fehlende Zwischenbilder bzw. ein Vollbild nach.
   *
   * Stand bis Umbau 3/3 eingebettet im MQTT-Empfaenger. Herausgeloest, weil dieser vom
   * Original stammt und moeglichst unveraendert bleiben soll.
   */
  async _kartenPaketEmpfangen(did, encode) {
    // P-Frame-Live-Overlay nur wenn aktiviert (siehe this.mergePFrames).
    if (this.mergePFrames) {
      this._diagFrame('MQTT-6-1', encode);
      try {
        if (!this.mapMerger) {
          this.mapMerger = new MapMerger({ log: this.log });
          // Geraete-Faehigkeiten wie HA (types.py):
          //   3105: lidar_navigation = get_property(MAP_SAVING) is None
          //         MAP_SAVING = siid 13 / piid 1 (types.py 1714) -> bei uns:
          //         Eigenschaft existiert nicht in der Geraete-Spec.
          //   3243: object_shift = lidar_navigation and "p20" in model
          const capDev = this.deviceArray.find((d) => String(d.did) === String(did));
          const lidarNavigation = !(this.specPropsToIdDict[did] && this.specPropsToIdDict[did]['13-1']);
          const objectShift = lidarNavigation && String((capDev && capDev.model) || '').includes('p20');
          this.mapMerger.setCapability({ lidarNavigation, objectShift });
          this._checkVslamSupport(did, lidarNavigation, capDev && capDev.model);
        }
        // Geraetestatus fuer HAs Render-Vorverarbeitung (device.py self.status.*) —
        // synchron aus dem Eigenschaftsspeicher, nicht aus der State-Datenbank.
        this.mapMerger.setDeviceStatus(this._deviceStatus(did));
        const merged = this.mapMerger.process(encode);
        if (merged) this._writeMergedThrottled(did, merged);
        // Kleine Frame-Luecke: fehlenden P-Frame GEZIELT nachfordern
        // (HA _request_missing_p_map: {"map_id","req_type":1,"frame_id","frame_type":"P"},
        //  max. 1x/3s je map/frame)
        if (this.mapMerger.requestPFrame) {
          const rq = this.mapMerger.requestPFrame;
          this.mapMerger.requestPFrame = null;
          const rqKey = `${rq.mapId}:${rq.frameId}`;
          const nowP = Date.now();
          if (this._lastPReqKey !== rqKey || !this._lastPReqTime || nowP - this._lastPReqTime > 3000) {
            this._lastPReqKey = rqKey;
            this._lastPReqTime = nowP;
            this.log.debug(`[MERGE] fordere fehlenden P-Frame an: map=${rq.mapId} frame=${rq.frameId}`);
            this.sendCommand({
              did: did,
              method: 'action',
              params: {
                did: did,
                siid: 6,
                aiid: 1,
                in: [{ piid: 2, value: JSON.stringify({ map_id: rq.mapId, req_type: 1, frame_id: rq.frameId, frame_type: 'P' }) }],
              },
            })
              .then(async (rm) => {
                // Antwort wie HA _request_next_p_map auswerten: der fehlende Frame
                // kommt als piid 1 (Rohdaten) oder piid 3 (object_name) ZURUECK.
                const res = rm && (rm.result !== undefined ? rm.result : rm);
                if (!res || res.code !== 0 || !Array.isArray(res.out)) return;
                let objName = null;
                let rawMap = null;
                for (const p of res.out) {
                  if (p.value === undefined || p.value === null || p.value === '') continue;
                  if (p.piid === 3) objName = p.value;
                  else if (p.piid === 1) rawMap = p.value;
                }
                if (!rawMap && objName) {
                  const mDev = this.deviceArray.find((dv) => String(dv.did) === String(did));
                  if (mDev) rawMap = await this._downloadMapB64(objName, mDev);
                }
                if (rawMap) {
                  this.log.debug(`[MERGE] fehlender P-Frame erhalten: map=${rq.mapId} frame=${rq.frameId}`);
                  const merged2 = this.mapMerger.process(String(rawMap));
                  if (merged2) await this._writeMerged(did, merged2);
                }
              })
              .catch((e) => this._meldeFehler('[MERGE] P-Frame-Anforderung fehlgeschlagen', e));
          }
        }
        // Wie HA: bei fehlender Basis, Map-ID-Wechsel oder grosser Frame-Luecke
        // fordert der Merger eine frische Komplett-Karte an (throttled 60s).
        if (this.mapMerger.needMapRequest) {
          this.mapMerger.needMapRequest = false;
          const now = Date.now();
          if (!this._lastAutoMapFetch || now - this._lastAutoMapFetch > 60000) {
            this._lastAutoMapFetch = now;
            const mDevice = this.deviceArray.find((dv) => String(dv.did) === String(did));
            if (mDevice && !this.isMower(mDevice)) {
              this.log.debug('[MERGE] Sequenz-Luecke/Map-Wechsel -> frische Karte anfordern');
              this.getMap(mDevice, false);
            }
          }
          if (!this.mapMerger.current) {
            const now2 = Date.now();
            if (!this._noBaseMapWarn || now2 - this._noBaseMapWarn > 60000) {
              this._noBaseMapWarn = now2;
              this.log.error(
                'Es ist noch keine vollständige Karte geladen. Bitte den Adapter einmal starten, während der Roboter in der Ladestation steht (dann wird die komplette Karte geladen).',
              );
            }
          }
        }
      } catch (e) {
        this.log.warn('[MERGE] MQTT-Frame: ' + e.message);
      }
    }
  }

  // ===== _cleansetNachladenPruefen (aus dem MQTT-Empfaenger herausgeloest) =====
  /**
   * Laedt die Raum-Einstellungen nach, wenn das Geraet einen neuen object_name (6-3)
   * pusht — das passiert, sobald in der App etwas an einem Raum geaendert wurde.
   *
   * Stand bis Umbau 3/3 eingebettet im MQTT-Empfaenger. Herausgeloest, weil dieser vom
   * Original stammt und moeglichst unveraendert bleiben soll.
   */
  _cleansetNachladenPruefen(did, device, element) {
    // Raum-Einstellungen frisch halten: Aendert man in der App etwas an einem Raum, pusht
    // das Geraet sofort einen neuen object_name (6-3). Die Werte selbst stecken im
    // dahinterliegenden Cloud-Objekt, also dieses nachladen (wie HA handle_properties).
    // Nicht waehrend der Reinigung (HA: `not self._device_running`) — da kommen die Werte
    // ohnehin mit den Kartenframes und der Push feuert dauernd.
    if (device && !this.isMower(device) && element.siid === 6 && element.piid === 3) {
      const _obj = String(element.value || '');
      const _st = this._deviceStatus(did);
      // Direkt nach dem Adapterstart ist der Eigenschaftsspeicher noch leer (taskStatus
      // null); deviceStatusFlags meldet dann faelschlich "started" (taskStatus -1) und das
      // Nachladen wuerde uebersprungen. Nur ueberspringen, wenn der Status bekannt IST.
      const _laeuft = _st.taskStatus != null && deviceStatusFlags(_st).started;
      // NICHT nach object_name drosseln: der Name bleibt gleich (.../0), nur der Inhalt
      // dahinter aendert sich. HA laedt bei jedem Push (handle_properties). Hier nur eine
      // Zeit-Drossel gegen Push-Gewitter.
      const _now = Date.now();
      if (_obj && !_laeuft && (!this._lastCleansetLoad || _now - this._lastCleansetLoad > 5000)) {
        this._lastCleansetLoad = _now;
        this._loadCleansetFromObject(_obj, device).catch(() => {});
      }
    }
  }

}

/**
 * Heftet die Methoden oben an die Adapter-Klasse. Class-Methoden sind nicht
 * aufzaehlbar, deshalb geht das nicht mit Object.assign, sondern nur ueber
 * getOwnPropertyNames.
 *
 * @param {Function} Klasse  die Adapter-Klasse (main.js: Dreame)
 */
function einhaengen(Klasse) {
  for (const name of Object.getOwnPropertyNames(MapController.prototype)) {
    if (name === 'constructor') continue;
    Klasse.prototype[name] = MapController.prototype[name];
  }
}

module.exports = { einhaengen };
