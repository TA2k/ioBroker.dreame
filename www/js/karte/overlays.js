/*
 * Karten-Rendering: HA-Overlays (Sperrzonen, virtuelle Waende, Moebel, Vorhaenge)
 * ========================================================================
 * Herkunft: browserseitiger Teil des Karten-Widgets aus RicardoHipps Fork
 *   https://github.com/RicardoHipp/ioBroker.dreame
 * Bildet HAs Zeichenlogik (Rahmen-Positionierung, Farbschema) 1:1 nach, inkl. expliziten
 * Abgleichs mit HAs Pillow-Zeichenverhalten (siehe Kommentare "HA:"/"types.py" im Code
 * unten) — Ursprung:
 *   dreame-vacuum (Home Assistant Integration) von Tasshack
 *   https://github.com/Tasshack/dreame-vacuum — Copyright (c) 2022 Tasshack — MIT License
 *
 * MIT License — the above copyright notice and this permission notice shall be
 * included in all copies or substantial portions of the Software.
 * -----------------------------------------------------------------------------
 *
 * Strukturell unveraendert aus www/legacy.html hierher verschoben (WIDGET_UMBAU_PLAN.md
 * Etappe B, Commit B2) — reine Datei-Umorganisation, keine Logik-Aenderung. Nutzt Globals
 * (ov, NS, wS, META, raw, mapStart, GS, H, W, He, hidden u.a.), die zum Zeitpunkt dieses
 * Commits noch in legacy.html leben und erst in spaeteren Etappen in die neue Struktur
 * ueberfuehrt werden.
 */

// ===== HA-Overlays: Sperrzonen, virtuelle Waende, Moebel, Vorhaenge =====
// Farben aus HAs "Dreame Light"-Schema (types.py)
const NOGO_FILL='rgba(177,0,0,0.196)', NOGO_LINE='rgba(199,0,0,0.784)';
const NOMOP_FILL='rgba(170,47,255,0.196)', NOMOP_LINE='rgba(153,0,210,0.784)';
const VWALL_LINE='rgba(199,0,0,0.784)', CURTAIN_COL='rgb(247,123,46)';
function svgEl(tag,attrs){ const e=document.createElementNS(NS,tag); for(const k in attrs) e.setAttribute(k,attrs[k]); ov.appendChild(e); return e; }
// Raum an einer Welt-Position (mm) — fuer "Inhalte mit Raum ausblenden"
function roomAtWorld(wx,wy){
  const cx=Math.floor((wx-H.origin.x)/GS), cy=Math.floor((wy-H.origin.y)/GS);
  if (cx<0||cy<0||cx>=W||cy>=He) return 0;
  const t=raw[mapStart+cy*W+cx];
  return isRoom(t)?t:0;
}
const hiddenAtWorld=(wx,wy)=>{ const r=roomAtWorld(wx,wy); return r!==0 && hidden.has(r); };
function drawZones(){
  const ha=META.ha||{};
  // Rahmen INNEN zeichnen, wie HA. SVG legt den Strich mittig auf die Kante — damit ragte
  // die Haelfte (0.25 Zellen = 12.5 mm) nach aussen ueber die Zone hinaus, die Zone wirkte
  // rundum etwas zu gross bzw. nach unten versetzt. HA nutzt Pillow, und das zeichnet den
  // Rahmen ausdruecklich innen ("To avoid expanding the polygon outwards, use the fill as
  // a mask" — Pillow, ImageDraw.polygon). Deshalb das Rechteck um die halbe Strichbreite
  // einruecken, dann liegt die Aussenkante des Strichs genau auf der Zonengrenze.
  const SW=0.5; // Strichbreite in Zellen; entspricht HAs border_width 2 bei scale 4
  const rect=(r,fill,stroke)=>{ if(!Array.isArray(r)||r.length<4) return;
    if (hiddenAtWorld((r[0]+r[2])/2,(r[1]+r[3])/2)) return; // Zone liegt in ausgeblendetem Raum
    const [x0,y0]=wS(Math.min(r[0],r[2]),Math.max(r[1],r[3]));
    const [x1,y1]=wS(Math.max(r[0],r[2]),Math.min(r[1],r[3]));
    svgEl('rect',{x:x0+SW/2, y:y0+SW/2,
                  width:Math.max(0,(x1-x0)-SW), height:Math.max(0,(y1-y0)-SW),
                  fill,stroke,'stroke-width':SW}); };
  (ha.noGo||[]).forEach(r=>rect(r,NOGO_FILL,NOGO_LINE));
  (ha.noMop||[]).forEach(r=>rect(r,NOMOP_FILL,NOMOP_LINE));
  (ha.virtualWalls||[]).forEach(l=>{ if(!Array.isArray(l)||l.length<4) return;
    if (hiddenAtWorld((l[0]+l[2])/2,(l[1]+l[3])/2)) return;
    const [x0,y0]=wS(l[0],l[1]), [x1,y1]=wS(l[2],l[3]);
    svgEl('line',{x1:x0,y1:y0,x2:x1,y2:y1,stroke:VWALL_LINE,'stroke-width':0.6,'stroke-linecap':'round'}); });
}

