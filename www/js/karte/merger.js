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

