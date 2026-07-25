/*
 * Karten-Rendering: Raum-Badges, Abspielkopf (Roboter-Position), Fahrt ohne Spur
 * ========================================================================
 * Herkunft: browserseitiger Teil des Karten-Widgets aus RicardoHipps Fork
 *   https://github.com/RicardoHipp/ioBroker.dreame
 * Ursprung des zugrundeliegenden Kartenformats:
 *   dreame-vacuum (Home Assistant Integration) von Tasshack
 *   https://github.com/Tasshack/dreame-vacuum — Copyright (c) 2022 Tasshack — MIT License
 * Der Abspielkopf-Teil weicht bewusst von HAs Ansatz ab (siehe Kommentar im Code:
 * "🎨 bewusste Abweichung von HA") — flüssige Interpolation statt Sprung je Frame.
 *
 * MIT License — the above copyright notice and this permission notice shall be
 * included in all copies or substantial portions of the Software.
 * -----------------------------------------------------------------------------
 *
 * Strukturell unveraendert aus www/legacy.html hierher verschoben (WIDGET_UMBAU_PLAN.md
 * Etappe B, Commit B2) — reine Datei-Umorganisation, keine Logik-Aenderung. Nutzt Globals
 * (markEls, selectedRooms, activeSegs, customizedCleaning u.a.), die zum Zeitpunkt dieses
 * Commits noch in legacy.html leben und erst in spaeteren Etappen (u.a. Reinigungs-Panel,
 * Etappe C5) in die neue Struktur ueberfuehrt werden — die Kopplung an Panel-Funktionen wie
 * updateCleanPanel() ist bereits im Original so vorhanden und wird hier unveraendert
 * mitverschoben.
 */

// ===== Raum-Badges auf der Karte =====
// Masse in Bildschirmpixeln (die Marke wird gegen den Zoom skaliert, s. skaliereMarken).
const BDG = { hoehe:22, ikon:14, ziffer:7, luecke:2, abstand:8, rand:8 };
// Das Badge wird zusaetzlich vergroessert. Bewusst NUR das Badge und nicht die ganze
// Raummarke: der Raumname darueber soll seine Groesse behalten, sonst ueberdecken sich
// die Beschriftungen enger Raeume.
// Frueher 1.5, damit es auf dem Tablett gut zu treffen ist. Seit es in den meisten
// Faellen reine Anzeige ist (Einheitlich-Betrieb und waehrend der Fahrt), zaehlt die
// Fingergroesse nicht mehr — es nahm nur Platz auf der Karte weg.
const BDG_SKALA = 1.05;

/** Ein Icon aus UI_ICONS als SVG-Gruppe, auf px-Kantenlaenge gebracht. */
function svgIkon(name, px, klasse){
  const d = (window.UI_ICONS||{})[name]; if (!d) return null;
  const g = document.createElementNS(NS,'g');
  if (klasse) g.setAttribute('class', klasse);
  g.setAttribute('fill','none'); g.setAttribute('stroke','currentColor');
  // Strichstaerke gegen die Verkleinerung anheben, sonst wird das Icon fadendünn
  g.setAttribute('stroke-width', 2.4); g.setAttribute('stroke-linecap','round');
  g.setAttribute('stroke-linejoin','round');
  g.setAttribute('transform', `translate(0 ${-px/2}) scale(${px/24})`);
  g.innerHTML = d;
  return g;
}

/**
 * Badge eines Raums: was ihn erwartet, in Symbolen. Der Modus zeigt sich dadurch,
 * WELCHE Symbole da sind — kein Tropfen heisst, es wird nicht gewischt.
 * Das ganze Badge ist die Schaltflaeche fuer die Raum-Einstellungen.
 */
