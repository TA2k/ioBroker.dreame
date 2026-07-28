/*
 * Karten-Rendering: Farbschema + Byte-Dekodierung
 * ========================================================================
 * Herkunft: browserseitiger Teil des Karten-Widgets aus RicardoHipps Fork
 *   https://github.com/RicardoHipp/ioBroker.dreame
 * Farbschema und HA-Pixeltypen bilden HAs "Dreame Light"-Farbschema 1:1 nach
 * (siehe Kommentare "HA:" / "types.py" im Code unten) — Ursprung:
 *   dreame-vacuum (Home Assistant Integration) von Tasshack
 *   https://github.com/Tasshack/dreame-vacuum — Copyright (c) 2022 Tasshack — MIT License
 *
 * MIT License — the above copyright notice and this permission notice shall be
 * included in all copies or substantial portions of the Software.
 * -----------------------------------------------------------------------------
 *
 * Strukturell unveraendert aus www/legacy.html hierher verschoben (WIDGET_UMBAU_PLAN.md
 * Etappe B, Commit B2) — reine Datei-Umorganisation, keine Logik-Aenderung. Nutzt Globals
 * (META u.a.), die zum Zeitpunkt dieses Commits noch in legacy.html leben und erst in
 * spaeteren Etappen (B3/B5/C) in die neue Struktur ueberfuehrt werden.
 */

// ===== Farben — HA "Dreame Light"-Schema (= wie die App) =====
// HAs 4 Raum-Farbgruppen (types.py MapRendererColorScheme.segment), je [hell, kräftig].
// Zuordnung Raum->Gruppe kommt vom Adapter (META.ha.colorIndex = HAs set_segment_color_index).
const SEG = [
  [[171,199,248],[121,170,255]], // 0 blau
  [[249,224,125],[255,211,38]],  // 1 gelb
  [[184,227,255],[141,210,255]], // 2 hellblau
  [[184,217,141],[150,217,141]], // 3 grün
];
const PAL = SEG.map(g=>g[0]);
const WHITE=[255,255,255], BLACK=[0,0,0];
const mix = (c,t,f)=>[Math.round(c[0]+(t[0]-c[0])*f),Math.round(c[1]+(t[1]-c[1])*f),Math.round(c[2]+(t[2]-c[2])*f)];
const rgbCss = c => `rgb(${c[0]},${c[1]},${c[2]})`;
let roomColorIdx = {}; // Raum-ID -> Farb-Index (via Nachbar-Färbung, siehe computeRoomColors)
const segGrp = seg => SEG[(roomColorIdx[seg] != null ? roomColorIdx[seg] : (seg-1)) % SEG.length];
const roomCol = seg => { const g = segGrp(seg);
  return { fill: g[0], border: g[1], label: mix(g[1],BLACK,0.5) }; };
// HA-Pixeltypen (types.py MapPixelType) — der Adapter liefert genau diese Werte
const PT = { OUTSIDE:0, UNKNOWN:252, NEW_SEGMENT:253, FLOOR:254, WALL:255 };
const isRoom = t => t>=1 && t<=63;
// HA "Dreame Light": floor/wall/new_segment/hidden_segment/passive_segment (types.py)
const FLOORCOL=[221,221,221], WALLCOL=[159,159,159], NEWSEGCOL=[153,191,255], HIDDENCOL=[226,226,226];
const PASSIVECOL=[200,200,200]; // color_scheme.passive_segment — Raum gehoert NICHT zum laufenden Auftrag
const CARPET_ALPHA=35/255, CARPET_USER_ALPHA=80/255; // carpet_color_detected / carpet_color
const hiddenSegs = () => new Set((META && META.ha && META.ha.hiddenSegments) || []);
// wie HA: ein Segment ist nur dann ein Raum, wenn es in der gespeicherten
// Raumstruktur (seg_inf) existiert; sonst "frisch gescannt" (NEW_SEGMENT)
const knownRoom = t => !META || !META.seg_inf || META.seg_inf[t] !== undefined;
// Füllfarbe für einen HA-Pixeltyp; null = nicht zeichnen.
// HA: UNKNOWN wird in FLOOR-Farbe gezeichnet (area_colors[UNKNOWN] = floor)!
const typeFill = t => {
  if (isRoom(t)) return roomCol(t).fill;
  if (t===PT.WALL) return WALLCOL;
  if (t===PT.FLOOR || t===PT.UNKNOWN) return FLOORCOL;
  if (t===PT.NEW_SEGMENT) return NEWSEGCOL;
  return null;
};

