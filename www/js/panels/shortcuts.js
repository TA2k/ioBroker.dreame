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

  /** Spaltenbreite fuer #shortcutsListe (CSS Grid, siehe layout.css) setzen -- David-Vorgabe
   * nach mehreren Live-Test-Runden: alle Kacheln gleich gross (bemessen am laengsten
   * Namen), UND wenn in einer Zeile nur 2 oder 3 hinpassen, sollen die sich die volle
   * Zeilenbreite teilen -- ABER eine einzelne uebrig gebliebene Kachel in einer nicht
   * vollen letzten Zeile darf NICHT die ganze Zeile fuer sich allein bekommen, sondern
   * bleibt genauso gross wie die Kacheln in den vollen Zeilen.
   * Mit Flexbox (fruehere Zwischenstaende) ist das NICHT zuverlaessig loesbar: flex-grow
   * verteilt Restplatz pro Zeile unabhaengig, eine Solo-Kachel in der letzten Zeile
   * bekommt dadurch immer 100% davon. CSS Grid (repeat(auto-fill, minmax(--kb-min,1fr)))
   * loest das strukturell: alle Zeilen teilen sich dieselben Spalten, eine Solo-Kachel
   * bekommt nur EINE Spaltenbreite, der Rest der Zeile bleibt leer statt gestreckt.
   * Deshalb wird hier nur noch --kb-min auf dem Container gesetzt (Mindestbreite jeder
   * Spalte), keine Breite mehr pro Kachel einzeln.
   * Messung: waehrend der Messung bekommt jede sichtbare Kachel justify-self:start --
   * das verhindert das Ausfuellen ihrer (aktuellen, moeglicherweise noch von einer
   * frueheren Messung stammenden) Grid-Spalte, sodass getBoundingClientRect() die
   * natuerliche (Text-bestimmte) Breite liefert statt einer bereits gestreckten. Danach
   * wird der Override entfernt (faellt zurueck auf den Grid-Default stretch) -- erst DANN
   * darf die Kachel ihre (jetzt korrekt bemessene) Spalte ausfuellen.
   * Nur SICHTBARE Kacheln fliessen in die max()-Berechnung ein (versteckte sind per CSS
   * display:none, solange das Zahnrad zu ist -- ihre Breite waere sonst immer 0).
   * +16px fester Aufschlag (Live-Test-Fix): reine min-content-Messung liefert die Breite,
   * bei der die Schrift gerade noch so hineinpasst, ohne sichtbaren Abstand zum Rahmen.
   * Bekannte Grenze: misst nur bei render() (State-Aenderung), nicht bei reiner
   * Fenstergroessen-/Zoom-Aenderung (kein ResizeObserver) -- z.B. die Menue-Breite live im
   * offenen Zahnrad zu verstellen (F1) macht die gemessene Breite erst beim naechsten
   * render() wieder passend. Nicht Teil dieser Korrektur, nur dokumentiert. */
  _vereinheitlicheKachelBreite(liste) {
    const KACHEL_LUFT_PX = 16;
    const kacheln = Array.from(liste.querySelectorAll('.kbkachel'));
    if (!kacheln.length) return;
    const sichtbare = kacheln.filter(el => !el.classList.contains('kb-versteckt'));
    const zielListe = sichtbare.length ? sichtbare : kacheln; // Randfall: alles versteckt
    for (const el of zielListe) el.style.justifySelf = 'start';
    const maxBreite = Math.max(...zielListe.map(el => el.getBoundingClientRect().width)) + KACHEL_LUFT_PX;
    for (const el of zielListe) el.style.justifySelf = '';
    liste.style.setProperty('--kb-min', `${maxBreite}px`);
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