function baueBadge(id){
  // Im Einheitlich-Betrieb gilt fuer JEDEN Raum derselbe Geraetewert — dann zeigt das
  // Badge genau den, nicht den je Raum gespeicherten cleanset-Wert.
  const einheitlich = !customizedCleaning;
  // Reine Anzeige (kein Zahnrad, nicht antippbar) in zwei Faellen:
  //  - Einheitlich: die Raum-Einstellungen dahinter wirken nur im Individuell-Betrieb.
  //  - Waehrend einer Reinigung: das Badge zeigt dann, womit gerade gefahren wird.
  //    Mittendrin daran zu drehen wuerde ins cleanset schreiben, waehrend der Roboter
  //    laengst mit den alten Werten unterwegs ist.
  const nurAnzeige = einheitlich || geraetGestartet();
  const teile = [];
  // Anzeige 1-4, intern 0-3
  if (raumSaugt(id))  teile.push(['saugen', String((einheitlich ? globalSaug : raumSaug(id)) + 1)]);
  if (raumWischt(id)) teile.push(['wasser', String(einheitlich ? globalWasser : raumWasser(id))]);
  if (raumWdh(id) > 1) teile.push(['wiederholung', String(raumWdh(id))]);
  if (!nurAnzeige) teile.push(['einstellungen', null]);                   // Hinweis: hier tippen

  let breite = BDG.rand * 2;
  for (const [, wert] of teile){
    breite += BDG.ikon + BDG.abstand;
    if (wert) breite += BDG.luecke + wert.length * BDG.ziffer;
  }
  breite -= BDG.abstand;

  const g = document.createElementNS(NS,'g');
  g.setAttribute('class', nurAnzeige ? 'rbadge starr' : 'rbadge'); g.dataset.raum = id;
  const x0 = -breite / 2;
  const kasten = (klasse, x, y, w, h, r) => {
    const e = document.createElementNS(NS,'rect');
    e.setAttribute('class', klasse); e.setAttribute('x', x); e.setAttribute('y', y);
    e.setAttribute('width', w); e.setAttribute('height', h);
    if (r) { e.setAttribute('rx', r); e.setAttribute('ry', r); }
    g.appendChild(e);
  };
  // Trefferflaeche deckungsgleich mit der Pille. Frueher war sie groesser (44 statt 22
  // hoch, seitlich je 6 mehr), weil die Pille fuer einen Finger zu klein war. Seit das
  // Badge um BDG_SKALA vergroessert wird, reicht die Pille selbst — und der Ueberstand
  // war sogar schaedlich: er lag ueber der Raumflaeche, sodass ein Tipp NEBEN das Badge
  // das Einstellungsfenster oeffnete statt den Raum ab- oder anzuwaehlen.
  kasten('hit', x0, -BDG.hoehe/2, breite, BDG.hoehe, BDG.hoehe/2);
  kasten('pille', x0, -BDG.hoehe/2, breite, BDG.hoehe, BDG.hoehe/2);

  let x = x0 + BDG.rand;
  for (const [name, wert] of teile){
    const ik = svgIkon(name, BDG.ikon, name === 'einstellungen' ? 'zr' : null);
    if (ik){
      ik.setAttribute('transform',
        `translate(${x} ${-BDG.ikon/2}) scale(${BDG.ikon/24})`);
      g.appendChild(ik);
    }
    x += BDG.ikon;
    if (wert){
      const t = document.createElementNS(NS,'text');
      t.setAttribute('x', x + BDG.luecke); t.setAttribute('y', 0);
      t.textContent = wert; g.appendChild(t);
      x += BDG.luecke + wert.length * BDG.ziffer;
    }
    x += BDG.abstand;
  }
  return g;
}

/**
 * Badges neu aufbauen — nicht an allen Raeumen, sonst wird die Karte unruhig.
 * Ohne laufenden Auftrag an den GEWAEHLTEN Raeumen (was sie erwartet), waehrend einer
 * Reinigung an den Raeumen des laufenden Auftrags (womit gerade gefahren wird). Die
 * Auswahl wird beim Start geleert, sonst waeren waehrend der Fahrt gar keine Badges da.
 */
function updateRoomBadges(){
  const laeuft = geraetGestartet();
  for (const id of Object.keys(markEls)){
    const g = markEls[id], alt = g.querySelector('.rbadge');
    if (alt) alt.remove();
    const zeigen = laeuft ? activeSegs.has(+id) : selectedRooms.has(+id);
    if (!zeigen || hidden.has(+id)) continue;
    const b = baueBadge(+id);
    // unter den Raumnamen, dort um BDG_SKALA vergroessert (Mitte bleibt die Mitte,
    // weil das Badge um x=0 herum aufgebaut ist)
    b.setAttribute('transform', `translate(0 ${BDG.hoehe}) scale(${BDG_SKALA})`);
    g.appendChild(b);
  }
}

/**
 * Haelt Name und Badge in konstanter Bildschirmgroesse. Eine SVG-Einheit ist cell*scale
 * Bildschirmpixel — mit dem Kehrwert skaliert, entspricht innen 1 Einheit 1 Pixel.
 * uiFaktor legt sich als reine Vergroesserung darueber: unabhaengig vom Kartenzoom,
 * aber insgesamt groesser (inkl. der 44-Pixel-Tippflaeche).
 */