// ===== Dekodierung =====
function b64ToU8(b64){ b64=b64.replace(/-/g,'+').replace(/_/g,'/'); const bin=atob(b64);
  const u8=new Uint8Array(bin.length); for(let i=0;i<bin.length;i++)u8[i]=bin.charCodeAt(i); return u8; }
async function inflate(u8){ const ds=new DecompressionStream('deflate');
  const st=new Blob([u8]).stream().pipeThrough(ds); return new Uint8Array(await new Response(st).arrayBuffer()); }


// ===== Nachtrag (Commit B5): weitere Kartenlogik-Fragmente, die B2 nicht erfasst hatte =====
// Bei der main.js-Integration (Etappe B, Commit B5) stellte sich heraus, dass diese Funktionen
// zwar inhaltlich zur Kartenanzeige gehoeren, in legacy.html aber unter anderen Bereichen
// standen ("Reinigungs-Panel", "Raum-Einstellungen (cleanset)", "Raumnamen", Ende von
// "Konfiguration") — B2 hat sich an WIDGET_ARCHITEKTUR.md Tabelle 7 orientiert, die diese
// Funktionen dort nicht auflistete. Verbatim uebernommen wie der Rest dieser Datei, siehe
// WIDGET_SESSION_STATUS.md fuer die vollstaendige Herleitung.

// ===== Raumnamen (Dreame Typ-Codes -> DE) =====
const ROOM_TYPE_DE = {0:'Raum',1:'Wohnzimmer',2:'Hauptschlafzimmer',3:'Arbeitszimmer',
  4:'Küche',5:'Esszimmer',6:'Badezimmer',7:'Balkon',8:'Flur',9:'Abstellraum',
  10:'Kleiderschrank',11:'Besprechungsraum',12:'Büro',13:'Fitnessbereich',
  14:'Freizeitbereich',15:'Gästeschlafzimmer'};
// Eigener Raumname aus der App: kommt in seg_inf als Base64 (UTF-8, also mit Umlauten).
const b64Name = s => { try {
  const b = atob(s), u = new Uint8Array(b.length);
  for (let i=0;i<b.length;i++) u[i] = b.charCodeAt(i);
  return new TextDecoder().decode(u) || null;
} catch(e){ return null; } };

// 1:1 wie HA set_name() (types.py 3680-3688) bzw. getRoomDisplayName() im Adapter:
//   1. Typ >= 1 aus der Auswahlliste -> uebersetzter Name, ab dem zweiten Raum
//      desselben Typs mit Nummer ("Badezimmer 2"). Typ 0 zaehlt hier NICHT mit,
//      sonst liefert ROOM_TYPE_DE[0]='Raum' fuer jeden unbenannten Raum dasselbe.
//   2. Sonst der in der App frei vergebene Name (Typ faellt dabei auf 0 zurueck).
//   3. Sonst "Raum <id>".
const roomName = (id, seg) => {
  const si = seg && seg[id];
  const t = si && si.type;
  if (t != null && t !== 0 && ROOM_TYPE_DE[t]) {
    const idx = si.index || 0;
    return idx > 0 ? `${ROOM_TYPE_DE[t]} ${idx+1}` : ROOM_TYPE_DE[t];
  }
  const eigen = si && si.name ? b64Name(si.name) : null;
  return eigen || ('Raum '+id);
};

const parseTrail = v => { try{ return JSON.parse(v).points||[]; }catch(e){ return []; } };
// Zahl im trpts-Feld -> HA PathType (types.py 2601-2605). Gegenstueck zu TRPT_TYP
// in lib/mapMerge.js. S = saugen, W = saugen+wischen, M = wischen, L = Fortsetzung.
const TRPT_OP = { 0:'L', 1:'S', 2:'W', 3:'M' };
// Welcher Abschnitt gehoert in welche Spur — 1:1 HA (map.py 10769-10788):
// die Saugspur bekommt S und W, die Wischspur M und W. Abschnitte vom Typ W stehen
// also in BEIDEN, deshalb sieht man dort die duenne Linie auf dem breiten Balken.
const istSaugSpur  = op => op === 'S' || op === 'W';
const istWischSpur = op => op === 'M' || op === 'W';
// Roher Dreame-tr-String -> Pfadpunkte (Weltkoord in mm).
//  L<dx>,<dy> = relative Linie (aufsummieren) | l<x>,<y> = absolute Linie
//  M/W/S<x>,<y> = absoluter Sprung (Umsetzfahrt = "Stift hoch", via isBreak nicht gezeichnet)
const decodeTr = trStr => {
  if (!trStr || typeof trStr!=='string') return [];
  const re=/([MWSLl])(-?\d+),(-?\d+)/g; let m; const pts=[]; let cx=0, cy=0;
  while ((m=re.exec(trStr))){ const op=m[1], x=+m[2], y=+m[3];
    if (op==='L'){ cx+=x; cy+=y; pts.push({x:cx,y:cy,operator:'L'}); }
    else if (op==='l'){ cx=x; cy=y; pts.push({x:cx,y:cy,operator:'L'}); }
    else { cx=x; cy=y; pts.push({x:cx,y:cy,operator:op}); } // M/W/S = Break
  }
  return pts;
};
const parsePt = v => { try { return JSON.parse(v); } catch(e){ return null; } };

