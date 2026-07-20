'use strict';
/*
 * Dreame-Karten-Merge (HA-Port) — Integrationsschicht
 * ====================================================
 * Logik portiert aus:
 *   dreame-vacuum (Home Assistant Integration) von Tasshack
 *   https://github.com/Tasshack/dreame-vacuum — Copyright (c) 2022 Tasshack — MIT License
 *
 * Der eigentliche 1:1-Port von HAs decode_map_data_from_partial /
 * decode_p_map_data_from_partial liegt in lib/haDecode.js (reiner Datenparser).
 * Diese Datei ist die duenne Integrationsschicht: Frame-Sequenz (welcher Frame darf
 * wann angewendet werden — entspricht HAs _add_map_data), sowie die Serialisierung des
 * Ergebnisses in das Wire-Format, das das Widget (dreame/index.html) via
 * dreame.<inst>.<did>.map.mergedCloud konsumiert (unveraendertes Format, damit das
 * Widget in diesem Schritt nicht angefasst werden muss).
 *
 * MIT License — the above copyright notice and this permission notice shall be
 * included in all copies or substantial portions of the Software.
 * -----------------------------------------------------------------------------
 */

let pako;
try {
  pako = require('pako');
} catch (e) {
  const zlib = require('zlib');
  pako = { inflate: (b) => zlib.inflateSync(Buffer.from(b)), deflate: (b) => zlib.deflateSync(Buffer.from(b)) };
}
const { Buffer } = require('buffer');
const { MapPixelType, deviceStatusFlags, DreameVacuumTaskStatus } = require('./haMap');
const { HEADER_SIZE, buildPartialMapFromInflated, decodeMapDataFromPartial, decodePMapDataFromPartial } = require('./haDecode');

// HA PathType (types.py 2601-2605) -> Zahl im trpts-Feld. Siehe Kommentar an der
// Verwendungsstelle: 0 muss "Fortsetzung" bleiben, alles andere "neuer Abschnitt".
const TRPT_TYP = { L: 0, S: 1, W: 2, M: 3 };

function readHeader(buf) {
  return {
    mapId: buf.readInt16LE(0),
    frameId: buf.readInt16LE(2),
    frameType: buf.readUInt8(4),
    gridSize: buf.readInt16LE(17),
    width: buf.readInt16LE(19),
    height: buf.readInt16LE(21),
    originX: buf.readInt16LE(23),
    originY: buf.readInt16LE(25),
  };
}