let markScale = null, markUi = null, markDreh = null;
function skaliereMarken(erzwingen){
  if (!erzwingen && markScale === scale && markUi === uiFaktor && markDreh === kartenDrehung) return;
  const s = uiFaktor / (cell * scale);
  // Gueltigkeit pruefen, BEVOR etwas gesetzt wird: bei scale 0 (unsichtbares Widget)
  // waere s unendlich, und der Browser meldet fuer jede Raummarke einen Fehler. Die
  // Merkgroessen bleiben dann unangetastet, damit der naechste echte Aufruf durchlaeuft.
  if (!isFinite(s) || s <= 0) return;
  markScale = scale; markUi = uiFaktor; markDreh = kartenDrehung;
  // Gegendrehung: die Marke sitzt in der gedrehten Karte, soll aber waagerecht lesbar
  // bleiben. Reihenfolge zaehlt — erst an den Ort, dort zurueckdrehen, dann skalieren.
  const dreh = kartenDrehung ? ` rotate(${-kartenDrehung})` : '';
  for (const id of Object.keys(markEls)){
    const g = markEls[id];
    g.setAttribute('transform', `translate(${g.dataset.x} ${g.dataset.y})${dreh} scale(${s})`);
  }
  skaliereStationHit();
}
// Etappe C5.5, Commit 3 (WIDGET_UMBAU_PLAN.md Abschnitt 5.1): kein lokales Set-Toggle mehr
// -- selectRoom() schreibt sofort den Adapter-Checkbox-State (raumUmschalten(), reinigung.js).
// Die sichtbare Auswahl aendert sich NICHT hier, sondern erst wenn die Bestaetigung ueber
// die C5.5-2-Muster-Subscription zurueckkommt (neueDatenMuster() ruft dann selbst
// drawFills()/updateLabels()/render() auf) -- kein optimistisches UI-Update.
function selectRoom(seg){
  raumUmschalten(seg);
}

// ===== Abspielkopf (🎨 bewusste Abweichung von HA) =====
// HA zeichnet je Frame ein PNG: Roboter springt, Spur ist sofort komplett da.
// Wir spielen die neu hinzugekommenen Spurpunkte als Fahrstrecke ab:
//   - die Spur waechst nur HINTER dem Roboter
//   - der Roboter schaut in Fahrtrichtung und dreht erst am Endpunkt auf die
//     vom Geraet gemeldete Richtung
// Der Kopf laeuft ueber die Strecke, gemessen in Millimetern (Weltkoordinaten).
// Umsetzfahrten (Spurbruch S/M/W) haben Laenge 0 -> dort wird gesprungen, nicht gefahren.
let cum=[];            // cum[i] = Streckenlaenge bis trailPts[i]
let headDist=0;        // aktuelle Position des Kopfes auf dieser Strecke
let animFrom=0, animTo=0, animT0=0, animDur=3000, animReq=null;
let lastDataTs=0, frameGap=3000;  // gemessener Abstand der Kartenpakete (gleitend)
let staticSaug='', staticWisch='', staticIdx=0; // fertig gezeichnete Teile (nur bei neuen Daten gebaut)
// Abschnittstyp je Punkt: S/W/M des Bruchs, der diesen Teilpfad begonnen hat. HA haelt
// denselben Wert in einer Variablen mit, die bis zum naechsten Nicht-L-Punkt stehen
// bleibt (map.py 10765-10790) — ein 'L' erbt also den Typ seines Abschnitts.
let sektTyp=[];
function baueSektTyp(pts){
  const out=new Array(pts.length); let akt='S';
  for(let i=0;i<pts.length;i++){
    if(isBreak(pts[i].operator)) akt=pts[i].operator;
    out[i]=akt;
  }
  return out;
}
// Vom GERAET gemeldeter Blickwinkel: der des vorigen Pakets (Start der Animation) und der
// des aktuellen (Ziel). Der gemeldete Winkel gilt fuer den Zeitpunkt des Pakets, also fuer
// das ENDE der Fahrt — deshalb wird er wie die Position interpoliert, statt sofort zu
// gelten. Beides Messwerte, keine Rechnerei.
let angFrom=null, angTo=null;
let animT=1;                      // Fortschritt der laufenden Animation (0..1)
// Angezeigter Winkel, der dem Ziel weich nachlaeuft. Ersetzt die frueher genutzte
// CSS-Transition: die sah gut aus, schob das Icon aber in eine eigene GPU-Ebene und
// machte es beim Zoomen unscharf. Noetig ist die Glaettung, weil die Tangente INNERHALB
// eines Spursegments konstant ist und beim Punktwechsel springt — zwischen benachbarten
// Punkten liegen im Median 45° Rasterrauschen (an echten Spurdaten gemessen).
let dispAngle=null, lastSyncTs=0;
const ANG_TAU=90;                 // Zeitkonstante der Glaettung in ms
// Zuletzt ANGEZEIGTE Roboter-Position (Weltkoord). Muss ausserhalb des Icons liegen, weil
// buildOverlay die Marker bei jedem Kartenpaket neu erzeugt — am Element gemerkte Werte
// waeren dann weg. Jede Bewegung des Roboters laeuft ueber placeRobot(), damit dieser
// Wert immer stimmt: er ist der Startpunkt jeder neuen Gleitfahrt.
let dispPos=null;
// Umschalter "Flüssig": an = Roboter faehrt die Strecke ab (schoen, hinkt aber bis zu
// einem Paket ~3 s hinterher, weil Spur und Position denselben Zeitstempel haben);
// aus = er springt alle ~3 s auf die gemeldete Position (haesslich, aber naeher an der
// Wirklichkeit). Wahl bleibt ueber Neuladen erhalten.
let smooth = true;
try{ smooth = localStorage.getItem('dreameSmooth') !== '0'; }catch(e){}
function placeRobot(wx,wy,ang){
  if(!robotMk) return;
  dispPos={ x:wx, y:wy };
  if(ang!==null && ang!==undefined) dispAngle=ang;
  moveIcon(robotMk,wx,wy,ICON_SIZE.robot,ang);
}
// Winkel auf dem kurzen Weg interpolieren
function interpAngle(a,b,t){
  if(a===null||a===undefined) return b;
  if(b===null||b===undefined) return a;
  let d=b-a; while(d>180)d-=360; while(d<-180)d+=360;
  return a+d*t;
}