/**
 * DIAGNOSE ("Raster"-Knopf): Prueft, ob das Overlay (alles ueber wS gezeichnet — Zonen,
 * Teppiche, Roboter) auf denselben Pixeln sitzt wie die Karte im Canvas.
 *
 * Gezeichnet wird:
 *   - gruenes Gitter auf den ZELLGRENZEN (SVG-Einheiten, also ganze Zahlen). Sitzt das
 *     Overlay richtig, laufen diese Linien exakt auf den Kanten der Kartenpixel.
 *   - magenta Fadenkreuze an bekannten WELTKOORDINATEN, ueber wS umgerechnet (der Weg,
 *     den Zonen, Roboter und Spur nehmen).
 *   - rote Kaestchen um die ZELLE, in die derselbe Punkt faellt — berechnet ueber den
 *     Canvas-Weg (Welt -> Zelle -> Kaestchen an der Canvas-Position dieser Zelle).
 *
 * Auswertung: Liegt das Fadenkreuz INNERHALB seines roten Kaestchens, stimmen Overlay und
 * Canvas ueberein — dann liegt der Versatz nicht bei uns, sondern im Vergleich zu HA.
 * Liegt es daneben, ist genau das der Fehler, und man sieht direkt um wieviel.
 * Die Beschriftung nennt die berechnete Zelle, damit man sie mit HA vergleichen kann.
 */
function drawGrid(){
  if (!showGrid || !H) return;
  const L=H.origin.x, T=H.origin.y;
  for (let x=0;x<=W;x+=5) svgEl('line',{x1:x,y1:0,x2:x,y2:He,stroke:'#00b050','stroke-width':0.06,'pointer-events':'none'});
  for (let y=0;y<=He;y+=5) svgEl('line',{x1:0,y1:y,x2:W,y2:y,stroke:'#00b050','stroke-width':0.06,'pointer-events':'none'});
  const marke=(wx,wy,txt)=>{
    const [sx,sy]=wS(wx,wy);                       // Weg 1: wie Zonen/Roboter (Overlay)
    svgEl('line',{x1:sx-2,y1:sy,x2:sx+2,y2:sy,stroke:'#ff00ff','stroke-width':0.12});
    svgEl('line',{x1:sx,y1:sy-2,x2:sx,y2:sy+2,stroke:'#ff00ff','stroke-width':0.12});
    // Weg 2: wie Teppiche/Canvas — Welt in Zelle, dann Kaestchen an DEREN Canvas-Position
    const cxC=Math.floor((wx-L)/GS), cyC=Math.floor((wy-T)/GS);
    svgEl('rect',{x:cxC, y:He-1-cyC, width:1, height:1, fill:'none', stroke:'#ff0000','stroke-width':0.1});
    if(txt) svgEl('text',{x:sx+2.5,y:sy-1,'font-size':2,fill:'#ff00ff'}).textContent=txt+' [Zelle '+cxC+','+cyC+']';
  };
  if (chargerPos) marke(chargerPos[0],chargerPos[1],'Station');
  if (robotPos)   marke(robotPos[0],robotPos[1],'Roboter');
  const ha=META.ha||{};
  (ha.noGo||[]).forEach((r,i)=>{ marke(Math.min(r[0],r[2]),Math.max(r[1],r[3]),'Zone'+i+' oben-links');
                                 marke(Math.max(r[0],r[2]),Math.min(r[1],r[3]),'unten-rechts'); });
}
function drawFurniture(){
  const ha=META.ha||{};
  (ha.furnitures||[]).forEach(f=>{
    // Moebelbilder liegen als einzelne Dateien (furniture/<typ>.png), NICHT mehr als
    // base64 im Skript: so laedt der Browser nur die Typen, die wirklich vorkommen,
    // statt bei jedem Aufruf 1,5 MB fuer alle 15. Fehlt eine Datei, bleibt die Stelle leer.
    const href = f.type!=null ? `furniture/${f.type}.png` : null;
    if(!href||!f.w||!f.h) return;
    // Moebel ausblenden, wenn sein Raum ausgeblendet ist (Raum-Nr. aus Daten wie HA,
    // sonst Raum unter dem Moebel-Mittelpunkt)
    if (f.seg ? hidden.has(f.seg) : hiddenAtWorld(f.x,f.y)) return;
    const [cx,cy]=wS(f.x,f.y); const w=f.w/GS, h=f.h/GS;
    const im=svgEl('image',{x:cx-w/2,y:cy-h/2,width:w,height:h,opacity:235/255,
      transform:`rotate(${f.angle||0} ${cx} ${cy})`,preserveAspectRatio:'none'});
    im.setAttribute('href',href); im.setAttributeNS('http://www.w3.org/1999/xlink','href',href);
  });
}
function drawCurtains(){
  const ha=META.ha||{};
  (ha.curtains||[]).forEach(l=>{ if(!Array.isArray(l)||l.length<4) return;
    if (hiddenAtWorld((l[0]+l[2])/2,(l[1]+l[3])/2)) return; // Vorhang in ausgeblendetem Raum
    // Sinus-Welle entlang der Vorhang-Linie (wie die Original-App).
    // Amplitude ±1,25 Zellen = HAs Massstab (±5 Bildpixel bei scale 4).
    const [x0,y0]=wS(l[0],l[1]), [x1,y1]=wS(l[2],l[3]);
    const dx=x1-x0, dy=y1-y0, len=Math.hypot(dx,dy)||1;
    const ux=dx/len, uy=dy/len;   // Richtung entlang der Linie
    const nx=-uy, ny=ux;          // Normale (quer zur Linie)
    const AMP=0.625;              // Zellen (halbierte HA-Amplitude, Nutzer-Wunsch)
    const period=300/GS;          // Wellenlaenge 300 mm (wie HAs 150-mm-Zickzack-Halbschritt)
    const step=0.25;              // Sample-Abstand (Zellen)
    const pts=[];
    for(let s=0;s<=len;s+=step){
      const a=Math.sin((s/period)*2*Math.PI)*AMP;
      pts.push((x0+ux*s+nx*a).toFixed(2),(y0+uy*s+ny*a).toFixed(2));
    }
    svgEl('polyline',{points:pts.join(' '),fill:'none',stroke:CURTAIN_COL,'stroke-width':0.35,'stroke-linejoin':'round','stroke-linecap':'round'});
  });
}