class MapMerger {
  constructor(opts = {}) {
    this.log = opts.log || { debug() {}, info() {}, warn() {} };
    // Karten-Version wie HA map_version(): aus Geraete-Faehigkeiten; Standard 1,
    // map_v2-Geraete = 3. Per Option konfigurierbar (opts.mapVersion). haDecode erkennt
    // v3 zusaetzlich automatisch aus dem JSON (saveMapId/cover/diff/curtain), wie HAs
    // decode_map_partial.
    this.mapVersion = opts.mapVersion || 1;
    // current: das volle HA-mapData-Objekt aus haDecode (segments, pixel_type, data,
    // dimensions, ... siehe dortige Doku) + _headerBase (letzter roher 27-Byte-Header,
    // fuer robot/charger-Winkel im Wire-Format).
    this.current = null;
    // Frame-Sequenz wie HA _add_map_data: P-Frames nur in Reihenfolge (frame_id+1)
    // anwenden; Luecken werden gepuffert, bei zu grosser Luecke neue Karte anfordern.
    this.currentFrameId = null;
    this.currentMapId = null;
    this.pQueue = new Map();      // frame_id -> partialMap
    this.needMapRequest = false;  // Aufrufer soll eine frische Komplett-Karte holen
    this.requestPFrame = null;    // Aufrufer soll diesen P-Frame nachfordern {mapId, frameId}
    // Live-Geraetestatus fuer die Render-Vorverarbeitung (HA: self.status.* in device.py).
    // Muss vom Aufrufer aktuell gehalten werden (setDeviceStatus), sonst greifen die
    // Riegel gegen veraltete active_segments/areas/points nicht.
    this.deviceStatus = { taskStatus: null, status: null, cleaningPaused: false };
    // Geraete-Faehigkeiten fuer die Ursprungs-Verschiebung (device.py 3071-3085).
    // Defaults wie HAs DreameVacuumDeviceCapability-Konstruktor:
    //   lidar_navigation = True  (types.py 2901)
    //   object_shift     = False (types.py 2932)
    // Echte Werte setzt der Aufrufer per setCapability() aus Spec + Modellname.
    this.capability = { lidarNavigation: true, objectShift: false };
    // HA: map_data.dirty / MapManager._updated_frame_id (map.py 1906-1907, 2005, 2027).
    // Werden von den Editor-Operationen (clearPath/resetMap) gesetzt und beim naechsten
    // I-Frame wieder frisch (HA legt dort ein neues MapData-Objekt an -> dirty default False).
    //
    // ➖ NICHT portiert: HAs Carry-over-Zweig (map.py 941-960), der beim neuen I-Frame
    // active_segments/path/... vom alten Stand uebernimmt. Er verlangt `_updated_frame_id`
    // gesetzt UND `dirty == False` — diese Kombination erzeugen ausschliesslich HAs
    // optimistische Setter (set_active_segments & Co., die HA beim Absenden eines Befehls
    // aufruft, um sofort vorzufaerben). Die haben wir nicht: unsere Editor-Operationen
    // setzen immer dirty = true. Der Zweig koennte bei uns also nie feuern.
    this.updatedFrameId = null;
  }

  /**
   * Live-Geraetestatus setzen (Rohwerte der Properties 4-7 / 4-1 / 4-17). HA liest die in
   * device.py direkt vom Geraeteobjekt; bei uns speist sie der Eigenschaftsspeicher aus
   * main.js (gleicher Zeitpunkt: sobald der Wert per MQTT ankommt).
   */
  setDeviceStatus(s) {
    if (s) this.deviceStatus = { taskStatus: s.taskStatus, status: s.status, cleaningPaused: !!s.cleaningPaused };
  }

  /**
   * Geraete-Faehigkeiten setzen (HA: DreameVacuumDeviceCapability).
   *   lidarNavigation — types.py 3105: Geraet hat die MAP_SAVING-Eigenschaft (siid 13,
   *                     piid 1, types.py 1714) NICHT -> Lidar-Navigation.
   *   objectShift     — types.py 3243: lidar_navigation UND "p20" im Modellnamen.
   */
  setCapability(c) {
    if (c) this.capability = { lidarNavigation: !!c.lidarNavigation, objectShift: !!c.objectShift };
  }

  /**
   * map.py: DreameVacuumMapEditor.refresh_map (1919-1921) -> _refresh_map (1909-1917).
   * HA setzt dort last_updated und stoesst das Neuzeichnen an (0.2s-Timer als Sammelfenster).
   * Bei uns: Wire-Paket aus dem vorhandenen Kartenstand neu bauen. Wichtig, weil unser
   * Paket sonst NUR beim Eintreffen eines Kartenframes entsteht — steht der Roboter in der
   * Station, kommen keine Frames mehr und der letzte Stand friert ein (z.B. Ausgrauung
   * eines laengst beendeten Auftrags).
   * @returns {string|null} neues Wire-Paket oder null, wenn keine Karte vorliegt
   */
  refresh() {
    if (!this.current) return null;
    return this._buildFrame();
  }

  /**
   * map.py: DreameVacuumMapEditor.clear_path (1997-2007) — "Clear path on current map on
   * cleaning start as implemented on the app" (device.py 1149).
   */
  clearPath() {
    const m = this.current;
    if (!m) return null;
    m.path = null;
    m.obstacles = null;
    m.active_cruise_points = null;
    m.active_areas = null;
    m.active_segments = null;
    m.dirty = true;
    this.updatedFrameId = m.frame_id;
    this.log.debug('[MERGE] clear_path (Reinigung gestartet)');
    return this.refresh();
  }