const noLine = p => isBreak(p.operator); // Punkt beginnt einen neuen Teilpfad
function buildCum(pts){
  const c=[0];
  for(let i=1;i<pts.length;i++){
    // Auch Spurbrueche (Umsetzfahrten) zaehlen zur Strecke: der Roboter FAEHRT sie
    // wirklich, das Geraet zeichnet sie nur nicht auf.
    c[i]=c[i-1]+Math.hypot(pts[i].x-pts[i-1].x, pts[i].y-pts[i-1].y);
  }
  return c;
}
const totalDist = () => cum.length ? cum[cum.length-1] : 0;
// Wieviele Punkte haben old und neu am Anfang gemeinsam? (Der l2r-Punkt am Ende wechselt
// je Paket — deshalb kann man nicht einfach die Laenge vergleichen.)
function commonPrefix(a,b){
  const n=Math.min(a.length,b.length); let i=0;
  while(i<n && a[i].x===b[i].x && a[i].y===b[i].y && a[i].operator===b[i].operator) i++;
  return i;
}
// Position + Fahrtrichtung an einer Streckenlaenge.
// onBreak = der Kopf faehrt gerade eine Umsetzfahrt ab (Position ja, Linie nein)
//           -> Position ja, Linie nein.
function posAt(dist){
  if(!trailPts.length) return null;
  if(dist<=0) return { p:trailPts[0], idx:0, angle:null, onBreak:false };
  for(let i=1;i<trailPts.length;i++){
    if(cum[i]>=dist){
      const segLen=cum[i]-cum[i-1];
      const a=trailPts[i-1], b=trailPts[i];
      const onBreak=noLine(b);      // Umsetzfahrt: wird gefahren, aber nicht gemalt
      if(segLen<=0) return { p:b, idx:i, angle:null, onBreak };
      const t=(dist-cum[i-1])/segLen;
      const p={ x:a.x+(b.x-a.x)*t, y:a.y+(b.y-a.y)*t };
      // Fahrtrichtung im BILDSCHIRM messen (wS spiegelt Y) — moveIcon dreht mit -Winkel,
      // deshalb hier das Vorzeichen passend zur bestehenden Header-Drehung.
      const [x1,y1]=wS(a.x,a.y), [x2,y2]=wS(b.x,b.y);
      const ang = -Math.atan2(y2-y1, x2-x1)*180/Math.PI;
      return { p, idx:i, angle:ang, onBreak };
    }
  }
  return { p:trailPts[trailPts.length-1], idx:trailPts.length-1, angle:null, onBreak:false };
}
// Pfad-String fuer Punkte [0..idx]; Spurbrueche beginnen einen neuen Teilpfad.
// gehoert() waehlt aus, welche Abschnitte hineinkommen (Saug- oder Wischspur). Wird ein
// Abschnitt uebersprungen, muss der naechste aufgenommene wieder mit 'M' anfangen —
// sonst zieht die Linie quer ueber die ausgelassene Strecke.
function pathStr(upto, gehoert){
  let d='', started=false;
  for(let i=0;i<=upto && i<trailPts.length;i++){
    if(!gehoert(sektTyp[i])){ started=false; continue; }
    const [sx,sy]=wS(trailPts[i].x,trailPts[i].y);
    if(!started || isBreak(trailPts[i].operator)){ d+='M'+sx.toFixed(1)+' '+sy.toFixed(1)+' '; started=true; }
    else d+='L'+sx.toFixed(1)+' '+sy.toFixed(1)+' ';
  }
  return d;
}