function buildOverlay(){
  ov.innerHTML='';
  for(const k in labelEls) delete labelEls[k];
  for(const k in markEls)  delete markEls[k];
  ov.setAttribute('viewBox', `0 0 ${W} ${He}`); ov.setAttribute('preserveAspectRatio','none');
  drawZones();       // Sperrzonen / virtuelle Waende (wie HA)
  drawFurniture();   // Moebel (HA-Bilder)
  drawCurtains();    // Vorhaenge (Zickzack)
  // gefahrene Spur (unter Labels/Marker). Zuerst die Wischspur, damit die duenne
  // Saugspur darauf liegt — bei "saugen und wischen" gehoert der Abschnitt in beide.
  baueSpurMaske();
  mopEl=document.createElementNS(NS,'path'); mopEl.setAttribute('class','mopspur');
  mopEl.setAttribute('mask','url(#spurmaske)'); ov.appendChild(mopEl);
  trailEl=document.createElementNS(NS,'path'); trailEl.setAttribute('class','trail'); ov.appendChild(trailEl);
  renderTrail();
  // Raummarke: eine Gruppe je Raum, darin Name und (bei Auswahl) das Badge. Die Gruppe
  // sitzt am Raumschwerpunkt und wird gegen den Zoom skaliert — innen gilt Pixelmass.
  for (const id of Object.keys(rooms)){
    const r=rooms[id], [sx,sy]=toScreen(r.sumX/r.count, r.sumY/r.count);
    const g=document.createElementNS(NS,'g'); g.setAttribute('class','rmark');
    g.dataset.x=sx; g.dataset.y=sy;
    const t=document.createElementNS(NS,'text'); t.setAttribute('class','rlabel');
    t.setAttribute('x',0); t.setAttribute('y',0);
    const s=labelStyle(+id); t.setAttribute('fill', s.fill); t.style.fontWeight=s.weight; t.style.opacity=s.opacity;
    t.textContent=roomName(id,META.seg_inf);
    g.appendChild(t);
    if(hidden.has(+id)) g.style.display='none';
    ov.appendChild(g); labelEls[id]=t; markEls[id]=g;
  }
  skaliereMarken(true);
  updateRoomBadges();
  chargerMk = chargerPos ? iconMarker(chargerPos[0],chargerPos[1],ICON.CHARGER,ICON_SIZE.charger) : null;
  robotMk   = robotPos   ? iconMarker(robotPos[0],robotPos[1],ICON.ROBOT,ICON_SIZE.robot,'robot-mk','ROBOT') : null;
  // Die Marker werden bei jedem Kartenpaket neu erzeugt — den Roboter deshalb dorthin
  // setzen, wo die laufende Bewegung ihn gerade hat, sonst springt er kurz vor.
  // Bedingung ist "faehrt gerade" (animReq), nicht "gibt es eine Spur": die bleibt nach
  // der Reinigung liegen, und der Marker klebte dann an ihrem Ende fest.
  if (robotMk && animReq) syncRobotToHead();
  else if (robotMk && smooth && dispPos) placeRobot(dispPos.x, dispPos.y, dispAngle); // laufende Bewegung nicht stoeren
  else if (robotMk && robotPos) placeRobot(robotPos[0], robotPos[1], robotAngle());
  updateBadges(); // Marker wurden neu erzeugt -> Zustands-Badges wiederherstellen
  baueStationHit(); // NACH dem Roboter: steht er in der Station, liegt sein Icon sonst drueber
  drawGrid();     // Diagnose zuletzt -> liegt oben drauf
}

/**
 * Unsichtbare Trefferflaeche ueber der Ladestation, die das Stationsmenue oeffnet.
 * Bewusst als LETZTES eingehaengt: der Roboter wird nach der Station gezeichnet und
 * deckt sie beim Andocken vollstaendig ab — ein Klick traefe sonst ihn.
 * Wird wie die Raummarken gegen den Zoom skaliert, damit die Flaeche immer gross genug
 * fuer einen Finger bleibt.
 */
let stationHit = null;
function baueStationHit(){
  stationHit = null;
  if (!chargerPos) return;
  const g = document.createElementNS(NS,'g');
  g.setAttribute('class','stationhit');
  const c = document.createElementNS(NS,'circle');
  // 56 px Durchmesser — groesser als ein Badge, weil die Station kein sichtbares Ziel
  // hat, an dem man sich beim Tippen ausrichten kann.
  c.setAttribute('cx',0); c.setAttribute('cy',0); c.setAttribute('r',28);
  c.setAttribute('fill','transparent');
  g.appendChild(c);
  const [sx,sy] = wS(chargerPos[0], chargerPos[1]);
  g.dataset.x = sx; g.dataset.y = sy;
  ov.appendChild(g);
  stationHit = g;
  skaliereStationHit();
}
function skaliereStationHit(){
  if (!stationHit) return;
  // uiFaktor wie bei den Raummarken (skaliereMarken) — sonst bleibt die Station als
  // einziges Ziel klein, waehrend Badges und Knoepfe mitwachsen.
  const s = uiFaktor / (cell * scale);
  if (!isFinite(s) || s <= 0) return;   // s. skaliereMarken: scale 0 bei unsichtbarem Widget
  stationHit.setAttribute('transform',
    `translate(${stationHit.dataset.x} ${stationHit.dataset.y}) scale(${s})`);
}