  /**
   * map.py: DreameVacuumMapEditor.reset_map (2009-2029) — "Clear current map on mapping
   * start as implemented on the app" (device.py 1152).
   */
  resetMap() {
    const m = this.current;
    if (!m || m.new_map || m.empty_map) return null;
    m.dimensions.width = 0;
    m.dimensions.height = 0;
    m.segments = {};
    m.floor_material = null;
    m.carpet_cleanset = null;
    m.hidden_segments = null;
    m.unmapped_segments = null;
    m.path = null;
    m.carpets = null;
    m.detected_carpets = null;
    m.deleted_carpets = null;
    m.carpet_pixels = null;
    m.obstacles = null;
    m.empty_map = true;
    m.saved_map_status = 0;
    m.dirty = true;
    this.updatedFrameId = m.frame_id + 1;
    this.log.debug('[MERGE] reset_map (Kartenfahrt gestartet)');
    return this.refresh();
  }

  reset() {
    this.current = null;
    this.currentFrameId = null;
    this.currentMapId = null;
    this.pQueue = new Map();
    this.needMapRequest = false;
    this.requestPFrame = null;
  }

  _inflate(b64) {
    try {
      return Buffer.from(pako.inflate(Buffer.from(b64, 'base64')));
    } catch (e) {
      this.log.debug('[MERGE] inflate fehlgeschlagen: ' + e.message);
      return null;
    }
  }

  /** base64/zlib-Frame -> partialMap (haDecode-Format) oder null */
  _parseFrame(b64) {
    const inflated = this._inflate(b64);
    if (!inflated || inflated.length < HEADER_SIZE) return null;
    try {
      return buildPartialMapFromInflated(inflated, this.mapVersion);
    } catch (e) {
      this.log.debug('[MERGE] Frame-Header/JSON ungueltig: ' + e.message);
      return null;
    }
  }

  /**
   * Verarbeitet einen rohen Karten-Frame (base64/zlib).
   * Frame-Sequenz wie HA _add_map_data (map.py ~690-785): map_id-Wechsel und
   * Frame-Luecken werden erkannt; bei Luecke wird gepuffert, bei zu grosser Luecke
   * this.needMapRequest gesetzt (Aufrufer holt frische Komplett-Karte).
   * @returns {string|null} base64 des gemergten Frames (HA-Pixeltypen), oder null.
   */
  process(b64) {
    const partial = this._parseFrame(b64);
    if (!partial) return null;

    if (partial.frameType === 73) {
      // HA: aelterer I-Frame (timestamp) wird uebersprungen — schuetzt davor, dass die
      // veraltete gespeicherte Karte eine frischere Live-Basis ueberschreibt.
      if (this.current) {
        const curTs = this.current.timestamp_ms;
        const newTs = partial.timestampMs;
        if (!(newTs && (!curTs || newTs >= curTs))) {
          this.log.debug(`[MERGE] I-Frame uebersprungen (timestamp ${newTs} < ${curTs})`);
          return null;
        }
      }
      this._applyIFrame(partial);
      this._drainQueue();
      return this._buildFrame();
    }

    if (partial.frameType !== 80) return null;

    // --- P-Frame-Sequenzregeln (HA _add_map_data) ---
    if (!this.current) {
      this.log.debug(`[MERGE] P-Frame (map=${partial.mapId}) ohne Basiskarte -> Karte anfordern`);
      this.needMapRequest = true;
      return null;
    }
    if (this.currentMapId !== null && partial.mapId !== this.currentMapId) {
      // HA: bei Map-ID-Wechsel current-IDs nullen, neue Frames PUFFERN und I-Karte
      // anfordern — die gepufferten Frames werden nach der neuen Basis angewandt.
      this.log.debug(`[MERGE] Map-ID-Wechsel ${this.currentMapId} -> ${partial.mapId} -> puffern, frische Karte anfordern`);
      this.pQueue.clear();
      this.currentFrameId = null;
      this.currentMapId = null;
      this.pQueue.set(partial.frameId, partial);
      this.needMapRequest = true;
      return null;
    }
    if (this.currentFrameId === null) {
      // Warten auf neue I-Basis (nach Map-Wechsel): nur puffern
      this.pQueue.set(partial.frameId, partial);
      if (this.pQueue.size > 16) this.pQueue.clear();
      this.needMapRequest = true;
      return null;
    }
    if (partial.frameId <= this.currentFrameId) {
      this.log.debug(`[MERGE] P-Frame ${partial.frameId} <= ${this.currentFrameId} -> uebersprungen`);
      return null;
    }
    if (partial.frameId !== this.currentFrameId + 1) {
      this.pQueue.set(partial.frameId, partial);
      if (this.pQueue.size > 8) {
        // grosse Luecke -> komplette Karte neu (HA: _request_map)
        this.log.debug(`[MERGE] ${this.pQueue.size} P-Frames in Luecke -> Karte anfordern`);
        this.pQueue.clear();
        this.needMapRequest = true;
      } else {
        // kleine Luecke -> fehlenden P-Frame GEZIELT nachfordern (HA: _request_next_p_map)
        this.requestPFrame = { mapId: this.currentMapId, frameId: this.currentFrameId + 1 };
      }
      return null;
    }

    this._applyPFrame(partial);
    this._drainQueue();
    return this._buildFrame();
  }