function renderTrail(){ if(!trailEl) return;
  // Sichtbar ist nur die Strecke bis zum Abspielkopf.
  // Zwei Spuren wie HA (map.py 10756-10842): die duenne Saugspur aus den Abschnitten
  // S und W, die breite halbtransparente Wischspur aus M und W.
  const head=posAt(headDist);
  const bau=(start, gehoert)=>{
    let d=start, offen=!!start;
    if(!head) return d;
    for(let i=staticIdx+1; i<trailPts.length && cum[i]<=headDist; i++){
      if(!gehoert(sektTyp[i])){ offen=false; continue; }
      const [sx,sy]=wS(trailPts[i].x,trailPts[i].y);
      d += (!offen || noLine(trailPts[i]) ? 'M' : 'L') + sx.toFixed(1)+' '+sy.toFixed(1)+' ';
      offen=true;
    }
    // Faehrt der Kopf gerade eine Umsetzfahrt ab, endet die Spur beim letzten echten
    // Punkt — der Roboter bewegt sich sichtbar weiter, hinterlaesst aber keine Linie.
    // Der Kopf gehoert zum Abschnitt, in dem er steckt (head.idx).
    if(!head.onBreak && gehoert(sektTyp[head.idx] || 'S')){
      const [hx,hy]=wS(head.p.x, head.p.y);
      d += (offen ? 'L' : 'M') + hx.toFixed(1)+' '+hy.toFixed(1)+' ';
    }
    return d;
  };
  trailEl.setAttribute('d', bau(staticSaug, istSaugSpur).trim());
  if (mopEl) mopEl.setAttribute('d', bau(staticWisch, istWischSpur).trim());
}

/**
 * Neue Spurdaten aus einem Kartenpaket uebernehmen und den Abspielkopf darauf ansetzen.
 * Der Kopf bleibt stehen, wo er ist, und faehrt die neu hinzugekommene Strecke ab.
 */
function feedTrail(pts){
  const old=trailPts;
  const nw=(pts||[]).slice();
  const c=commonPrefix(old,nw);
  const newCum=buildCum(nw);
  // Der Kopf darf NIE zurueckspringen. Wichtig wegen l2r: dessen Punkt haengt als letzter
  // an der Spur und wird in jedem Paket durch einen neuen ersetzt. Wuerde man den Kopf auf
  // den letzten gemeinsamen Punkt zurueckziehen, faehrt der Roboter vor, springt zurueck,
  // faehrt wieder vor — sichtbares Jo-Jo (in der Simulation mit echten Frames: bis 2263 mm
  // Ruecksprung je Paket). Der Kopf bleibt stehen; jenseits des gemeinsamen Teils liegt er
  // dann eben auf der neuen Geometrie, die ohnehin zur selben Roboterposition fuehrt.
  if(c===0 && old.length) headDist=0;               // komplett neue Spur (neuer Auftrag)
  else headDist=Math.min(headDist, newCum.length?newCum[newCum.length-1]:0);
  trailPts=nw; cum=newCum; sektTyp=baueSektTyp(nw);
  // Nicht abfahren, sondern sofort ans Ende springen, wenn die Strecke unplausibel lang
  // ist. Zwei Faelle: (1) erstes Paket nach dem Laden/Neustart — da kommt die KOMPLETTE
  // bisherige Spur, der Roboter wuerde sonst einmal quer durch die Wohnung rasen;
  // (2) Kartenwechsel mitten im Auftrag. Messung an echten Frames: ~530 mm je Paket,
  // Maximum 902 mm — 2500 mm sind also reichlich Luft nach oben.
  const MAX_DRIVE=2500;
  if(!old.length || totalDist()-headDist > MAX_DRIVE) headDist=totalDist();
  // fertigen Teil bis zum Kopf einfrieren, damit pro Bild nur das kurze Endstueck neu entsteht
  staticIdx=0; while(staticIdx+1<trailPts.length && cum[staticIdx+1]<=headDist) staticIdx++;
  staticSaug=pathStr(staticIdx, istSaugSpur);
  staticWisch=pathStr(staticIdx, istWischSpur);
  // Dauer = gemessener Abstand der Kartenpakete (gedeckelt), damit der Kopf genau dann
  // ankommt, wenn das naechste Paket eintrifft.
  const now=performance.now();
  if(lastDataTs){ const gap=now-lastDataTs; if(gap>500 && gap<15000) frameGap = frameGap*0.7 + gap*0.3; }
  lastDataTs=now;
  animFrom=headDist; animTo=totalDist(); animT0=now;
  animDur=Math.max(1000, Math.min(5000, frameGap));
  if(animTo>animFrom && smooth){ animT=0; startAnim(); return; }
  // Nichts abzufahren (z.B. frisch geladen, oder die Spur waechst nicht mehr): nur die
  // Spur zeichnen. Den Marker NICHT anfassen — er gehoert dann der Positionsmeldung
  // (updateRobot). Ein syncRobotToHead() wuerde ihn ans SPURENDE setzen, und das ist bei
  // einer liegengebliebenen Spur mitten im Raum, waehrend der Roboter in der Station steht.
  headDist=animTo; animT=1; renderTrail();
}