let carpetSet=new Set();  // rohe Teppich-Zellen aus META.carpetPx (HA: carpet_pixels)
let carpetData=new Map(); // Zelle -> pxType (1=erkannt, 2=Nutzer-Teppich), wie HA carpet_data
let haHidden=new Set();   // in der App ausgeblendete Raeume (META.ha.hiddenSegments)
let activeSegs=new Set(); // Raeume des laufenden Auftrags (HA: active_segments aus "sa")
let zoneCleaning=false;   // HA: zone_cleaning (Zonen-/Punktreinigung laeuft)
// HA: _check_carpet Polygon-Teil — Ray-Casting in Weltkoordinaten
function pointInPolygon(x,y,poly){
  let check=false; const n=poly.length;
  for (let i=0,j=n-2;i<n;j=i,i+=2){
    const sx=poly[i],sy=poly[i+1],tx=poly[j],ty=poly[j+1];
    if (sx===x&&sy===y&&tx===x&&ty===y) return true;
    if (sy===ty&&sy===y&&((sx>x&&tx<x)||(sx<x&&tx>x))) return true;
    if ((sy<y&&ty>=y)||(sy>=y&&ty<y)){
      const xx=sx+((y-sy)*(tx-sx))/(ty-sy);
      if (xx===x) return true;
      if (xx>x) check=!check;
    }
  }
  return check;
}
// HA: _optimize_carpet_pixels — jeden Teppich-Pixel auf 4x3 aufblaehen (nur Raum-Zellen)
function optimizeCarpetPixels(){
  const out=new Set();
  for (const idx of carpetSet){
    const px=idx%W, py=(idx-px)/W;
    for (let xx=Math.max(0,px-1); xx<Math.min(px+3,W-1); xx++){
      for (let yy=Math.max(0,py-1); yy<Math.min(py+2,He-1); yy++){
        const t=raw[mapStart+yy*W+xx];
        if (t>0 && t<=100) out.add(yy*W+xx);
      }
    }
  }
  return out;
}
// HA: render_carpets — carpet_data aufbauen (1:1-Reihenfolge)
function buildCarpetData(){
  const out=new Map();
  const ha=(META&&META.ha)||{};
  // map.py 7744-7749 / 12281-12285: liegt der Karten-Ursprung auf dem Halbgitter
  // (Lidar-Verschiebung aus device.py 3071-3085, kommt seit dem Adapter-Port im Header
  // an), rechnet HA die Teppich-ZELLEN wieder vom vollen Gitter aus (left+offset) —
  // Teppiche sind zellbasiert und muessen auf dem Pixelraster liegen.
  // Python-Modulo ist immer positiv, JS nicht -> doppeltes Modulo.
  let L=H.origin.x, T=H.origin.y;
  if (((L%GS)+GS)%GS!==0 || ((T%GS)+GS)%GS!==0){ L+=GS/2; T+=GS/2; }
  const cellVal=(x,y)=>raw[mapStart+y*W+x];
  if (ha.detectedCarpets && ha.detectedCarpets.length){
    let optimized=null;
    for (const c of ha.detectedCarpets){
      if (c.hidden) continue;
      const xs=c.polygon.filter((_,i)=>i%2===0), ys=c.polygon.filter((_,i)=>i%2===1);
      const x0=Math.max(0,Math.floor((Math.min(...xs)-L)/GS)), x1=Math.min(W-1,Math.ceil((Math.max(...xs)-L)/GS));
      const y0=Math.max(0,Math.floor((Math.min(...ys)-T)/GS)), y1=Math.min(He-1,Math.ceil((Math.max(...ys)-T)/GS));
      for (let x=x0;x<x1;x++) for (let y=y0;y<y1;y++){
        const val=cellVal(x,y);
        if (val<=0 || val>100) continue;               // _check_carpet Vorfilter
        // _check_carpet 7783-7785: der Polygon-Test rechnet Zelle->Welt mit dimensions.left
        // DIREKT (dem ggf. verschobenen Ursprung) — nicht mit dem korrigierten L von oben.
        const wx=x*GS+H.origin.x, wy=y*GS+H.origin.y;
        if (!pointInPolygon(wx,wy,c.polygon)) continue;
        if (c.polygon.length>100 && carpetSet.size){   // grosses Polygon -> Pixel-Filter
          if (optimized===null) optimized=optimizeCarpetPixels();
          if (!optimized.has(y*W+x)) continue;
        }
        out.set(y*W+x,1);
      }
    }
  } else if (carpetSet.size){
    for (const idx of optimizeCarpetPixels()) out.set(idx,1);
  }
  // Raum-Material Teppich (floor_material 5-7): ganzen Raum markieren
  if (META&&META.seg_inf){
    for (const [id,si] of Object.entries(META.seg_inf)){
      const m=si&&si.material;
      if (m>4&&m<8){ const rid=+id;
        for (let y=0;y<He;y++) for (let x=0;x<W;x++) if (cellVal(x,y)===rid) out.set(y*W+x,1);
      }
    }
  }
  // Nutzer-Teppiche (vw.addcpt): Rechtecke -> pxType 2
  if (ha.carpets){
    for (const r of ha.carpets){
      if (!Array.isArray(r)||r.length<4) continue;
      const x0=Math.max(0,Math.floor((Math.min(r[0],r[2])-L)/GS)), x1=Math.min(W-1,Math.ceil((Math.max(r[0],r[2])-L)/GS));
      const y0=Math.max(0,Math.floor((Math.min(r[1],r[3])-T)/GS)), y1=Math.min(He-1,Math.ceil((Math.max(r[1],r[3])-T)/GS));
      for (let x=x0;x<x1;x++) for (let y=y0;y<y1;y++){ const v=cellVal(x,y); if(v>0&&v<=100) out.set(y*W+x,2); }
    }
  }
  // geloeschte Teppiche entfernen
  if (ha.deletedCarpets){
    for (const r of ha.deletedCarpets){
      if (!Array.isArray(r)||r.length<4) continue;
      const x0=Math.max(0,Math.floor((Math.min(r[0],r[2])-L)/GS)), x1=Math.min(W-1,Math.ceil((Math.max(r[0],r[2])-L)/GS));
      const y0=Math.max(0,Math.floor((Math.min(r[1],r[3])-T)/GS)), y1=Math.min(He-1,Math.ceil((Math.max(r[1],r[3])-T)/GS));
      for (let x=x0;x<x1;x++) for (let y=y0;y<y1;y++) out.delete(y*W+x);
    }
  }
  return out;
}
let showChanges=false;   // "Änderungen"-Button: rot = seit Schnappschuss geändert
let showGrid=false;      // "Raster"-Knopf: Diagnose-Gitter + Fadenkreuze (s. drawGrid)
let changeSnap=null;     // Schnappschuss der Karte (beim Reinigungsstart bzw. erstem Laden)
const CHANGECOL=[230,40,40];
// Kopie des aktuellen Typ-Grids + seiner Welt-Lage merken
function takeChangeSnapshot(){
  if (!raw || !W || !He) return;
  changeSnap = { grid: raw.slice(mapStart, mapStart + W*He).slice(),
                 left: H.origin.x, top: H.origin.y, W, He, gs: GS };
}
// Typ an derselben WELT-Position im Schnappschuss (Karte kann gewachsen/verschoben sein)
function snapTypeAt(x,y){
  if (!changeSnap) return null;
  const wx = H.origin.x + x*GS, wy = H.origin.y + y*GS;
  const sx = Math.round((wx - changeSnap.left)/changeSnap.gs);
  const sy = Math.round((wy - changeSnap.top)/changeSnap.gs);
  if (sx<0||sy<0||sx>=changeSnap.W||sy>=changeSnap.He) return 0; // war ausserhalb = leer
  return changeSnap.grid[sy*changeSnap.W + sx];
}