  /** Gepufferte P-Frames in Reihenfolge abarbeiten (HA _unqueue_partial_map) */
  _drainQueue() {
    // Frames einer anderen Karten-Session verwerfen (z.B. nach neuem I-Frame)
    for (const [k, p] of [...this.pQueue.entries()]) {
      if (this.currentMapId !== null && p.mapId !== this.currentMapId) this.pQueue.delete(k);
    }
    while (this.currentFrameId !== null && this.pQueue.has(this.currentFrameId + 1)) {
      const next = this.pQueue.get(this.currentFrameId + 1);
      this.pQueue.delete(this.currentFrameId + 1);
      this._applyPFrame(next);
    }
    for (const k of [...this.pQueue.keys()]) {
      if (this.currentFrameId !== null && k <= this.currentFrameId) this.pQueue.delete(k);
    }
  }

  /** I-Frame anwenden: komplette Karte = neue Basis (haDecode.decodeMapDataFromPartial) */
  _applyIFrame(partial) {
    const [mapData] = decodeMapDataFromPartial(partial, 0);
    mapData._headerBase = Buffer.from(partial.raw.slice(0, HEADER_SIZE));
    this.current = mapData;
    this.currentFrameId = partial.frameId;
    this.currentMapId = partial.mapId;
    this.log.debug(`[MERGE] I-Frame Basis: map=${partial.mapId} frame=${partial.frameId} ${mapData.dimensions.width}x${mapData.dimensions.height}`);
  }

  /** P-Frame anwenden: Delta ueber haDecode.decodePMapDataFromPartial (mutiert this.current) */
  _applyPFrame(partial) {
    const mapData = decodePMapDataFromPartial(partial, this.current);
    mapData._headerBase = Buffer.from(partial.raw.slice(0, HEADER_SIZE));
    // Fahrspur begrenzen (Widget-Performance) — HA selbst deckelt path nicht, das ist eine
    // reine Integrations-Sicherung hier, kein Teil des 1:1-Ports.
    if (mapData.path && mapData.path.length > 8000) mapData.path = mapData.path.slice(-8000);
    this.current = mapData;
    this.currentFrameId = partial.frameId;
    this.currentMapId = partial.mapId;
    this.log.debug(`[MERGE] P-Frame gemergt: map=${partial.mapId} frame=${partial.frameId} -> ${mapData.dimensions.width}x${mapData.dimensions.height}`);
  }