function startAnim(){
  if(animReq) cancelAnimationFrame(animReq);
  stopGlide(); // ab jetzt fuehrt der Abspielkopf — die Gleitfahrt darf nicht dagegenhalten
  animReq=requestAnimationFrame(stepAnim);
}
function stepAnim(){
  animReq=null;
  const t=Math.min(1,(performance.now()-animT0)/animDur);
  animT=t;
  headDist=animFrom+(animTo-animFrom)*t;
  renderTrail();
  const turnDone=syncRobotToHead();
  // Weiterlaufen, solange gefahren ODER noch gedreht wird — sonst bliebe die
  // Schlussdrehung auf halbem Weg stehen.
  if(t<1 || !turnDone) animReq=requestAnimationFrame(stepAnim);
}

/**
 * Roboter-Marker an den Abspielkopf setzen (Position + Blickrichtung).
 *
 * Die Blickrichtung kommt aus der Spur-Tangente (52 mm Aufloesung, folgt der gefahrenen
 * Kurve genau). Am Ende der Fahrt (animT>=1) gilt der vom Geraet gemeldete Winkel — das
 * ist die Schlussdrehung auf die tatsaechliche Ausrichtung.
 *
 * Ohne Spur (Rueckfahrt zur Station) laeuft hier nichts: dann setzt updateRobot() den
 * Marker direkt mit dem gemeldeten Winkel.
 */
