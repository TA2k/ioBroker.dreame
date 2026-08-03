/*
 * Kurzbefehle-Panel (F4, WIDGET_FEATURE_PLAN.md): Kachel-Liste der App-seitig angelegten
 * Shortcuts (dreame.0.<did>.shortcuts.<id>.{name,running,start}, siehe main.js
 * parseShortcuts()). Klick auf eine Kachel triggert den Shortcut, Panel erscheint nur, wenn
 * mindestens einer existiert.
 *
 * Anders als Reinigung (F3, feste Vier-Kacheln-Liste zur Ladezeit bekannt) ist die Anzahl/
 * Benennung der Shortcuts pro Geraet erst zur Laufzeit bekannt und kann sich waehrend der
 * Panel-Lebenszeit aendern (App-seitig hinzugefuegt/umbenannt/geloescht) -- der generische
 * Zahnrad-Sub-Toggle-Mechanismus aus F3 (Panel.versteckbareFelder, zur Ladezeit fest) passt
 * dafuer nicht. Sichtbarkeit pro Shortcut wird deshalb direkt an der Kachel bedient (Auge-
 * Icon, David-Entscheidung nach Rueckfrage) statt im Zahnrad-Overlay -- schreibt trotzdem in
 * dasselbe config.widget.panels.shortcuts.versteckt-Array wie F3s Mechanismus, nur ueber die
 * main.js-Bruecke schreibePanelFeldVersteckt() statt den Zahnrad-eigenen Handler (siehe dort).
 * "Versteckt" bedeutet hier bewusst NICHT aus dem DOM entfernt (anders als bei Reinigung) --
 * ohne eine zweite, immer-vollstaendige Liste (wie die Zahnrad-Sub-Toggles das fuer Reinigung
 * bieten) gaebe es sonst keinen Weg, einen einmal versteckten Shortcut wiederzufinden. Die
 * Kachel bleibt sichtbar, aber ausgegraut + Start-Button deaktiviert.
 */

/* global Panel, Trigger, Daten, t, schreibePanelFeldVersteckt, uiIcon */

/** Sehr simples HTML-Escaping fuer den Shortcut-Namen -- anders als alle bisherigen
 * Panel-Texte (feste i18n-Strings, Zahlen, adapter-generierte Raumnamen aus
 * lib/cleanset.js) ist der Shortcut-Name echter freier Nutzertext aus der Dreame-App
 * (base64-dekodiert, main.js parseShortcuts()) -- ohne Escaping waere ein Shortcut-Name wie
 * `<script>` o.ae. eine echte HTML-Injection-Luecke beim Aufbau von liste.innerHTML unten. */
function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

class ShortcutsPanel extends Panel {
  // Shortcuts sind ein Segment-Clean-Feature (MIoT), bislang keine Hinweise auf ein
  // Mäher-Aequivalent -- analog zur bestehenden Einschraenkung bei frischwasser.js.
  static passtZuTyp = ['vacuum'];

  constructor(id, container, config) {
    super(id, container, config);
    this._items = {}; // shortcutId (string) -> { name, running }
    this._statischeTexteGesetzt = false;
  }

  benoetigteMuster(did) {
    return [`dreame.0.${did}.shortcuts.*`];
  }

  /** Basisklasse abonniert benoetigteMuster() bereits automatisch, liefert dafuer aber
   * KEINEN Anfangswert (nur fuer benoetigteStates(), siehe panel.js-Kommentarkopf) --
   * Muster-Abo allein zeigt also nichts, bis sich zufaellig etwas aendert. Deshalb hier
   * zusaetzlich einmalig der aktuelle Stand nachgeladen, analog zu reinigung.js'
   * _aktualisiereRaumMuster(). */
  async init(did) {
    await super.init(did); // abonniert das Muster, rendert einmal (noch ohne Daten)
    const werte = await Daten.getStates(`dreame.0.${did}.shortcuts.*`);
    for (const [stateId, st] of Object.entries(werte || {})) this._uebernehmen(stateId, st && st.val);
    this.render();
  }

  neueDatenMuster(stateId, wert) {
    this._uebernehmen(stateId, wert);
    this.render();
  }

  _uebernehmen(stateId, wert) {
    const teile = stateId.split('.');
    const feld = teile[teile.length - 1]; // 'name' | 'running' | 'start' (start ignoriert, reiner Trigger)
    if (feld !== 'name' && feld !== 'running') return;
    const scId = teile[teile.length - 2];
    if (!this._items[scId]) this._items[scId] = { name: null, running: null };
    this._items[scId][feld] = wert;
  }

  _renderStatischeTexte() {
    if (this._statischeTexteGesetzt) return;
    this._statischeTexteGesetzt = true;
    const titel = document.getElementById('shortcutsTitel');
    if (titel) titel.textContent = t('panel.shortcuts.titel');
  }

