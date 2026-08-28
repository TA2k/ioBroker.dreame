// Test der HA-portierten Merge-/Decode-Logik.
// WICHTIG (wie HA decode_p_map_data_from_partial): P-Frame-Bytes sind bei version!=3
// DELTAS auf den Roh-Puffer ("P map only returns difference"); frame_map wird beim
// I-Frame ueber meta.fsm==1 erkannt, bei P-Frames erzwingt decode_p_map_data_from_partial
// immer frame_map=true auf der laufenden Karte.
//
// Fuer I-Frames benutzt HA (map.py decode_map_data_from_partial) einen EIGENEN,
// 5-verzweigten Pixel-Algorithmus (haMap.decodeIFramePixels) — NICHT _get_pixel_type
// (haMap.getPixelType, das ist nur fuer P-Frame-Deltas). Beide Algorithmen liefern nur
// im Normalfall (saved_map_status nicht 0/1/2) dasselbe Ergebnis.
const assert = require('assert');
const zlib = require('zlib');
const { MapMerger, readHeader, HEADER_SIZE, MapPixelType } = require('../lib/mapMerge');
const { getPixelType, setSegmentColorIndex, decodeIFramePixels, MapFrameType } = require('../lib/haMap');
const { decodeMapDataFromPartial, buildPartialMapFromInflated } = require('../lib/haDecode');

// rohen Frame bauen (Header + Pixel + Meta) -> base64/zlib
function buildFrame({ mapId = 1, frameId = 0, frameType, gridSize, width, height, originX, originY, pixels, meta }) {
  const hdr = Buffer.alloc(HEADER_SIZE, 0);
  hdr.writeInt16LE(mapId, 0);
  hdr.writeInt16LE(frameId, 2);
  hdr.writeUInt8(frameType, 4);
  hdr.writeInt16LE(gridSize, 17);
  hdr.writeInt16LE(width, 19);
  hdr.writeInt16LE(height, 21);
  hdr.writeInt16LE(originX, 23);
  hdr.writeInt16LE(originY, 25);
  const metaBuf = Buffer.from(JSON.stringify(meta || {}), 'utf8');
  return Buffer.from(zlib.deflateSync(Buffer.concat([hdr, Buffer.from(pixels), metaBuf]))).toString('base64');
}
function inflateFrame(b64) {
  return Buffer.from(zlib.inflateSync(Buffer.from(b64, 'base64')));
}
function decodeFrame(b64) {
  const raw = inflateFrame(b64);
  const h = readHeader(raw);
  const pix = raw.slice(HEADER_SIZE, HEADER_SIZE + h.width * h.height);
  const meta = JSON.parse(raw.toString('utf8', HEADER_SIZE + h.width * h.height) || '{}');
  return { h, pix, meta };
}
// frame_map-Kodierung: Wert steckt in den oberen Bits (Byte = wert << 2)
const R = (id) => id << 2;        // Raum-ID (Rohbyte)
const WALLB = 63 << 2;            // -> MapPixelType.WALL
const FLOORB = 62 << 2;           // -> MapPixelType.FLOOR
const UNKB = 61 << 2;             // -> MapPixelType.UNKNOWN