const toScreen=(px,py)=>[px, He-1-py]; // fuer ZELL-Indizes (Labels/Zentroide)
// Welt(mm) -> Bild, exakt wie HA MapImageDimensions.to_img (types.py):
//   x = (wx - left) / grid            y = ((He*grid - 1) - (wy - top)) / grid
// (nicht He-1-(wy-top)/grid — das war ~1 Zelle daneben: der Spur-/Marker-Versatz)
const wS=(wx,wy)=>[
  (wx-H.origin.x)/GS,
  ((He*GS - 1) - (wy-H.origin.y))/GS,
];

// ---- Karte dekodieren ----
async function decode(cloudStr){
  const cloud = JSON.parse(cloudStr);
  let ms = cloud.mapstr[0].map;
  const ci = ms.indexOf(',');
  if (ci>0 && /^[A-Za-z0-9+\/_-]+$/.test(ms.slice(0,ci)) && ci>100) ms = ms.slice(0,ci);
  raw = await inflate(b64ToU8(ms));
  const dv = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  H = { gridSize:dv.getInt16(17,true), width:dv.getInt16(19,true), height:dv.getInt16(21,true),
        origin:{x:dv.getInt16(23,true), y:dv.getInt16(25,true)} };
  // Roboterposition aus dem Header DIESES Pakets (Offset 5/7; 32767 = keine Position).
  // Wichtig: sie gehoert zum selben Paket wie die Spur und kann deshalb nie veraltet
  // sein — anders als die Variable aus dem separaten map.robot-Ereignis, das in
  // beliebiger Reihenfolge eintrifft.
  const hrx=dv.getInt16(5,true), hry=dv.getInt16(7,true);
  H.robot = (hrx===32767 && hry===32767) ? null : [hrx,hry];
  W=H.width; He=H.height; GS=H.gridSize; mapStart=27;
  MAPW=W*cell; MAPH=He*cell; cv.width=MAPW; cv.height=MAPH; off.width=W; off.height=He;
  const mapEnd=mapStart+W*He;
  META={}; try{ META=JSON.parse(new TextDecoder().decode(raw.subarray(mapEnd))); }catch(e){}
  haHidden = hiddenSegs();
  // Raum-Zentroide + Grenzen
  rooms={};
  for (let y=0;y<He;y++) for (let x=0;x<W;x++){
    const t=raw[mapStart+y*W+x]; // Byte = Typ
    // Raum = nur Segmente aus der gespeicherten Raumstruktur (seg_inf) — wie HA.
    // Vorlaeufige Live-Nummern (z.B. 57/59/60 waehrend der Fahrt) sind KEINE Raeume.
    if (isRoom(t) && !haHidden.has(t) && knownRoom(t)){
      const r=rooms[t]||(rooms[t]={sumX:0,sumY:0,count:0,minX:x,maxX:x,minY:y,maxY:y});
      if(x<r.minX)r.minX=x; if(x>r.maxX)r.maxX=x; if(y<r.minY)r.minY=y; if(y>r.maxY)r.maxY=y;
      r.sumX+=x; r.sumY+=y; r.count++;
    }
  }
  // Mini-Fragmente (Rausch der Live-Karte) aussortieren -> nicht als eigener Raum
  carpetSet = new Set(META.carpetPx || []); // HA: carpet_pixels
  carpetData = buildCarpetData();
  // Farb-Indizes exakt wie die App: vom Adapter berechnet (HAs set_segment_color_index)
  roomColorIdx = (META.ha && META.ha.colorIndex) || {};
  // Laufender Auftrag: welche Raeume gehoeren dazu (HA active_segments / zone_cleaning)
  activeSegs = new Set((META.ha && META.ha.activeSegments) || []);
  zoneCleaning = !!(META.ha && META.ha.zoneCleaning);
  computeIconSizes(); // Icon-Groesse haengt an der Kartengroesse (HA map.py 9664)
}