function buildRoomList(){
  const roomList=document.getElementById('roomList'); roomList.innerHTML='';
  for(const k in rowEls) delete rowEls[k];
  Object.keys(rooms).sort((a,b)=>a-b).forEach(id=>{
    const row=document.createElement('div'); row.className='rrow'+(hidden.has(+id)?' off':'');
    const sw=document.createElement('span'); sw.className='sw'; sw.style.background=rgbCss(roomCol(id).label);
    const nm=document.createElement('span'); nm.textContent=roomName(id,META.seg_inf);
    row.append(sw,nm); row.onclick=()=>toggleRoom(+id);
    roomList.appendChild(row); rowEls[id]=row;
  });
}

function toggleRoom(seg){
  if (hidden.has(seg)) hidden.delete(seg); else hidden.add(seg);
  drawFills();
  buildOverlay(); // Overlays (Moebel/Vorhaenge/Zonen/Labels) mit neuem hidden-Zustand neu aufbauen
  if (rowEls[seg]) rowEls[seg].classList.toggle('off', hidden.has(seg));
  fitVisible();
}

// ---- Zoom / Pan ----
// skaliereMarken haelt Raumnamen und Badges in konstanter Groesse; es prueft selbst,
// ob sich der Zoom ueberhaupt geaendert hat (beim Verschieben aendert er sich nicht).
/**
 * Drehpunkt fuer die Kartendrehung: die Mitte der Karte.
 * Die Drehung MUSS in der Kette stehen und darf nicht ueber transform-origin laufen —
 * das steht auf 0 0, damit translate/scale die einfache Form "Bildpunkt = (tx,ty) + s·p"
 * behalten. Daran haengen zoomAt, clamp und hitRoom. Ein anderer Ursprung wuerde alle
 * drei stillschweigend verschieben.
 */
const drehMitte = () => [MAPW/2, MAPH/2];
const applyT=()=>{
  const [cx,cy] = drehMitte();
  const d = kartenDrehung
    ? ` translate(${cx}px,${cy}px) rotate(${kartenDrehung}deg) translate(${-cx}px,${-cy}px)`
    : '';
  wrap.style.transform=`translate(${tx}px,${ty}px) scale(${scale})${d}`;
  skaliereMarken();
};
/** Punkt um die Kartenmitte drehen (Winkel in Grad, mathematisch positiv = im Uhrzeigersinn). */
function drehePunkt(x, y, grad){
  if (!grad) return [x, y];
  const [cx,cy] = drehMitte();
  const a = grad * Math.PI/180, dx = x-cx, dy = y-cy;
  return [cx + dx*Math.cos(a) - dy*Math.sin(a), cy + dx*Math.sin(a) + dy*Math.cos(a)];
}
function visibleBox(){
  let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity,any=false;
  for(const id of Object.keys(rooms)){
    if(hidden.has(+id)) continue; any=true; const r=rooms[id];
    x0=Math.min(x0,r.minX*cell); x1=Math.max(x1,(r.maxX+1)*cell);
    y0=Math.min(y0,(He-1-r.maxY)*cell); y1=Math.max(y1,(He-1-r.minY+1)*cell);
  }
  const b = any ? {x0,y0,x1,y1} : {x0:0,y0:0,x1:MAPW,y1:MAPH};
  if (!kartenDrehung) return b;
  // Gedrehtes Rechteck: die vier Ecken drehen und neu umschliessen. Bei Vierteldrehungen
  // bleibt das Ergebnis achsenparallel, Breite und Hoehe tauschen bei 90 und 270.
  // Damit brauchen clamp() und fitVisible() keine Aenderung — sie bekommen schlicht die
  // Ausdehnung, die auf dem Bildschirm wirklich belegt wird.
  const ecken = [[b.x0,b.y0],[b.x1,b.y0],[b.x1,b.y1],[b.x0,b.y1]]
    .map(([x,y]) => drehePunkt(x, y, kartenDrehung));
  const xs = ecken.map(p=>p[0]), ys = ecken.map(p=>p[1]);
  return { x0:Math.min(...xs), y0:Math.min(...ys), x1:Math.max(...xs), y1:Math.max(...ys) };
}
function clamp(){
  const sw=stage.clientWidth, sh=stage.clientHeight;
  const bw=(box.x1-box.x0)*scale, bh=(box.y1-box.y0)*scale;
  tx = bw<=sw ? (sw-bw)/2 - box.x0*scale : Math.min(-box.x0*scale, Math.max(sw-box.x1*scale, tx));
  ty = bh<=sh ? (sh-bh)/2 - box.y0*scale : Math.min(-box.y0*scale, Math.max(sh-box.y1*scale, ty));
}
// Steht noch ein Einpassen aus, weil die Kartenflaeche keine Groesse hatte?
let fitOffen = false;
function fitVisible(){
  box=visibleBox(); const sw=stage.clientWidth, sh=stage.clientHeight;
  // Keine Groesse = das Widget ist gerade nicht sichtbar (in VIS z. B. eine Ansicht, die
  // nicht vorne liegt). Dann NICHT rechnen: minScale wuerde 0, und in skaliereMarken
  // wuerde daraus eine Division durch null, also scale(Infinity) an jeder Raummarke.
  // Der bisherige Massstab bleibt stehen, das Einpassen holt der Beobachter unten nach,
  // sobald die Flaeche eine echte Groesse bekommt.
  if (sw <= 0 || sh <= 0){ fitOffen = true; return; }
  fitOffen = false;
  minScale=Math.min(sw/(box.x1-box.x0), sh/(box.y1-box.y0))*0.94;
  scale=minScale; clamp(); applyT();
}
function zoomAt(cx,cy,f){ const r=stage.getBoundingClientRect(); const px=cx-r.left, py=cy-r.top;
  const ns=Math.max(minScale, Math.min(minScale*12, scale*f));
  tx=px-(px-tx)*(ns/scale); ty=py-(py-ty)*(ns/scale); scale=ns; clamp(); applyT(); }