describe('mapMerge (HA-Port)', function () {
  it('deckt Parser, Merge-Sequenz, Editor-Operationen und Ursprungsverschiebung ab', function () {
    // --- 0) Parser (HA _get_pixel_type, frame_map-Zweig) — NUR fuer P-Frame-Deltas ---
    const ctx = { version: 1, frame_map: true, saved_map_status: 2 };
    assert(getPixelType(ctx, WALLB)[0] === MapPixelType.WALL, 'Parser: 63<<2 -> WALL');
    assert(getPixelType(ctx, FLOORB)[0] === MapPixelType.FLOOR, 'Parser: 62<<2 -> FLOOR');
    assert(getPixelType(ctx, UNKB)[0] === MapPixelType.UNKNOWN, 'Parser: 61<<2 -> UNKNOWN');
    assert(getPixelType(ctx, R(5))[0] === 5, 'Parser: Raum 5');
    assert(getPixelType(ctx, 0)[0] === MapPixelType.OUTSIDE, 'Parser: 0 -> OUTSIDE');
    assert(getPixelType(ctx, R(5) | 0x03)[1] === true, 'Parser: carpet-Flag (bits 0-1 == 3)');
    // version-1/2-Zweig (kein frame_map): bit7 = Wand
    const ctxV1 = { version: 1, frame_map: false, saved_map_status: 2 };
    assert(getPixelType(ctxV1, 0x80)[0] === MapPixelType.WALL, 'Parser v1/2: bit7 ohne seg -> WALL');
    assert(getPixelType(ctxV1, 5)[0] === 5, 'Parser v1/2: seg 5 (ris=2)');
    // version-3-Zweig
    const ctxV3 = { version: 3, frame_map: false, saved_map_status: 2 };
    assert(getPixelType(ctxV3, 31 | (1 << 5))[0] === MapPixelType.WALL, 'Parser v3: seg31+wall -> WALL');
    assert(getPixelType(ctxV3, 7)[0] === 7, 'Parser v3: seg 7');

    // --- 0b) I-Frame-Pixelalgorithmus (decodeIFramePixels) weicht bei saved_map_status 0/1
    //     bewusst von getPixelType ab (map.py hat hierfuer ZWEI verschiedene Algorithmen) ---
    {
      const pixel = 0x80 | 5; // bit7 gesetzt (Wand-Flag) + segment_id 5
      const viaGetPixelType = getPixelType({ version: 1, frame_map: false, saved_map_status: 1 }, pixel)[0];
      assert(viaGetPixelType === 105, 'getPixelType: bit7+seg5 -> 105 (P-Frame-Algorithmus, ignoriert saved_map_status bei bit7)');
      const viaIFrame = decodeIFramePixels({
        frameType: MapFrameType.I, version: 1, frameMap: false, savedMap: false, savedMapStatus: 1, recoveryMap: false,
        data: new Uint8Array([pixel]), width: 1, height: 1,
      });
      assert(viaIFrame.pixelType[0] === MapPixelType.OUTSIDE, 'decodeIFramePixels: saved_map_status=1 ignoriert bit7-Zweig komplett -> OUTSIDE (echtes HA-I-Frame-Verhalten)');
    }

    // --- 0c) Farb-Index-Algorithmus (set_segment_color_index) — neue Signatur (mapData, segmentInfo, wallsInfo) ---
    {
      const segInf = { 1: { nei_id: [3, 7] }, 2: { nei_id: [3, 6] }, 3: { nei_id: [1, 2, 4, 6] }, 4: { nei_id: [3] }, 5: { nei_id: [6] }, 6: { nei_id: [2, 3, 5] }, 7: { nei_id: [1] } };
      const mapDataStub = { version: 1, segments: Object.fromEntries(Object.keys(segInf).map((k) => [k, {}])) };
      const segmentInfo = Object.entries(segInf).map(([k, v]) => [parseInt(k, 10), v.nei_id, 0]);
      setSegmentColorIndex(mapDataStub, segmentInfo, null);
      const ci = Object.fromEntries(Object.entries(mapDataStub.segments).map(([k, v]) => [k, v.color_index]));
      assert(ci[2] !== ci[3] && ci[2] !== ci[6], 'Farben: Flur(2) kollidiert nicht mit Nachbarn 3/6');
      assert(ci[3] !== ci[4] && ci[3] !== ci[6] && ci[3] !== ci[1], 'Farben: 3 kollidiert mit keinem Nachbarn');
      assert(Object.values(ci).every((v) => v >= 0 && v <= 3), 'Farben: nur Indizes 0-3');
    }

    // --- 1) I-Frame (fsm=1 -> frame_map): Räume 1/2 + Wand ---
    const merger = new MapMerger();
    const iPix = Buffer.from([
      R(1), R(1), 0, 0,
      R(1), R(1), 0, 0,
      0, 0, R(2), R(2),
      WALLB, 0, R(2), R(2), // (0,3) = Wand
    ]);
    const iFrame = buildFrame({ frameId: 1, frameType: 73, gridSize: 50, width: 4, height: 4, originX: 0, originY: 0, pixels: iPix, meta: { fsm: 1, ris: 2, seg_inf: { 1: {}, 2: {} } } });
    const out = merger.process(iFrame);
    assert(!!out, 'I-Frame liefert Ergebnis');
    let d = decodeFrame(out);
    assert(d.h.frameType === 73, 'Ausgabe ist Typ 73');
    assert(d.pix[0] === 1 && d.pix[5] === 1, 'Raum 1 korrekt dekodiert');
    assert(d.pix[10] === 2, 'Raum 2 korrekt dekodiert');
    assert(d.pix[12] === MapPixelType.WALL, 'Wand -> MapPixelType.WALL (255)');
    assert(d.meta.seg_inf && d.meta.seg_inf[1] && d.meta.seg_inf[2], 'seg_inf im Wire-Format aus gemergten Segmenten aufgebaut');

    // --- 2) P-Frame = DELTAS: (0,0) Raum1->Raum3 (delta 8), (2,0) leer->Wand (delta 252),
    //     (1,1) Raum1->Boden (delta 244) ---
    const pPix = Buffer.from([
      R(3) - R(1), 0, WALLB, 0,
      0, FLOORB - R(1), 0, 0,
      0, 0, 0, 0,
      0, 0, 0, 0,
    ]);
    const pFrame = buildFrame({ frameId: 2, frameType: 80, gridSize: 50, width: 4, height: 4, originX: 0, originY: 0, pixels: pPix, meta: { ris: 2 } });
    d = decodeFrame(merger.process(pFrame));
    assert(d.h.width === 4 && d.h.height === 4, 'Dims unverändert');
    assert(d.pix[0] === 3, 'Delta auf Rohwert: Raum 1 + 8 -> Raum 3');
    assert(d.pix[2] === MapPixelType.WALL, 'Delta auf leer: 0 + 252 -> WALL');
    assert(d.pix[5] === MapPixelType.FLOOR, 'Delta: Raum 1 + 244 -> FLOOR');
    assert(d.pix[1] === 1 && d.pix[10] === 2, 'nicht berührte Zellen erhalten');
    assert(d.pix[12] === MapPixelType.WALL, 'Wand aus Basis erhalten');

    // --- 3) P-Frame erweitert die Karte nach rechts (Neuland: alter Rohwert 0 + Delta) ---
    const m2 = new MapMerger();
    m2.process(iFrame);
    const pRight = Buffer.from([R(5), R(5), R(5), R(5), R(5), R(5), R(5), R(5)]);
    const pFrame2 = buildFrame({ frameId: 2, frameType: 80, gridSize: 50, width: 2, height: 4, originX: 200, originY: 0, pixels: pRight, meta: { ris: 2 } });
    d = decodeFrame(m2.process(pFrame2));
    assert(d.h.width === 6, `Karte auf 6 verbreitert (war ${d.h.width})`);
    assert(d.pix[0] === 1, 'alte Karte links erhalten');
    assert(d.pix[4] === 5 && d.pix[5] === 5, 'Neuland: 0 + R(5) -> Raum 5');

    // --- 4) Zwei P-Frames nacheinander: Deltas akkumulieren auf dem Roh-Puffer ---
    const m3 = new MapMerger();
    m3.process(iFrame);
    // Frame A: (0,0) Raum1 -> Raum2 (delta 4)
    m3.process(buildFrame({ frameId: 2, frameType: 80, gridSize: 50, width: 1, height: 1, originX: 0, originY: 0, pixels: Buffer.from([R(2) - R(1)]), meta: { ris: 2 } }));
    // Frame B: (0,0) Raum2 -> Raum6 (delta 16)
    d = decodeFrame(m3.process(buildFrame({ frameId: 3, frameType: 80, gridSize: 50, width: 1, height: 1, originX: 0, originY: 0, pixels: Buffer.from([R(6) - R(2)]), meta: { ris: 2 } })));
    assert(d.pix[0] === 6, 'zwei Deltas nacheinander: 1 -> 2 -> 6');

    // --- 5) Fahrspur (tr) wird aufgesammelt und als trpts ausgegeben ---
    const m4 = new MapMerger();
    m4.process(buildFrame({ frameId: 1, frameType: 73, gridSize: 50, width: 4, height: 4, originX: 0, originY: 0, pixels: iPix, meta: { fsm: 1, ris: 2, tr: 'S100,200L10,0' } }));
    const d4 = decodeFrame(m4._buildFrame());
    assert(d4.meta.trpts && d4.meta.trpts.length === 2, 'I-Frame tr -> 2 Punkte');
    assert(d4.meta.trpts[0][0] === 100 && d4.meta.trpts[1][0] === 110, 'tr: L ist relativ (100 -> 110)');

    // --- 6) Frame-Sequenz (HA _add_map_data): Luecke wird gepuffert, dann in Reihenfolge angewandt ---
    const m5 = new MapMerger();
    m5.process(iFrame); // frame 1
    // frame 3 kommt VOR frame 2 -> darf nicht angewandt werden (Puffer)
    const r = m5.process(buildFrame({ frameId: 3, frameType: 80, gridSize: 50, width: 1, height: 1, originX: 0, originY: 0, pixels: Buffer.from([R(6) - R(2)]), meta: { ris: 2 } }));
    assert(r === null, 'Sequenz: Frame 3 vor Frame 2 -> gepuffert, nichts ausgegeben');
    assert(m5.requestPFrame && m5.requestPFrame.frameId === 2, 'kleine Luecke -> gezielte P-Frame-Nachforderung (frame 2)');
    m5.requestPFrame = null;
    // frame 2 kommt nach -> beide werden in Reihenfolge angewandt (1 -> 2 -> 6)
    d = decodeFrame(m5.process(buildFrame({ frameId: 2, frameType: 80, gridSize: 50, width: 1, height: 1, originX: 0, originY: 0, pixels: Buffer.from([R(2) - R(1)]), meta: { ris: 2 } })));
    assert(d.pix[0] === 6, 'Sequenz: Luecke geschlossen -> beide Deltas in Reihenfolge (1->2->6)');
    // alter Frame (id 2) nochmal -> uebersprungen
    assert(m5.process(buildFrame({ frameId: 2, frameType: 80, gridSize: 50, width: 1, height: 1, originX: 0, originY: 0, pixels: Buffer.from([R(2)]), meta: { ris: 2 } })) === null, 'Sequenz: alter Frame wird uebersprungen');
    // Map-ID-Wechsel -> needMapRequest
    assert(m5.needMapRequest === false, 'Sequenz: needMapRequest anfangs false');
    m5.process(buildFrame({ mapId: 9, frameId: 4, frameType: 80, gridSize: 50, width: 1, height: 1, originX: 0, originY: 0, pixels: Buffer.from([R(1)]), meta: { ris: 2 } }));
    assert(m5.needMapRequest === true, 'Sequenz: Map-ID-Wechsel -> needMapRequest');
    assert(m5.pQueue.size === 1 && m5.currentFrameId === null, 'Map-ID-Wechsel: Frame gepuffert, Sequenz genullt');
    // Neue I-Basis der neuen Session (map 9, frame 3) -> gepufferter Frame 4 (delta R(1)) wird angewandt
    d = decodeFrame(m5.process(buildFrame({ mapId: 9, frameId: 3, frameType: 73, gridSize: 50, width: 4, height: 4, originX: 0, originY: 0, pixels: iPix, meta: { fsm: 1, ris: 2, timestamp_ms: 99999 } })));
    assert(d.pix[0] === 2, 'nach Map-Wechsel: neue Basis + gepuffertes Delta angewandt (Raum 1 -> 2)');

    // --- 7) Aelterer I-Frame (timestamp) ueberschreibt frischere Basis NICHT ---
    const m6 = new MapMerger();
    m6.process(buildFrame({ frameId: 1, frameType: 73, gridSize: 50, width: 4, height: 4, originX: 0, originY: 0, pixels: iPix, meta: { fsm: 1, ris: 2, timestamp_ms: 2000 } }));
    const oldI = buildFrame({ frameId: 1, frameType: 73, gridSize: 50, width: 4, height: 4, originX: 0, originY: 0, pixels: Buffer.from(new Array(16).fill(R(9))), meta: { fsm: 1, ris: 2, timestamp_ms: 1000 } });
    assert(m6.process(oldI) === null, 'aelterer I-Frame (ts 1000 < 2000) wird uebersprungen');
    d = decodeFrame(m6._buildFrame());
    assert(d.pix[0] === 1, 'Basis blieb die frischere Karte');

    // --- 8) data_json.origin ueberschreibt die Header-Position (map.py 4258-4260) ---
    {
      const inflated = inflateFrame(buildFrame({ frameId: 1, frameType: 73, gridSize: 50, width: 1, height: 1, originX: 0, originY: 0, pixels: [0], meta: { origin: [500, 600] } }));
      const partial = buildPartialMapFromInflated(inflated, 1);
      const [mapData] = decodeMapDataFromPartial(partial, 0);
      assert(mapData.dimensions.left === 500 && mapData.dimensions.top === 600, 'origin aus meta ueberschreibt Header-left/top');
    }

    // --- 9) delsr (ausgeblendete Raeume) wird auch DIREKT aus dem Live-Frame gelesen, nicht
    //     nur aus der eingebetteten gespeicherten Karte (map.py 4394-4395) ---
    {
      const m7 = new MapMerger();
      d = decodeFrame(m7.process(buildFrame({ frameId: 1, frameType: 73, gridSize: 50, width: 4, height: 4, originX: 0, originY: 0, pixels: iPix, meta: { fsm: 1, ris: 2, delsr: [2, 4] } })));
      assert(Array.isArray(d.meta.ha.hiddenSegments) && d.meta.ha.hiddenSegments.includes(2) && d.meta.ha.hiddenSegments.includes(4), 'delsr aus Live-Frame direkt uebernommen (ohne rism)');
    }

    // --- 10) Versions-Autoerkennung wie decode_map_partial (map.py 4185-4195): version<3 und
    //     saveMapId/cover/diff/curtain vorhanden -> version wird auf 3 angehoben ---
    {
      const inflated = inflateFrame(buildFrame({ frameId: 1, frameType: 73, gridSize: 50, width: 1, height: 1, originX: 0, originY: 0, pixels: [0], meta: { curtain: { line: [[0, 0, 10, 10]] } } }));
      const partial = buildPartialMapFromInflated(inflated, 1);
      assert(partial.version === 3, 'curtain-Feld im JSON hebt Version 1 -> 3 an');
      const inflated2 = inflateFrame(buildFrame({ frameId: 1, frameType: 73, gridSize: 50, width: 1, height: 1, originX: 0, originY: 0, pixels: [0], meta: { fsm: 1 } }));
      const partial2 = buildPartialMapFromInflated(inflated2, 1);
      assert(partial2.version === 1, 'ohne saveMapId/cover/diff/curtain bleibt Version 1');
    }

    // --- 11) funiture_info (gespeicherte Karte): segment_id kommt aus furniture[2], NICHT
    //     furniture[13] (das ist edit_type) — map.py 4962-4977 exakt gelesen ---
    {
      // [furniture_id, type, segment_id, width, height, ?, x, y, ?, angle, ?, ?, scale, edit_type]
      const f = [100, 6, 3, 40, 20, 0, 150, 160, 0, 90, 0, 0, 1.0, 7];
      const inflated = inflateFrame(buildFrame({
        frameId: 1, frameType: 73, gridSize: 50, width: 1, height: 1, originX: 0, originY: 0, pixels: [0],
        meta: { fsm: 1, ris: 2, funiture_info: [f] },
      }));
      const partial = buildPartialMapFromInflated(inflated, 1);
      const [mapData] = decodeMapDataFromPartial(partial, 0);
      const furn = mapData.saved_furnitures[1];
      assert(!!furn, 'Moebel aus funiture_info geparst');
      assert(furn.segment_id === 3, `segment_id = furniture[2] (war ${furn.segment_id}, erwartet 3) — nicht furniture[13]`);
      assert(furn.edit_type === 7, `edit_type = furniture[13] (war ${furn.edit_type}, erwartet 7)`);
      assert(furn.x === 150 && furn.y === 160 && furn.width === 40 && furn.height === 20, 'Position/Groesse aus furniture[6,7,3,4]');
      assert(furn.angle === 90 && furn.scale === 1.0, 'angle=furniture[9], scale=furniture[12]');
    }

    // --- 12) Render-Vorverarbeitung aus device.py: active_segments/zone_cleaning haengen am
    //     GERAETESTATUS, nicht bloss am Vorhandensein von sa/da2/sp. HA-Kommentar:
    //     "Map data always contains last active segments" (device.py 3104-3109, 3165-3175, 3219).
    //     Die Frames tragen hier IMMER sa/da2/sp — entscheidend ist allein der Status.
    {
      const T = require('../lib/haMap').DreameVacuumTaskStatus;
      const S = require('../lib/haMap').DreameVacuumStatus;
      const frameWith = (extra) => buildFrame({
        frameId: 1, frameType: 73, gridSize: 50, width: 4, height: 4, originX: 0, originY: 0, pixels: iPix,
        meta: Object.assign({ fsm: 1, ris: 2, seg_inf: { 1: {}, 2: {} } }, extra),
      });
      const withStatus = (st, extra) => {
        const mm = new MapMerger();
        mm.setDeviceStatus(st);
        return decodeFrame(mm.process(frameWith(extra)));
      };

      // Raumreinigung laeuft -> Ausgrauung aktiv (device.py 3104-3109 laesst sa stehen)
      d = withStatus({ taskStatus: T.SEGMENT_CLEANING, status: S.SEGMENT_CLEANING }, { sa: [[2, 1, 0, 0]] });
      assert(Array.isArray(d.meta.ha.activeSegments) && d.meta.ha.activeSegments[0] === 2,
        `activeSegments bei laufender Raumreinigung (war ${JSON.stringify(d.meta.ha.activeSegments)})`);

      // Auftrag beendet, sa steht aber NOCH im Frame -> HA verwirft es. Das ist der Fall, der
      // die Ausgrauung sonst dauerhaft haengen liesse.
      d = withStatus({ taskStatus: T.COMPLETED, status: S.SLEEPING }, { sa: [[2, 1, 0, 0]] });
      assert(d.meta.ha.activeSegments === null,
        `veraltetes sa nach Auftragsende verworfen (war ${JSON.stringify(d.meta.ha.activeSegments)})`);

      // Pausierte Raumreinigung zaehlt weiter als laufend (task_status 8/13/17)
      for (const ts of [T.SEGMENT_CLEANING_PAUSED, T.SEGMENT_MOPPING_PAUSED, T.SEGMENT_DOCKING_PAUSED]) {
        d = withStatus({ taskStatus: ts, status: S.PAUSED }, { sa: [[2, 1, 0, 0]] });
        assert(d.meta.ha.activeSegments && d.meta.ha.activeSegments[0] === 2, `activeSegments bei task_status ${ts} (pausiert)`);
      }

      // zone_cleaning: nur bei tatsaechlich laufender Zonenreinigung (device.py 3219) —
      // veraltete da2-Zonen im Frame duerfen NICHT alles blau faerben.
      d = withStatus({ taskStatus: T.ZONE_CLEANING, status: S.ZONE_CLEANING }, { da2: { areas: [[0, 0, 100, 100]] } });
      assert(d.meta.ha.zoneCleaning === true, 'zoneCleaning=true bei laufender Zonenreinigung');
      d = withStatus({ taskStatus: T.COMPLETED, status: S.SLEEPING }, { da2: { areas: [[0, 0, 100, 100]] } });
      assert(d.meta.ha.zoneCleaning === false, 'veraltete da2-Zone nach Auftragsende -> zoneCleaning false');

      // Punktreinigung (device.py 3219, zweiter Zweig)
      d = withStatus({ taskStatus: T.SPOT_CLEANING, status: S.SPOT_CLEANING }, { sp: [[50, 60]] });
      assert(d.meta.ha.zoneCleaning === true, 'zoneCleaning=true bei laufender Punktreinigung');
      d = withStatus({ taskStatus: T.COMPLETED, status: S.SLEEPING }, { sp: [[50, 60]] });
      assert(d.meta.ha.zoneCleaning === false, 'veraltete sp-Punkte nach Auftragsende -> zoneCleaning false');

      // Raumreinigung faerbt NICHT blau
      d = withStatus({ taskStatus: T.SEGMENT_CLEANING, status: S.SEGMENT_CLEANING }, { sa: [[2, 1, 0, 0]] });
      assert(d.meta.ha.zoneCleaning === false, 'zoneCleaning=false bei reiner Raumreinigung');
    }

    // --- 13) l2r: "App adds robot position to paths as last line when map data is line to
    //     robot" (device.py 3245-3253). Das Geraet liefert die Spur verzoegert; ohne diesen
    //     Punkt haengt sie sichtbar hinter dem Roboter zurueck. HA macht das auf einer
    //     deepcopy (3022) -> die gespeicherte Spur darf NICHT mitwachsen.
    {
      const rp = { x: 500, y: 600, a: 90 };
      const mkFrame = (meta) => {
        const hdr = Buffer.alloc(HEADER_SIZE, 0);
        hdr.writeInt16LE(1, 0); hdr.writeInt16LE(0, 2); hdr.writeUInt8(73, 4);
        hdr.writeInt16LE(rp.x, 5); hdr.writeInt16LE(rp.y, 7); hdr.writeInt16LE(rp.a, 9);
        hdr.writeInt16LE(32767, 11); hdr.writeInt16LE(32767, 13); hdr.writeInt16LE(32767, 15);
        hdr.writeInt16LE(50, 17); hdr.writeInt16LE(4, 19); hdr.writeInt16LE(4, 21);
        hdr.writeInt16LE(0, 23); hdr.writeInt16LE(0, 25);
        return Buffer.from(zlib.deflateSync(Buffer.concat([hdr, Buffer.from(iPix), Buffer.from(JSON.stringify(meta), 'utf8')]))).toString('base64');
      };
      const trMeta = { fsm: 1, ris: 2, seg_inf: { 1: {} }, tr: 'S100,100L10,0L10,0' };

      // ohne l2r: Spur endet beim letzten echten Spurpunkt
      const mNo = new MapMerger();
      d = decodeFrame(mNo.process(mkFrame(trMeta)));
      const last = d.meta.trpts[d.meta.trpts.length - 1];
      assert(!(last[0] === rp.x && last[1] === rp.y), `ohne l2r endet die Spur NICHT an der Roboterposition (war ${JSON.stringify(last)})`);
      const lenNo = d.meta.trpts.length;

      // mit l2r: Roboterposition als letzter LINIEN-Punkt angehaengt
      const mYes = new MapMerger();
      d = decodeFrame(mYes.process(mkFrame(Object.assign({ l2r: 1 }, trMeta))));
      const lastY = d.meta.trpts[d.meta.trpts.length - 1];
      assert(d.meta.trpts.length === lenNo + 1, `mit l2r genau EIN Punkt mehr (war ${d.meta.trpts.length} statt ${lenNo + 1})`);
      assert(lastY[0] === rp.x && lastY[1] === rp.y, `mit l2r endet die Spur an der Roboterposition (war ${JSON.stringify(lastY)})`);
      assert(lastY[2] === 0, 'l2r-Punkt ist ein LINIEN-Punkt (kein Spurbruch)');

      // Kopie-Semantik: mehrfaches Bauen darf die gespeicherte Spur NICHT wachsen lassen
      const a1 = decodeFrame(mYes._buildFrame()).meta.trpts.length;
      const a2 = decodeFrame(mYes._buildFrame()).meta.trpts.length;
      assert(a1 === a2 && a1 === lenNo + 1,
        `l2r-Punkt brennt sich nicht in die gespeicherte Spur ein (${a1} vs ${a2}, erwartet ${lenNo + 1})`);
    }

    // --- 14) Editor-Operationen + Auffrischen ohne neuen Frame (device.py 1127-1160,
    //     map.py 1997-2029). Der Fall aus der Praxis: Roboter faehrt in die Station, es kommen
    //     KEINE Frames mehr — ohne refresh() bliebe der letzte Stand (Ausgrauung) eingefroren.
    {
      const T = require('../lib/haMap').DreameVacuumTaskStatus;
      const S = require('../lib/haMap').DreameVacuumStatus;
      const frame = buildFrame({
        frameId: 1, frameType: 73, gridSize: 50, width: 4, height: 4, originX: 0, originY: 0, pixels: iPix,
        meta: { fsm: 1, ris: 2, seg_inf: { 1: {}, 2: {} }, sa: [[2, 1, 0, 0]], tr: 'S100,100L10,0' },
      });

      // waehrend der Reinigung: Ausgrauung aktiv
      const mm = new MapMerger();
      mm.setDeviceStatus({ taskStatus: T.SEGMENT_CLEANING, status: S.SEGMENT_CLEANING });
      d = decodeFrame(mm.process(frame));
      assert(d.meta.ha.activeSegments && d.meta.ha.activeSegments[0] === 2, 'waehrend der Reinigung: Raum aktiv');

      // Auftrag endet — OHNE neuen Frame, nur Status wechselt + refresh() (wie HAs refresh_map)
      mm.setDeviceStatus({ taskStatus: T.COMPLETED, status: S.SLEEPING });
      d = decodeFrame(mm.refresh());
      assert(d.meta.ha.activeSegments === null,
        `nach Auftragsende taut die Ausgrauung ohne neuen Frame auf (war ${JSON.stringify(d.meta.ha.activeSegments)})`);

      // clear_path: Spur + aktive Segmente/Zonen weg, dirty gesetzt (map.py 1997-2007)
      const mc = new MapMerger();
      mc.setDeviceStatus({ taskStatus: T.SEGMENT_CLEANING, status: S.SEGMENT_CLEANING });
      mc.process(frame);
      assert(decodeFrame(mc._buildFrame()).meta.trpts.length > 0, 'vor clear_path ist eine Spur da');
      d = decodeFrame(mc.clearPath());
      assert(d.meta.trpts.length === 0, `clear_path loescht die Spur (waren ${d.meta.trpts.length} Punkte)`);
      assert(d.meta.ha.activeSegments === null, 'clear_path loescht active_segments');
      assert(mc.current.dirty === true, 'clear_path setzt dirty (HA-Guard gegen doppelte Editor-Ops)');

      // dirty ist beim naechsten I-Frame wieder weg (HA legt dort ein neues MapData-Objekt an)
      mc.process(buildFrame({
        mapId: 2, frameId: 0, frameType: 73, gridSize: 50, width: 4, height: 4, originX: 0, originY: 0, pixels: iPix,
        meta: { fsm: 1, ris: 2, seg_inf: { 1: {} }, timestamp_ms: 9999999999999 },
      }));
      assert(!mc.current.dirty, 'neuer I-Frame setzt dirty zurueck');

      // reset_map: Karte verworfen (map.py 2009-2029)
      const mr = new MapMerger();
      mr.process(frame);
      mr.resetMap();
      assert(mr.current.empty_map === true && mr.current.dimensions.width === 0 && mr.current.saved_map_status === 0,
        'reset_map verwirft die Karte (empty_map, Groesse 0, saved_map_status 0)');

      // refresh() ohne Karte darf nicht knallen
      assert(new MapMerger().refresh() === null, 'refresh() ohne Karte liefert null');
    }

    // --- 13) Ursprungs-Verschiebung im Wire-Header (device.py 3071-3085 _render_map) ---
    // HA verschiebt fuer Lidar-Roboter den Karten-Ursprung der Render-Kopie:
    //   object_shift (nur "p20"): ganze Zelle, drehungsabhaengig
    //   sonst:                    halbe Zelle (dimensions.offset), beide Achsen
    // Die gespeicherten Kartendaten (this.current) bleiben unveraendert.
    {
      const frameO = () => buildFrame({
        frameId: 1, frameType: 73, gridSize: 50, width: 4, height: 4, originX: -1150, originY: -4550,
        pixels: iPix, meta: { fsm: 1, ris: 2, seg_inf: { 1: {}, 2: {} } },
      });

      // Standard (Capability-Defaults wie HA: lidar_navigation=True, object_shift=False)
      const mo = new MapMerger();
      let dOut = decodeFrame(mo.process(frameO()));
      assert(dOut.h.originX === -1175 && dOut.h.originY === -4575,
        `Lidar: Header-Ursprung um halbe Zelle verschoben (-1175/-4575, war ${dOut.h.originX}/${dOut.h.originY})`);
      assert(mo.current.dimensions.left === -1150 && mo.current.dimensions.top === -4550,
        'Lidar: gespeicherte Kartendaten bleiben unveraendert (nur die Render-Kopie verschiebt)');
      assert(mo.current.dimensions.original_left === -1150 && mo.current.dimensions.original_top === -4550,
        'original_left/top tragen den unveraenderten Anker');

      // refresh() (Neuzeichnen ohne neuen Frame) verschiebt identisch — nicht doppelt
      dOut = decodeFrame(mo.refresh());
      assert(dOut.h.originX === -1175 && dOut.h.originY === -4575, 'refresh(): gleiche Verschiebung, keine Doppel-Verschiebung');

      // object_shift ("p20"-Modelle): ganze Zelle, bei rotation 0 beide Achsen
      const mp = new MapMerger();
      mp.setCapability({ lidarNavigation: true, objectShift: true });
      dOut = decodeFrame(mp.process(frameO()));
      assert(dOut.h.originX === -1200 && dOut.h.originY === -4600,
        `object_shift rot=0: ganze Zelle auf beiden Achsen (-1200/-4600, war ${dOut.h.originX}/${dOut.h.originY})`);

      // object_shift mit rotation 90: nur left; rotation 270: nur top (device.py 3075-3078)
      const mp90 = new MapMerger();
      mp90.setCapability({ lidarNavigation: true, objectShift: true });
      mp90.process(frameO());
      mp90.current.rotation = 90;
      dOut = decodeFrame(mp90.refresh());
      assert(dOut.h.originX === -1200 && dOut.h.originY === -4550, 'object_shift rot=90: nur left verschoben');
      mp90.current.rotation = 270;
      dOut = decodeFrame(mp90.refresh());
      assert(dOut.h.originX === -1150 && dOut.h.originY === -4600, 'object_shift rot=270: nur top verschoben');

      // kein Lidar (VSLAM): keine Verschiebung
      const mv = new MapMerger();
      mv.setCapability({ lidarNavigation: false, objectShift: false });
      dOut = decodeFrame(mv.process(frameO()));
      assert(dOut.h.originX === -1150 && dOut.h.originY === -4550, 'ohne Lidar: Ursprung unveraendert');
    }

  });

  // --- Issue #124 Layer 3: detected_carpets mit ungueltigem Polygon (null / ungerade Laenge /
  //     zu kurz) darf NICHT ins Wire-Format gelangen — der Frontend-Renderer (buildCarpetData)
  //     laeuft blind ueber c.polygon.filter(...) und crasht sonst die komplette Kartenanzeige.
  //     Ursache: haDecode.js carpet_info-Branch setzt polygon:null. ---
  it('filtert detected_carpets mit ungueltigem Polygon heraus (Issue #124 Layer 3)', function () {
    const logs = [];
    const merger = new MapMerger({ log: { debug: (m) => logs.push(m), info() {}, warn() {} } });
    // minimaler I-Frame, damit this.current existiert
    const iPix = Buffer.from(new Array(16).fill(R(1)));
    merger.process(buildFrame({
      frameId: 1, frameType: 73, gridSize: 50, width: 4, height: 4, originX: 0, originY: 0,
      pixels: iPix, meta: { fsm: 1, ris: 2, seg_inf: { 1: {} } },
    }));

    merger.current.detected_carpets = [
      { id: 1, polygon: [0, 0, 100, 0, 100, 100, 0, 100], hidden: false }, // gueltig (4 Punkte)
      { id: 2, polygon: null, hidden: null },                              // carpet_info-Fall
      { id: 3, polygon: [0, 0, 100, 0, 100], hidden: false },              // ungerade Laenge (5)
      { id: 4, polygon: [0, 0], hidden: false },                           // zu kurz (< 6)
    ];

    const d = decodeFrame(merger._buildFrame());
    const dc = d.meta.ha.detectedCarpets;
    assert(Array.isArray(dc) && dc.length === 1, `nur der gueltige Teppich kommt durch (war ${JSON.stringify(dc)})`);
    assert(dc[0].id === 1 && dc[0].polygon.length === 8, 'gueltiges Polygon unveraendert durchgereicht');
    const verworfen = logs.filter((l) => l.includes('ungueltigem Polygon'));
    assert(verworfen.length === 3, `3 ungueltige Teppiche per log.debug protokolliert (waren ${verworfen.length})`);
  });
});