function drawFills(){
  // Etappe E1: Panels koennen (asynchron, ueber _aktualisiereRaumMuster()/neueDatenMuster())
  // rendern, BEVOR das aktive Geraet sein erstes Kartenpaket geschickt hat -- z.B. direkt
  // nach einem Geraete-Wechsel. createImageData(0,0) wirft eine IndexSizeError-Exception;
  // ohne dekodierte Karte gibt es ohnehin nichts zu zeichnen. Gleicher Guard wie
  // takeChangeSnapshot() weiter unten in dieser Datei.
  if (!raw || !W || !He) return;
  const img = octx.createImageData(W,He);
  // Wände gehoeren keinem Raum (Typ WALL ohne Segment-Info). Beim Ausblenden eines
  // Raums sollen seine Waende mitverschwinden: eine Wand-Zelle bleibt nur sichtbar,
  // wenn in ihrer Nachbarschaft (Radius 2) noch sichtbarer Raum/Boden liegt.
  let wallVisible=null;
  if (hidden.size){
    wallVisible=new Set();
    for (let y=0;y<He;y++) for (let x=0;x<W;x++){
      if (raw[mapStart+y*W+x]!==PT.WALL) continue;
      let vis=false;
      for (let dy=-2;dy<=2&&!vis;dy++) for (let dx=-2;dx<=2&&!vis;dx++){
        const nx=x+dx, ny=y+dy;
        if (nx<0||ny<0||nx>=W||ny>=He) continue;
        const t2=raw[mapStart+ny*W+nx];
        if ((isRoom(t2)&&!hidden.has(t2)) || t2===PT.FLOOR || t2===PT.NEW_SEGMENT || t2===PT.UNKNOWN) vis=true;
      }
      if (vis) wallVisible.add(y*W+x);
    }
  }
  for (let y=0;y<He;y++) for (let x=0;x<W;x++){
    const t=raw[mapStart+y*W+x]; // Byte = Typ
    const di=((He-1-y)*W + x)*4;
    // Räume respektieren Ausblenden; Boden/Wand/frisch-gescannt immer zeichnen
    if (isRoom(t) && hidden.has(t)) continue;
    if (t===PT.WALL && wallVisible && !wallVisible.has(y*W+x)) continue; // Wand ohne sichtbaren Nachbar-Raum
    // Raumfarbe 1:1 wie HA (map.py 9156-9169) — Reihenfolge der Zweige ist dieselbe:
    //   hidden_segment > (zone_cleaning-Fallback) > passive_segment > segment[color_index][0]
    let c;
    if (isRoom(t) && haHidden.has(t)) c = HIDDENCOL; // in der App ausgeblendet -> HA hidden_segment
    else if (isRoom(t) && !knownRoom(t)) c = NEWSEGCOL; // vorlaeufiges Live-Segment -> "frisch gescannt" (wie HA)
    // HA ueberspringt bei zone_cleaning die Segment-Einfaerbung komplett; beim Zeichnen
    // greift dann der Fallback area_colors.get(px_type, ...) -> NEW_SEGMENT (map.py 9215-9217).
    else if (isRoom(t) && zoneCleaning) c = NEWSEGCOL;
    // Laeuft ein Auftrag: Raeume des Auftrags in normaler Farbe, alle anderen ausgegraut
    // (map.py 9164: active_segments and k not in active_segments -> passive_segment).
    // Unsere Klick-Auswahl-Faerbung tritt dann zurueck — sie gilt nur, wenn nichts laeuft.
    else if (isRoom(t) && activeSegs.size) c = activeSegs.has(t) ? segGrp(t)[0] : PASSIVECOL;
    else if (isRoom(t)) c = roomFill(t); // Raum: Farbe je nach Auswahl (eigenes Feature)
    else c = typeFill(t);
    // "Änderungen": alles was sich seit dem Schnappschuss geändert hat -> ROT
    if (showChanges && changeSnap && t !== snapTypeAt(x,y)) c = CHANGECOL;
    if (c){ img.data[di]=c[0]; img.data[di+1]=c[1]; img.data[di+2]=c[2]; img.data[di+3]=255; }
  }
  octx.putImageData(img,0,0);
  ctx.imageSmoothingEnabled=false; // wichtig: Canvas-Resize setzt das zurück -> hier erneut aus (harte Kanten)
  ctx.clearRect(0,0,MAPW,MAPH); ctx.drawImage(off,0,0,MAPW,MAPH);
  // Teppiche wie HA (floor_scale=2, render_carpets): pro Zelle werden die DIAGONALEN
  // Halbzellen (oben-links + unten-rechts) abgedunkelt -> Schachbrettmuster.
  if (carpetData.size){
    const h2=cell/2;
    for (const [idx,pxType] of carpetData){
      const ct=raw[mapStart+idx];
      if (isRoom(ct) && hidden.has(ct)) continue; // Teppich in ausgeblendetem Raum
      ctx.fillStyle = `rgba(0,0,0,${pxType===2?CARPET_USER_ALPHA:CARPET_ALPHA})`;
      const sy=(He-1-((idx-(idx%W))/W))*cell, sx=(idx%W)*cell;
      ctx.fillRect(sx, sy, h2, h2);        // oben-links
      ctx.fillRect(sx+h2, sy+h2, h2, h2);  // unten-rechts
    }
  }
}