let zoomBound=false;
function setupZoom(){
  if(zoomBound) return; zoomBound=true;
  // Einstellungs-Popover (Zahnrad): Ansicht-Toggles + Raumliste ein/ausblenden
  const gearBtn=document.getElementById('gearBtn'), gearOvl=document.getElementById('gearOvl');
  // Einstellungen als mittiger Dialog wie alle anderen. oeffneOvl merkt sich den
  // Zeitpunkt — ohne das wuerde der nachgereichte Klick einer Beruehrung das Fenster
  // sofort wieder schliessen (s. Kommentar bei oeffneOvl).
  const setGear=(open)=>{
    gearOvl.classList.toggle('open', open);
    gearBtn.classList.toggle('on', open);
    if (open) ovlAufSeit = (window.performance ? performance.now() : Date.now());
  };
  gearBtn.addEventListener('click', ()=> setGear(true));
  document.getElementById('gearClose').onclick = ()=> setGear(false);
  gearOvl.addEventListener('click', (e)=>{
    if (e.target !== gearOvl) return;                               // nur der Rand schliesst
    const jetzt = (window.performance ? performance.now() : Date.now());
    if (jetzt - ovlAufSeit < OVL_SPERRE) return;
    setGear(false);
  });
  document.addEventListener('keydown', e=>{ if(e.key==='Escape') setGear(false); });
  stage.addEventListener('wheel', e=>{ e.preventDefault(); zoomAt(e.clientX,e.clientY, e.deltaY<0?1.15:1/1.15); }, {passive:false});
  let drag=false, lx=0, ly=0, sx0=0, sy0=0, downT=null;
  // Echte Bedienelemente ueber der Karte (Zoom-Leiste) duerfen das Ziehen nicht ausloesen:
  // setPointerCapture unten wuerde sonst auch den anschliessenden Klick auf die Karte
  // umleiten, und der Knopf bekaeme ihn nie zu sehen.
  const aufBedienung = t => !!(t && t.closest && t.closest('.zoom'));
  stage.addEventListener('pointerdown', e=>{ if(aufBedienung(e.target)) return;
    drag=true; lx=e.clientX; ly=e.clientY; sx0=e.clientX; sy0=e.clientY; downT=e.target; wrap.classList.add('drag'); stage.setPointerCapture(e.pointerId); });
  stage.addEventListener('pointermove', e=>{ if(!drag)return; tx+=e.clientX-lx; ty+=e.clientY-ly; lx=e.clientX; ly=e.clientY; clamp(); applyT(); });
  stage.addEventListener('pointerup', e=>{ if(aufBedienung(e.target)) return;
    drag=false; wrap.classList.remove('drag');
    const moved=Math.hypot(e.clientX-sx0, e.clientY-sy0);
    // Ein Finger rollt beim Aufsetzen fast immer ein paar Pixel weiter, eine Maus steht
    // still. Mit einer gemeinsamen Schwelle von 5 px gingen Tipper auf Glas verloren.
    const schwelle = (e.pointerType==='touch' || e.pointerType==='pen') ? 12 : 5;
    if(moved<schwelle){
      // Badge und Station zuerst pruefen: beide liegen ueber der Raumflaeche, ein Tipp
      // darauf soll ihr Menue oeffnen und den Raum NICHT aus-/abwaehlen.
      const bdg = downT && downT.closest && downT.closest('.rbadge');
      const sth = downT && downT.closest && downT.closest('.stationhit');
      if (sth) openStationMenu();
      else if (bdg) openRoomSettings(+bdg.dataset.raum);
      else { const seg=hitRoom(e.clientX,e.clientY); if(seg!=null) selectRoom(seg); }
    }
  });
  const ctr=()=>{ const r=stage.getBoundingClientRect(); return [r.left+r.width/2, r.top+r.height/2]; };
  document.getElementById('z-in').onclick =()=> zoomAt(...ctr(),1.3);
  document.getElementById('z-out').onclick=()=> zoomAt(...ctr(),1/1.3);
  document.getElementById('z-reset').onclick=fitVisible;
  window.addEventListener('resize', ()=>{ box=visibleBox(); clamp(); applyT(); });
  // Groessenaenderungen der Kartenflaeche selbst: das Fenster-Ereignis oben feuert NICHT,
  // wenn in VIS die Ansicht gewechselt wird — dabei aendert sich nur die Sichtbarkeit
  // unseres Rahmens, nicht das Fenster. Bekommt die Flaeche eine echte Groesse und steht
  // noch ein Einpassen aus, wird es hier nachgeholt.
  if (window.ResizeObserver){
    new ResizeObserver(()=>{
      if (!stage.clientWidth || !stage.clientHeight) return;
      if (fitOffen) fitVisible();
      else { box=visibleBox(); clamp(); applyT(); }
    }).observe(stage);
  }
  function setupToggle(btnId, cls){ const b=document.getElementById(btnId);
    b.addEventListener('click', ()=>{ const o=document.body.classList.toggle(cls); b.classList.toggle('off',o); }); }
  // Anzeigegroesse (Zahnrad-Menue). Der Kartenzoom bleibt davon unberuehrt.
  // Waehrend des Ziehens (input) nur anzeigen, gemerkt wird erst beim Loslassen
  // (change) — sonst schreibt jeder Zwischenschritt in den Speicher.
  const uiR = document.getElementById('uiRange');
  uiR.oninput  = ()=> setzeUi(+uiR.value/100, false);
  uiR.onchange = ()=> setzeUi(+uiR.value/100, true);
  reglerFuellung(uiR);
  // Farben und Hintergrund
  document.getElementById('farbenRow').onclick = ()=> openPicker('Farben', FARBEN, farbWahl,
    (id)=>{ farbWahl = id; setzeAussehen(true); });
  document.getElementById('hgRow').onclick = ()=> openPicker('Hintergrund', HINTERGRUND, hgWahl,
    (id)=>{ hgWahl = id; setzeAussehen(true); });
  // Eigene Hintergrundfarbe: waehrend des Ziehens im Farbwaehler nur anzeigen (input),
  // gemerkt wird erst beim Bestaetigen (change) — gleiches Prinzip wie bei den Reglern.
  const bgIn = document.getElementById('bgFarbeInput');
  bgIn.oninput  = ()=> { bgFarbe = bgIn.value; setzeAussehen(false); };
  bgIn.onchange = ()=> { bgFarbe = bgIn.value; setzeAussehen(true); };
  document.getElementById('bgFarbeReset').onclick = ()=> { bgFarbe = null; setzeAussehen(true); };
  document.getElementById('leisteRow').onclick = ()=> openPicker('Bedienung', LEISTE, leisteWahl,
    (id)=>{ leisteWahl = id; setzeAussehen(true); });
  document.getElementById('drehRow').onclick = ()=> openPicker('Karte drehen', DREHUNG,
    String(kartenDrehung), (id)=>{
      kartenDrehung = Number(id);
      // Der belegte Bereich hat sich geaendert (bei 90/270 tauschen Breite und Hoehe),
      // deshalb neu einpassen statt nur neu zu zeichnen.
      setzeAussehen(true);
      try { box = visibleBox(); fitVisible(); } catch (e) {}
    });
  const lgR = document.getElementById('lgRange');
  lgR.oninput  = ()=> setzeLeistenGroesse(+lgR.value, false);
  lgR.onchange = ()=> setzeLeistenGroesse(+lgR.value, true);
  // Adresse kopieren. navigator.clipboard gibt es nur ueber HTTPS bzw. auf localhost —
  // im Heimnetz laeuft ioBroker meist ueber HTTP, deshalb der Rueckfall auf Markieren.
  const adrCopy = document.getElementById('adrCopy'), adrFeld = document.getElementById('adrFeld');
  adrCopy.onclick = async ()=>{
    const alt = adrCopy.textContent;
    try {
      if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(adrFeld.value);
      else { adrFeld.select(); document.execCommand('copy'); }
      adrCopy.textContent = 'Kopiert';
    } catch (e) {
      adrFeld.select();
      adrCopy.textContent = 'Bitte von Hand kopieren';
    }
    setTimeout(()=>{ adrCopy.textContent = alt; }, 2000);
  };
  setupToggle('t-trail','trail-off');
  // "Änderungen": kein CSS-Toggle, sondern Neuzeichnen (rot = seit Schnappschuss geändert)
  document.getElementById('t-changes').addEventListener('click', () => {
    showChanges = !showChanges;
    if (showChanges && !changeSnap) takeChangeSnapshot(); // Fallback: ab jetzt vergleichen
    document.getElementById('t-changes').classList.toggle('off', !showChanges);
    drawFills();
  });
  // "Raster": Diagnose-Gitter (s. drawGrid)
  document.getElementById('t-grid').addEventListener('click', () => {
    showGrid = !showGrid;
    document.getElementById('t-grid').classList.toggle('off', !showGrid);
    buildOverlay();
  });
  // "Flüssig": Abspielkopf + Gleitfahrt an/aus
  const smoothBtn=document.getElementById('t-smooth');
  smoothBtn.classList.toggle('off', !smooth);
  smoothBtn.addEventListener('click', () => {
    smooth = !smooth;
    try{ localStorage.setItem('dreameSmooth', smooth?'1':'0'); }catch(e){}
    smoothBtn.classList.toggle('off', !smooth);
    if (!smooth){
      // sofort auf den echten Stand: laufende Animationen stoppen, Spur ganz zeichnen,
      // Roboter auf die gemeldete Position
      if(animReq){ cancelAnimationFrame(animReq); animReq=null; }
      stopGlide();
      headDist=totalDist(); animT=1; renderTrail();
      if(robotMk && robotPos) placeRobot(robotPos[0],robotPos[1],robotAngle());
    }
  });
}