  render() {
    if (!this.container) return;
    this._renderStatischeTexte();
    const liste = document.getElementById('shortcutsListe');
    const titel = document.getElementById('shortcutsTitel');
    if (!liste || !titel) return;

    const eintraege = Object.entries(this._items)
      .filter(([, item]) => item.name != null)
      .sort((a, b) => a[1].name.localeCompare(b[1].name));

    this.container.hidden = eintraege.length === 0;
    titel.hidden = eintraege.length === 0;

    liste.innerHTML = eintraege.map(([scId, item]) => {
      const versteckt = this.feldVersteckt(scId);
      const laeuft = !!item.running;
      const name = escapeHtml(item.name);
      const augeTitel = versteckt ? t('panel.shortcuts.einblenden') : t('panel.shortcuts.ausblenden');
      return `<div class="kbkachel${versteckt ? ' kb-versteckt' : ''}">`
        + `<button type="button" class="saktion" data-start="${scId}"${(laeuft || versteckt) ? ' disabled' : ''}`
        + ` title="${name}" aria-label="${name}${laeuft ? ' – ' + t('panel.shortcuts.laeuft') : ''}">`
        + `${uiIcon(laeuft ? 'anAn' : 'start', 18)}<span>${name}</span></button>`
        + `<button type="button" class="kbauge" data-toggle="${scId}"`
        + ` title="${augeTitel}" aria-label="${augeTitel}">👁</button>`
        + `</div>`;
    }).join('');

    this._vereinheitlicheKachelBreite(liste);

    for (const btn of liste.querySelectorAll('button[data-start]')) {
      const scId = btn.dataset.start;
      btn.onclick = () => Trigger.startShortcut(this.did, scId);
    }
    for (const btn of liste.querySelectorAll('button[data-toggle]')) {
      const scId = btn.dataset.toggle;
      btn.onclick = () => this._toggleVersteckt(scId);
    }
  }

  /** Alle Kacheln auf dieselbe Breite bringen -- David-Vorgabe nach Live-Test: einheitliche
   * Groesse fuer alle Shortcuts, bemessen am laengsten Namen (nicht individuell pro Kachel,
   * wie ein reiner CSS min-content/white-space:nowrap-Ansatz es liefern wuerde). CSS allein
   * kann "alle Elemente in einem Wrap-Flex-Layout gleich breit wie das breiteste" nicht
   * zuverlaessig ohne Grid-Spalten-Vorwissen abbilden -- deshalb hier gemessen: erst jede
   * Kachel ihre natuerliche (Text-bestimmte) Breite einnehmen lassen (inline width
   * zuruecksetzen, sonst wuerde ein inzwischen kuerzerer laengster Name die alte, zu grosse
   * Breite fuer immer einfrieren), dann die groesste gemessene Breite auf alle anwenden.
   * Bekannte Grenze: misst nur bei render() (State-Aenderung), nicht bei reiner
   * Fenstergroessen-/Zoom-Aenderung (kein ResizeObserver) -- z.B. die Menue-Breite live im
   * offenen Zahnrad zu verstellen (F1) macht die gemessene Breite erst beim naechsten
   * render() wieder passend. Nicht Teil dieser Korrektur, nur dokumentiert.
   * WICHTIG: versteckte Kacheln (.kb-versteckt) sind per CSS display:none, solange das
   * Zahnrad zu ist (siehe layout.css) -- ihre Breite waere in diesem Zustand immer 0.
   * Deshalb fliessen nur SICHTBARE Kacheln in die max()-Berechnung ein, aber die
   * resultierende Breite wird trotzdem auf ALLE (auch versteckte) angewendet -- sonst
   * stuende eine im Zahnrad wieder aufgetauchte versteckte Kachel mit 0px Breite da,
   * praktisch unsichtbar trotz display:block.
   * KACHEL_LUFT_PX (Live-Test-Fix 2026-08-03): die reine min-content-Messung liefert die
   * Breite, bei der die Schrift gerade noch so hineinpasst -- optisch klebt der Text dann
   * am Rahmen. Kleiner fester Aufschlag auf die gemessene Breite fuer sichtbaren Abstand.
   * WICHTIG (Live-Test-Fix 2026-08-03, Nachtrag): .kbkachel hat seit der Zeilen-Fuellen-
   * Korrektur flex-grow:1 (layout.css). Wuerde man beim Zuruecksetzen einfach nur width=''
   * setzen, waechst die Kachel SOFORT auf ihren Anteil an der verfuegbaren Zeilenbreite --
   * getBoundingClientRect() misst dann nicht mehr die natuerliche Text-Mindestbreite,
   * sondern die bereits durch flex-grow aufgeblaehte Breite (deshalb landeten zuvor alle
   * Kacheln bei "volle Breite"). flex-grow waehrend der Messung per Inline-Style auf 0
   * setzen, NACH der Messung wieder entfernen (leerer String faellt zurueck auf die
   * CSS-Klassenregel flex-grow:1) -- erst DANN darf die Kachel wachsen, mit der jetzt
   * korrekt gemessenen Breite als Mindestmass (flex-basis via width). */
  _vereinheitlicheKachelBreite(liste) {
    const KACHEL_LUFT_PX = 16;
    const kacheln = Array.from(liste.querySelectorAll('.kbkachel'));
    if (!kacheln.length) return;
    const sichtbare = kacheln.filter(el => !el.classList.contains('kb-versteckt'));
    const zielListe = sichtbare.length ? sichtbare : kacheln; // Randfall: alles versteckt
    for (const el of zielListe) { el.style.flexGrow = '0'; el.style.width = ''; }
    const maxBreite = Math.max(...zielListe.map(el => el.getBoundingClientRect().width)) + KACHEL_LUFT_PX;
    for (const el of kacheln) { el.style.width = `${maxBreite}px`; el.style.flexGrow = ''; }
  }

  /** Persistiert ueber die main.js-Bruecke (siehe Datei-Kommentarkopf), rendert danach
   * sofort neu -- schreibePanelFeldVersteckt() mutiert this.config synchron (vor dem
   * ersten await), der Re-Render hier sieht den neuen Wert deshalb bereits, ohne auf
   * Config.speichern() zu warten (gleiches Prinzip wie main.js' schreibeLayout()). */
  _toggleVersteckt(scId) {
    schreibePanelFeldVersteckt(this.id, scId, !this.feldVersteckt(scId));
    this.render();
  }
}