  /**
   * Baut aus this.current (HA-mapData) einen synthetischen I-Frame (base64/zlib) im
   * bestehenden Wire-Format, das dreame/index.html (decode()) erwartet: 27-Byte-Header +
   * Pixel-Bytes (HA-Pixeltypen) + JSON-Trailer mit seg_inf, ha-Objekt, trpts, carpetPx.
   * Neu aus haDecode verfuegbare, bisher ungenutzte Felder werden unter ha.* zusaetzlich
   * mitgeliefert (Rendering/Bedienelemente dafuer: separates Thema mit dem Nutzer).
   */
  /**
   * 1:1-Port der Render-Vorverarbeitung aus device.py (_render_map, ~3016-3253), soweit sie
   * die Felder betrifft, die wir ans Widget liefern. HA arbeitet dort auf einer deepcopy
   * (3022) — deshalb darf hier NICHTS an this.current geaendert werden, sonst wuerde sich
   * z.B. die l2r-Roboterposition dauerhaft in die gespeicherte Spur einbrennen.
   *
   * Hintergrund (HA-Kommentare im Original): "Map data always contains last active
   * segments/areas/points" — das Geraet laesst die Werte des LETZTEN Auftrags in den
   * Kartendaten stehen. Ohne diese Riegel bliebe die Ausgrauung dauerhaft haengen.
   *
   * @returns {{activeSegments: number[]|null, zoneCleaning: boolean, path: Array}}
   */
  _renderPreprocess(m) {
    const flags = deviceStatusFlags(this.deviceStatus);
    const T = DreameVacuumTaskStatus;

    // device.py 3104-3109: "Map data always contains last active segments"
    // (wifi_map/cleaning_map/history_map liefern wir nicht -> nur der segment_cleaning-Riegel)
    const activeSegments = flags.segmentCleaning ? m.active_segments || null : null;

    // device.py 3165-3171 + 3173-3175: "Map data always contains last active areas/points"
    // go_to_zone ➖ nicht portiert (HA-Integrations-Feature) -> dauerhaft false
    let activeAreas = m.active_areas || null;
    let activePoints = m.active_points || null;
    if (flags.started && !(flags.zoneCleaning || (activeAreas && flags.taskStatus === T.DOCKING_PAUSED))) {
      activeAreas = null;
    }
    if (flags.started && !flags.spotCleaning) activePoints = null;

    // device.py 3219-3223. Fuer LIVE-Karten ist das die einzige Stelle, die zone_cleaning
    // setzt: map.py 6748 sieht zwar gleich aus, steckt aber komplett in `if
    // map_data.history_map:` (6718) und greift damit nur fuer Verlaufskarten.
    const zoneCleaning = Boolean(
      (flags.zoneCleaning && activeAreas && activeAreas.length) ||
        (flags.spotCleaning && activePoints && activePoints.length),
    );

    // device.py 3245-3253: "App adds robot position to paths as last line when map data is
    // line to robot" — das Geraet liefert die Spur verzoegert; App und HA haengen deshalb
    // beim Zeichnen die aktuelle Roboterposition als letzten Linienpunkt an. Nur auf der
    // Kopie (siehe oben), niemals an m.path.
    let path = m.path || [];
    if (m.line_to_robot && path.length && m.robot_position) {
      path = path.concat([{ x: m.robot_position.x, y: m.robot_position.y, path_type: 'L' }]);
    }

    return { activeSegments, zoneCleaning, path };
  }