// ---- kompletter (Neu-)Aufbau aus CloudData ----
async function rebuild(cloudStr){
  await decode(cloudStr);
  for (const id of [...selectedRooms]) if (!rooms[id]) selectedRooms.delete(id); // weggefallene Räume abwählen
  // Fahrspur: bevorzugt die im Adapter aufgesammelte Spur, sonst das rohe tr-Stueck der
  // aktuellen Karte. trpts = [x, y, typ] mit 0=L, 1=S, 2=W, 3=M (mapMerge.js).
  // Aeltere Adapter liefern dort nur 0/1 — dann fehlt die Wischspur, aber die Saugspur
  // stimmt weiterhin, weil 1 auf 'S' abgebildet wird.
  const newTrail = Array.isArray(META.trpts)
    ? META.trpts.map(a => ({ x:a[0], y:a[1], operator: TRPT_OP[a[2]] || 'L' }))
    : decodeTr(META.tr);
  drawFills(); buildOverlay(); buildRoomList(); setupZoom(); updateLabels(); updateCleanPanel();
  // Gemeldeten Blickwinkel weiterschieben: der bisherige wird zum Start der Animation,
  // der neue zum Ziel. Nur hier (ein Kartenpaket = ein Winkel-Uebergang), nicht in
  // feedTrail — das wird pro Paket mehrfach aufgerufen.
  const repAng = robotAngle();
  if (repAng !== null && repAng !== undefined){ angFrom = (angTo===null) ? repAng : angTo; angTo = repAng; }
  // NACH buildOverlay (dort entstehen trailEl/robotMk neu): Abspielkopf auf die neue
  // Spur ansetzen. Er bleibt stehen, wo er ist, und faehrt das neue Stueck ab.
  feedTrail(newTrail);
  if (firstFit){ fitVisible(); firstFit=false; } else { box=visibleBox(); clamp(); applyT(); }
}