function syncRobotToHead(){
  if(!robotMk) return true;
  const h=posAt(headDist); if(!h) return true;
  // Ziel-Blickrichtung. Am Ende der Fahrt (animT>=1) gilt der gemeldete Winkel — das ist
  // die Schlussdrehung: waehrend der Fahrt Spur-Tangente, am Endpunkt die tatsaechliche
  // Ausrichtung.
  const target = (h.angle===null || animT>=1) ? interpAngle(angFrom, angTo, animT) : h.angle;
  // Weich nachfuehren statt springen: die Tangente ist innerhalb eines Spursegments
  // konstant und springt beim Punktwechsel (Median 45°, an echten Daten gemessen).
  // Zeitbasiert, damit die Drehung bei jeder Bildrate gleich aussieht.
  const now=performance.now();
  const dt=lastSyncTs ? Math.min(200, now-lastSyncTs) : 16;
  lastSyncTs=now;
  if(dispAngle===null) dispAngle=target;
  else {
    let d=target-dispAngle; while(d>180)d-=360; while(d<-180)d+=360;
    dispAngle += d * (1-Math.exp(-dt/ANG_TAU));
    if(Math.abs(d)<0.3) dispAngle=target;
  }
  placeRobot(h.p.x,h.p.y, dispAngle);
  let rest=target-dispAngle; while(rest>180)rest-=360; while(rest<-180)rest+=360;
  return Math.abs(rest)<0.3; // Drehung fertig?
}
// ===== Fahrt OHNE Spur (z.B. Rueckfahrt zur Station) =====
// Das Geraet schickt dabei nachweislich keine Spur (an Rohdaten geprueft: tr = "" in
// allen 11 Paketen der Rueckfahrt), sondern nur alle ~3 s Position und Winkel. Genau die
// werden hier interpoliert — mehr braucht Fluessigkeit nicht. Die Spur enthaelt ohnehin
// keine Drehrichtung; der Winkel kommt IMMER aus dem Header.
//
// Bewusst voellig getrennt vom Abspielkopf: Diese Fahrt hat mit der Spur nichts zu tun.
// Der fruehere Versuch ("Ghost-Punkte" ins Spur-Array stopfen) ist genau daran
// gescheitert — die Punkte erbten Tangenten-Winkel, Praefix-Vergleich und Zeichenlogik,
// die hier alle nicht hingehoeren. Daraus kamen: Rueckwaerts falsch herum, Vor-und-
// Zurueck-Fahren und der am Spurende klebende Marker.
let glFrom=null, glTo=null, glAngFrom=null, glAngTo=null, glT0=0, glDur=3000, glReq=null;
// Auf welchem Anteil der Fahrt die Drehung erledigt ist. Ein Saugroboter hat zwei
// Antriebsraeder und kann nicht schraeg fahren: er dreht sich ZUERST in die Fahrtrichtung
// und faehrt dann los. Der neue Winkel steht real also schon nach dem ersten Stueck.
// (An echten Daten passte die Fahrtrichtung in 5 von 10 Paketen zum neuen Winkel — also
// "erst drehen, dann fahren" — und in 5 zum alten. Gleichmaessig ueber die ganze Fahrt zu
// verteilen ist deshalb die schlechteste Wahl: nie richtig, immer halb daneben.)
const GL_TURN_FRAC=0.3;
function glCurrent(){
  if(!glFrom || !glTo) return null;
  const t=Math.min(1,(performance.now()-glT0)/glDur);
  return { x:glFrom.x+(glTo.x-glFrom.x)*t, y:glFrom.y+(glTo.y-glFrom.y)*t };
}
/** Neue Positionsmeldung: von dort, wo er gerade steht, weich zur neuen Position gleiten. */
function glide(pos, ang){
  if(!robotMk || !pos) return;
  // Startpunkt ist, wo das Icon GERADE STEHT — nicht die neue Position. (Genau der Fehler
  // zuvor: Start = Ziel -> Abstand 0 -> keine Fahrt, und buildOverlay setzte ihn hart hin.)
  const start = dispPos;
  if(!start){ placeRobot(pos[0], pos[1], ang); return; }         // erstes Mal: einfach setzen
  if(Math.hypot(pos[0]-start.x, pos[1]-start.y) < 5) return;     // steht — nichts zu tun
  glFrom={ x:start.x, y:start.y }; glTo={ x:pos[0], y:pos[1] };
  // Blickrichtung = Fahrtrichtung dieses Abschnitts. Bei Rueckwaertsfahrt entsprechend
  // nach hinten. Ob rueckwaerts, sagt der GEMELDETE Winkel: weicht er um mehr als 90° von
  // der Fahrtrichtung ab, faehrt er rueckwaerts (an echten Daten: beim Einparken meldet
  // das Geraet 274°, waehrend die Fahrtrichtung 93° ist).
  // Da der Abschnitt eine Gerade ist, ist die Fahrtrichtung ueber die ganze Fahrt
  // konstant — er dreht sich also nicht mehr unterwegs, sondern nur zwischen den
  // Abschnitten. Die Frage "wann genau hat er gedreht?" stellt sich damit nicht mehr.
  const travel = Math.atan2(glTo.y-glFrom.y, glTo.x-glFrom.x)*180/Math.PI;
  let back=false;
  if(ang!==null && ang!==undefined){
    let d=ang-travel; while(d>180)d-=360; while(d<-180)d+=360;
    back = Math.abs(d)>90;
  }
  glAngFrom = (dispAngle!==null) ? dispAngle : (back ? travel+180 : travel);
  glAngTo = back ? travel+180 : travel;
  glT0=performance.now();
  glDur=Math.max(1000, Math.min(5000, frameGap)); // gemessener Paketabstand
  if(glReq) cancelAnimationFrame(glReq);
  glReq=requestAnimationFrame(glStep);
}
function glStep(){
  glReq=null;
  if(!robotMk || !glFrom || !glTo) return;
  const t=Math.min(1,(performance.now()-glT0)/glDur);
  const p={ x:glFrom.x+(glTo.x-glFrom.x)*t, y:glFrom.y+(glTo.y-glFrom.y)*t };
  // Drehung frueh: nach GL_TURN_FRAC der Fahrt steht der neue Winkel, den Rest faehrt er
  // damit durch — statt sich ueber die ganze Strecke langsam mitzudrehen.
  placeRobot(p.x, p.y, interpAngle(glAngFrom, glAngTo, Math.min(1, t/GL_TURN_FRAC)));
  if(t<1) glReq=requestAnimationFrame(glStep);
}
function stopGlide(){ if(glReq){ cancelAnimationFrame(glReq); glReq=null; } glFrom=null; glTo=null; }