  _buildFrame() {
    const m = this.current;
    const dims = m.dimensions;
    const pre = this._renderPreprocess(m);

    const hdr = Buffer.alloc(HEADER_SIZE);
    hdr.writeInt16LE(m.map_id || 0, 0);
    hdr.writeInt16LE(m.frame_id || 0, 2);
    hdr.writeUInt8(73, 4); // frame_type = I
    const rp = m.robot_position || { x: 32767, y: 32767, a: 32767 };
    const cp = m.charger_position || { x: 32767, y: 32767, a: 32767 };
    hdr.writeInt16LE(rp.x, 5); hdr.writeInt16LE(rp.y, 7); hdr.writeInt16LE(rp.a, 9);
    hdr.writeInt16LE(cp.x, 11); hdr.writeInt16LE(cp.y, 13); hdr.writeInt16LE(cp.a, 15);
    hdr.writeInt16LE(dims.grid_size, 17);
    hdr.writeInt16LE(dims.width, 19);
    hdr.writeInt16LE(dims.height, 21);
    // device.py 3071-3085 (_render_map, auf der Render-Kopie): HA verschiebt fuer
    // Lidar-Roboter den Karten-Ursprung, bevor gerendert wird. HA-Kommentar:
    // "Second generation vacuum plugins calculates offsets wrong due to a bug which
    // causes objects to be rendered shifted according to map rotation".
    //   object_shift (nur "p20"-Modelle): GANZE Zelle, drehungsabhaengig
    //   sonst (z.B. X40):                 HALBE Zelle (dimensions.offset), beide Achsen
    // Alle Welt-mm-Objekte (Zonen, Roboter, Spur, Moebel) haengen damit am Ursprung der
    // Hersteller-Plugins; die Pixelkarte (Wandbild) kennt keinen Ursprung und bleibt.
    // Nur der Wire-Header wird verschoben — this.current bleibt unveraendert (HA arbeitet
    // auf copy.deepcopy, device.py 3022).
    let left = dims.left;
    let top = dims.top;
    if (this.capability.lidarNavigation) {
      const rotation = m.rotation || 0;
      if (this.capability.objectShift) {
        const offset = dims.grid_size;
        if (rotation === 0 || rotation === 90) left = dims.original_left - offset;
        if (rotation === 0 || rotation === 270) top = dims.original_top - offset;
      } else {
        left = dims.original_left - dims.offset;
        top = dims.original_top - dims.offset;
      }
    }
    hdr.writeInt16LE(left, 23);
    hdr.writeInt16LE(top, 25);

    const pixels = Buffer.from(m.pixel_type || new Uint8Array(dims.width * dims.height));

    // seg_inf im alten Rohformat nachbauen — jetzt aus dem VOLLSTAENDIG gemergten
    // mapData.segments (live + gespeicherte Karte + HA-Faelle), nicht mehr aus einem
    // einzelnen JSON-Schnipsel.
    const segInf = {};
    const colorIndex = {};
    for (const [id, seg] of Object.entries(m.segments || {})) {
      segInf[id] = {
        type: seg.type || 0,
        nei_id: seg.neighbors || [],
        index: seg.index || 0,
        roomID: seg.unique_id ?? null,
        direction: seg.floor_material_direction ?? null,
        material: seg.floor_material ?? null,
      };
      if (seg.custom_name) {
        try { segInf[id].name = Buffer.from(seg.custom_name, 'utf8').toString('base64'); } catch (e) { /* ignore */ }
      }
      if (seg.color_index != null) colorIndex[id] = seg.color_index;
    }

    const furnitures = [];
    const furnSrc = m.furnitures || m.saved_furnitures;
    if (furnSrc) {
      for (const f of Object.values(furnSrc)) {
        furnitures.push({ x: f.x, y: f.y, w: f.width, h: f.height, type: f.type, angle: f.angle || 0, seg: f.segment_id || 0 });
      }
    }

    const asRect4 = (list) => (list || []).map((a) => [a.x0, a.y0, a.x2, a.y2]);
    const asLine4 = (list) => (list || []).map((l) => [l.x0, l.y0, l.x1, l.y1]);

    const metaObj = {
      seg_inf: segInf,
      ha: {
        colorIndex,
        hiddenSegments: m.hidden_segments || [],
        furnitures,
        curtains: asLine4(m.curtains),
        virtualWalls: asLine4(m.virtual_walls),
        noGo: asRect4(m.no_go_areas),
        noMop: asRect4(m.no_mopping_areas),
        carpets: asRect4(m.carpets),
        deletedCarpets: asRect4(m.deleted_carpets),
        detectedCarpets: (m.detected_carpets || []).map((c) => ({ id: c.id, polygon: c.polygon, hidden: c.hidden })),
        robotAngle: m._headerBase ? m._headerBase.readInt16LE(9) : 0,
        // Raeume des laufenden Auftrags (data_json.sa). HA faerbt beim Rendern alle
        // Segmente, die NICHT drin stehen, mit color_scheme.passive_segment (map.py 9164).
        // Durch die Geraetestatus-Riegel aus device.py (siehe _renderPreprocess), sonst
        // bliebe die Ausgrauung nach Auftragsende dauerhaft stehen.
        activeSegments: pre.activeSegments,
        // device.py 3219: nur bei tatsaechlich laufender Zonen-/Punktreinigung. HA
        // ueberspringt dann die Segment-Einfaerbung, beim Zeichnen greift der Fallback
        // (area_colors.get -> NEW_SEGMENT-Farbe, map.py 9215-9217).
        zoneCleaning: pre.zoneCleaning,
        // Bisher ungenutzt im Widget (Daten sind jetzt vollstaendig da — Rendering/
        // Bedienelemente dafuer: separates Thema, siehe PORT_STATUS.md):
        obstacles: m.obstacles || null,
        laserObstacles: m.laser_obstacles || null,
        lowLyingAreas: m.low_lying_areas || null,
        cruisePoints: m.active_cruise_points || null,
        predefinedPoints: m.predefined_points || null,
        blockedSegments: m.blocked_segments || null,
        walls: m.walls || null,
        doors: m.doors || null,
        wallsVersion: m.walls_version ?? null,
        routerPosition: m.router_position || null,
        cleaningSequence: m.cleaning_sequence || null,
        mopType: m.mop_type || null,
        ramps: asRect4(m.ramps),
        cliffs: asLine4(m.cliffs),
        virtualThresholds: asLine4(m.virtual_thresholds),
        passableThresholds: asLine4(m.passable_thresholds),
        impassableThresholds: asLine4(m.impassable_thresholds),
        robotSegment: m.robot_segment ?? null,
        stationSegment: m.station_segment ?? null,
      },
      // pre.path = m.path, bei l2r zzgl. der aktuellen Roboterposition als letztem
      // Linienpunkt (device.py 3245-3253) — sonst haengt die Spur sichtbar hinterher.
      //
      // Drittes Feld = Punkttyp (HA PathType, types.py 2601-2605):
      //   0 = L (Fortsetzung)  1 = S (saugen)  2 = W (saugen+wischen)  3 = M (wischen)
      // Hier stand frueher nur 0/1 ("bricht die Linie ja/nein"). Damit ging die
      // Unterscheidung Saug-/Wischspur verloren, die HA zum Zeichnen braucht: die
      // Wischspur ist dort breiter und halbtransparent (map.py 10756-10842).
      // Die Zahlen sind bewusst so gewaehlt, dass eine aeltere Anzeige, die nur auf
      // "Wert != 0" prueft, unveraendert weiterlaeuft.
      trpts: pre.path.map((p) => [p.x, p.y, TRPT_TYP[p.path_type] ?? 1]),
      carpetPx: (m.carpet_pixels || []).map(([x, y]) => y * dims.width + x),
    };

    const meta = Buffer.from(JSON.stringify(metaObj), 'utf8');
    return Buffer.from(pako.deflate(Buffer.concat([hdr, pixels, meta]))).toString('base64');
  }
}

module.exports = { MapMerger, readHeader, HEADER_SIZE, MapPixelType };