// ---- Live-Updates einzelner Werte ----
function updateRobot(pos){ robotPos=pos;
  if (pos && !robotMk) robotMk = iconMarker(pos[0],pos[1],ICON.ROBOT,ICON_SIZE.robot,'robot-mk','ROBOT');
  // Faehrt der Abspielkopf gerade eine Spur ab, fuehrt er den Marker — hier nicht
  // eingreifen, sonst zerren zwei Quellen daran.
  // Sonst gleitet er weich zur neuen gemeldeten Position (Rueckfahrt zur Station).
  // WICHTIG: die Bedingung ist "faehrt gerade" (animReq), NICHT "gibt es eine Spur" —
  // die bleibt naemlich nach der Reinigung liegen und der Marker klebte dann fuer immer
  // an ihrem Ende, waehrend der Roboter heimfuhr.
  if (pos && !animReq && robotMk){
    if (smooth) glide(pos, robotAngle());
    else placeRobot(pos[0], pos[1], robotAngle()); // "Flüssig" aus: direkt auf die Meldung
  }
}
function updateCharger(pos){ chargerPos=pos;
  if (chargerMk && pos) moveIcon(chargerMk,pos[0],pos[1],ICON_SIZE.charger);
  else if (pos && !chargerMk) chargerMk = iconMarker(pos[0],pos[1],ICON.CHARGER,ICON_SIZE.charger);
}
const isBreak = op => op==='S'||op==='M'||op==='W'; // absoluter Neustart = Umsetzfahrt

/**
 * Maske fuer die Wischspur. Die ist rund zehnmal so breit wie die Saugspur und wuerde
 * ohne Beschnitt ueber Waende und Moebel hinausquellen. HA stanzt sie deshalb auf die
 * Kartenflaeche (map.py 9224 und 10798-10812):
 *     if self._has_mask and px_type <= 100: mask[y, x] = mask_color
 * — innerhalb von `if px_type != 0`, das Aussenherum bleibt also frei. Typen ueber 100
 * (Wand 255, Boden 254, frisch gescannt 253) gehoeren NICHT dazu: gewischt wird nur in
 * zugeordneten Raeumen.
 * Umgesetzt als SVG-Maske mit einem Bild in Zellenaufloesung — dieselbe Groesse, in der
 * die Karte ohnehin gezeichnet wird, und im selben Koordinatensystem wie die Spur.
 */
function baueSpurMaske(){
  const c=document.createElement('canvas'); c.width=W; c.height=He;
  const g=c.getContext('2d');
  const bild=g.createImageData(W,He);
  for (let y=0;y<He;y++) for (let x=0;x<W;x++){
    const t=raw[mapStart+y*W+x];
    if (t===0 || t>100) continue;                 // aussen bzw. Wand/Boden -> nicht wischbar
    if (isRoom(t) && hidden.has(t)) continue;     // ausgeblendeter Raum: auch keine Spur
    const di=((He-1-y)*W + x)*4;                  // Y gespiegelt wie in drawFills
    bild.data[di]=255; bild.data[di+1]=255; bild.data[di+2]=255; bild.data[di+3]=255;
  }
  g.putImageData(bild,0,0);
  let defs=ov.querySelector('defs');
  if(!defs){ defs=document.createElementNS(NS,'defs'); ov.insertBefore(defs, ov.firstChild); }
  let m=defs.querySelector('#spurmaske');
  if(!m){
    m=document.createElementNS(NS,'mask'); m.setAttribute('id','spurmaske');
    m.setAttribute('maskUnits','userSpaceOnUse');
    defs.appendChild(m);
  }
  m.innerHTML='';
  const im=document.createElementNS(NS,'image');
  im.setAttribute('x',0); im.setAttribute('y',0);
  im.setAttribute('width',W); im.setAttribute('height',He);
  // Harte Kanten wie bei der Karte selbst, sonst franst der Rand der Wischspur aus.
  im.setAttribute('image-rendering','pixelated');
  im.setAttribute('href', c.toDataURL());
  m.appendChild(im);
}


// ===== Nachtrag (Commit B5): weitere Kartenlogik-Fragmente, die B2 nicht erfasst hatte =====
// Bei der main.js-Integration (Etappe B, Commit B5) stellte sich heraus, dass diese Funktionen
// zwar inhaltlich zur Kartenanzeige gehoeren, in legacy.html aber unter anderen Bereichen
// standen ("Reinigungs-Panel", "Raum-Einstellungen (cleanset)", "Raumnamen", Ende von
// "Konfiguration") — B2 hat sich an WIDGET_ARCHITEKTUR.md Tabelle 7 orientiert, die diese
// Funktionen dort nicht auflistete. Verbatim uebernommen wie der Rest dieser Datei, siehe
// WIDGET_SESSION_STATUS.md fuer die vollstaendige Herleitung.