// ===== Nachtrag (Commit B5): weitere Kartenlogik-Fragmente, die B2 nicht erfasst hatte =====
// Bei der main.js-Integration (Etappe B, Commit B5) stellte sich heraus, dass diese Funktionen
// zwar inhaltlich zur Kartenanzeige gehoeren, in legacy.html aber unter anderen Bereichen
// standen ("Reinigungs-Panel", "Raum-Einstellungen (cleanset)", "Raumnamen", Ende von
// "Konfiguration") — B2 hat sich an WIDGET_ARCHITEKTUR.md Tabelle 7 orientiert, die diese
// Funktionen dort nicht auflistete. Verbatim uebernommen wie der Rest dieser Datei, siehe
// WIDGET_SESSION_STATUS.md fuer die vollstaendige Herleitung.

// Klick-Koordinaten -> Raum-ID (Canvas ist Y-gespiegelt; wrap ist per translate/scale transformiert)
function hitRoom(clientX, clientY){
  const r=stage.getBoundingClientRect();
  // Bildschirmpunkt zurueck in Kartenpixel: erst Verschiebung und Zoom herausrechnen,
  // dann die Drehung ZURUECK (deshalb das Minus) — sonst waehlt man bei gedrehter
  // Karte den Raum aus, der ungedreht an dieser Stelle laege.
  let cxp=(clientX-r.left-tx)/scale, cyp=(clientY-r.top-ty)/scale; // Canvas-Pixel (MAPW×MAPH)
  if (kartenDrehung) [cxp,cyp] = drehePunkt(cxp, cyp, -kartenDrehung);
  const ox=Math.floor(cxp/cell), oy=Math.floor(cyp/cell);
  if (ox<0||oy<0||ox>=W||oy>=He) return null;
  const t=raw[mapStart + (He-1-oy)*W + ox];
  if (isRoom(t) && !hidden.has(t) && !haHidden.has(t) && knownRoom(t)) return t;
  return null;
}


// Füllfarbe eines Raums je nach Auswahlzustand (Etappe C6-4, WIDGET_UMBAU_PLAN.md
// Abschnitt 6.4, "Alles reinigen"-Standardverhalten): nur noch ZWEI Zustaende statt
// vormals drei. Ohne Auswahl gilt "alle Raeume aktiv" (Start reinigt alle) -- das sieht
// jetzt genauso aus wie ein einzeln angetippter Raum (volle Faerbung), nicht mehr wie ein
// dritter, blasserer "normal"-Zustand. Nur ein Raum, der WAEHREND einer bestehenden
// Teil-Auswahl NICHT mitgewaehlt ist, wird ausgegraut.
function roomFill(id){
  const g = segGrp(id);
  if (selectedRooms.size===0 || selectedRooms.has(id)) return g[1]; // aktiv/gewaehlt: volle Faerbung
  return mix(g[0],WHITE,0.5);                                       // nicht gewaehlt: ausgegraut
}
// Label-Farbe/Stärke – bleibt immer gut lesbar (dunkle Schrift + weißer Schatten via CSS)
function labelStyle(id){
  const dark = mix(segGrp(id)[1],BLACK,0.5); // dunkle Raumfarbe = gut lesbar
  // Schriftgewicht IMMER gleich (800) — nur Farbe/Deckkraft zeigen die Auswahl an.
  // (Vorher wechselte es auf 700, wenn ein anderer Raum markiert war -> stoerendes Zappeln.)
  // Gleiches Zwei-Zustaende-Prinzip wie roomFill() (s.o.): keine Auswahl zaehlt wie gewaehlt.
  if (selectedRooms.size===0 || selectedRooms.has(id)) return { fill:rgbCss(mix(segGrp(id)[1],BLACK,0.6)), weight:'800', opacity:'1' };
  return { fill:rgbCss(dark), weight:'800', opacity:'0.65' };
}
function updateLabels(){
  for (const id of Object.keys(labelEls)){ const s=labelStyle(+id), el=labelEls[id];
    el.setAttribute('fill', s.fill); el.style.fontWeight=s.weight; el.style.opacity=s.opacity; }
  for (const id in rowEls){ rowEls[id].classList.toggle('sel', selectedRooms.has(+id)); }
}