// Marker mit HAs Original-Icons (aus icons.js, Dreame-Set hell)
const ICON = window.HA_ICONS || {};
// Icon-Groessen in Karten-Zellen — HA berechnet sie aus der Kartengroesse (map.py
// 9664-9684), damit der Roboter auf jeder Karte gleich gross WIRKT:
//   robot = 3,7 % der Kartenseite (bei Drehung 0/180 Breite, sonst Hoehe), Grenzen 7..14
//   charger = robot * 1,2 (map.py 10246 -- bei uns war es bisher umgekehrt: 9 zu 7)
// HAs Zusatz `if scale <= 2: robot *= 0.7` greift hier nicht: unsere Zellgroesse ist
// cell = 4 px, also > 2.
// ICON_SCALE = 1: exakt HAs Groesse (Nutzerwunsch 2026-07-17; der fruehere 0.64-Faktor
// "halb so gross" ist damit zurueckgenommen). Zum Nachjustieren NUR diesen Wert aendern,
// das Groessenverhaeltnis zur Karte und zur Station bleibt dann HA-konform erhalten.
const ICON_SCALE = 1;
let ICON_SIZE = { robot: 9 * ICON_SCALE, charger: 9 * 1.2 * ICON_SCALE }; // bis zur 1. Karte
function computeIconSizes(){
  // HA: rotation 0/180 -> Breite, sonst Hoehe. Unser Widget dreht die Karte nicht (eigene
  // Luecke, in PORT_STATUS vermerkt); die Wahl der Basisseite folgt trotzdem HA.
  const rot = (META && META.mra) || 0;
  const base = (rot === 0 || rot === 180) ? W : He;
  const robot = Math.max(7, Math.min(14, base * 0.037));
  ICON_SIZE = { robot: robot * ICON_SCALE, charger: robot * 1.2 * ICON_SCALE };
}
// Icon = Gruppe (Position) + Icon-Inhalt darin (Drehung ums eigene Zentrum).
// Getrennt, damit die Fahrt sauber gleitet und die Rotation nicht den Drehpunkt verschiebt.
//
// Liegt fuer das Icon ein VEKTOR vor (icons_vec.js), wird der als <path> direkt in die
// Karte gezeichnet — nicht als <image>. Grund: ein Bild rastert der Browser einmal in der
// angezeigten Groesse (~18 px) und skaliert es beim Zoomen hoch. Genau daher kam die
// Unschaerfe. Als Pfad wird es bei jeder Zoomstufe frisch gezeichnet.
const VEC = window.HA_ICONS_VEC || {};
function iconMarker(wx,wy,href,size,cls,vecKey){
  const g=document.createElementNS(NS,'g');
  if(cls) g.setAttribute('class',cls);
  const vec = vecKey && VEC[vecKey];
  let node;
  if (vec){
    // Zwei Ebenen: aussen die Drehung (die setzt moveIcon), innen die Skalierung.
    // Beides auf demselben Element wuerde sich gegenseitig ueberschreiben.
    node=document.createElementNS(NS,'g');
    const inner=document.createElementNS(NS,'g');
    const s=size/vec.viewBox; // Pfade liegen im Koordinatensystem des Originals (0..viewBox)
    inner.setAttribute('transform',`scale(${s}) translate(${-vec.viewBox/2},${-vec.viewBox/2})`);
    for(const p of vec.paths){
      const el=document.createElementNS(NS,'path');
      el.setAttribute('d',p.d); el.setAttribute('fill',p.fill); el.setAttribute('fill-rule','evenodd');
      inner.appendChild(el);
    }
    node.appendChild(inner);
  } else {
    node=document.createElementNS(NS,'image');
    node.setAttribute('href',href);
    node.setAttributeNS('http://www.w3.org/1999/xlink','href',href); // Fallback ältere Renderer
    node.setAttribute('x',-size/2); node.setAttribute('y',-size/2);  // zentriert um (0,0)
    node.setAttribute('width',size); node.setAttribute('height',size);
  }
  node.setAttribute('data-icon','1'); // markiert das eigentliche Icon (s. moveIcon)
  g.appendChild(node); ov.appendChild(g); moveIcon(g,wx,wy,size); return g;
}
function moveIcon(el,wx,wy,size,angle){
  const [sx,sy]=wS(wx,wy);
  // SVG-Attribut statt style.transform: Letzteres schiebt das Icon in eine eigene
  // GPU-Ebene, die beim Zoomen hochskaliert wird -> unscharf. Das Attribut wird vom
  // SVG-Renderer bei jeder Aenderung sauber neu gezeichnet.
  el.setAttribute('transform',`translate(${sx.toFixed(2)},${sy.toFixed(2)})`);
  // HA dreht das Roboter-Icon nach Blickrichtung (PIL rotate = gegen Uhrzeiger -> SVG negativ)
  // Gezielt das Icon-Bild drehen, NICHT firstChild: setBadge schiebt den Zustands-Kreis
  // per insertBefore davor ('behind'), dadurch waere firstChild der Kreis — der Roboter
  // hat sich deshalb waehrend der Reinigung ueberhaupt nicht mehr ausgerichtet.
  const img = el.querySelector('[data-icon]'); // <image> ODER <g> (Vektor)
  if (angle!==undefined && angle!==null && img){
    // Winkel FORTLAUFEND halten. Sonst: faehrt der Roboter nach links, liegt die Richtung
    // bei ~180° — und die Rechnung springt dort staendig zwischen +178° und -178°. Real
    // sind das 4°, das Icon nimmt aber den langen Weg und dreht sich fast einmal komplett.
    // An echten Spurdaten nachgemessen: 6° echte Drehung -> 354° Icon-Drehung.
    let a = angle;
    if (el._ang !== undefined){ let d=a-el._ang; while(d>180)d-=360; while(d<-180)d+=360; a=el._ang+d; }
    el._ang = a;
    img.setAttribute('transform',`rotate(${-a})`);
  }
}
const robotAngle=()=> (META && META.ha && META.ha.robotAngle!=null) ? META.ha.robotAngle : null;

