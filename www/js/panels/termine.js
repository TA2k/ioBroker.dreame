/*
 * Termine-Panel (F5, WIDGET_FEATURE_PLAN.md): echtes Panel wie ShortcutsPanel -- Knopf ueber
 * die volle Panel-Breite ("Termine"), oeffnet ein Modal (#termineOvl, siehe index.html) mit
 * allen App-seitig angelegten Terminen (dreame.0.<did>.schedule.<id>.*, siehe main.js
 * parseSchedule()). Urspruenglich (erster F5-Commit) ein eigenstaendiger Zahnrad-Abschnitt --
 * nach Live-Test-Feedback (WIDGET_SESSION_STATUS.md) auf ein normales Panel umgestellt: der
 * Knopf soll im Hauptbereich unter den Kurzbefehlen stehen und ueber dieselbe
 * Panels-Sichtbarkeit-Liste im Zahnrad aus-/einblendbar sein wie jedes andere Panel (dafuer
 * reicht die PanelRegistry-Registrierung in main.js + ein PANEL_LABEL-Eintrag, config.js
 * baut den Default dynamisch aus PanelRegistry.alle).
 *
 * Erscheint nur, wenn fuer das aktive Geraet mindestens ein Termin existiert (analog zu
 * shortcuts.js bei Shortcuts).
 *
 * type/mode/suction/route/roomName kommen adapterseitig BEREITS uebersetzt an (main.js
 * parseSchedule()/_translateScheduleEnum()) -- ABER .type ist dadurch nur noch ein
 * Anzeigetext (z.B. "Räume"), keine stabile Slug mehr, mit der sich verzweigen liesse
 * (Live-Test-Fund: Detailzeilen blieben deshalb IMMER leer, ein Vergleich wie
 * `type === 'rooms'` griff nie, weil main.js NUR den uebersetzten String in den State
 * schreibt). Verzweigung stattdessen ueber die tatsaechlich vorhandenen Felder: main.js legt
 * .rooms/.parameters/.shortcutId je nach Termin-Typ NUR fuer den jeweils passenden Termin an
 * (parseSchedule() if/else if) -- genau eines davon existiert pro Termin, das Vorhandensein
 * ist deshalb ein zuverlaessiger Typ-Indikator, ganz ohne .type-Textvergleich (siehe
 * _terminTyp() unten).
 *
 * Bekannte Einschraenkung (nicht Teil dieser Etappe): weekdays kommt adapterseitig immer
 * Deutsch (lib/schedule.js resolveWeekdays(), keine I18n.translate()-Anbindung).
 *
 * roomName und der Shortcut-Name sind freier Nutzertext aus der Dreame-App -- HTML-escaped
 * wie bei shortcuts.js (escapeHtml() von dort wiederverwendet, kein zweites Mal definiert --
 * shortcuts.js laedt vor dieser Datei, siehe Skript-Reihenfolge in index.html).
 */

/* global Panel, Daten, t, uiIcon, escapeHtml */

class TerminePanel extends Panel {
  // Termine sind ein Schedule-Feature (MIoT), bislang keine Hinweise auf ein
  // Mäher-Aequivalent -- analog zur bestehenden Einschraenkung bei shortcuts.js.
  static passtZuTyp = ['vacuum'];

  constructor(id, container, config) {
    super(id, container, config);
    this._termine = {}; // scheduleId -> {time, weekdays, type, enabled, rooms, parameters, shortcutId, orphan}
    this._shortcutNamen = {}; // shortcutId (string) -> name
    this._modalOffen = false;
    this._statischeTexteGesetzt = false;
    // Instanzgebundene Handler EINMAL erzeugen (nicht bei jedem oeffnen()/render()) --
    // addEventListener braucht dieselbe Funktionsreferenz zum sauberen Entfernen, siehe
    // dispose()/_schliessen() unten.
    this._escapeHandler = e => { if (e.key === 'Escape') this._schliessen(); };
    this._backdropHandler = e => { if (e.target.id === 'termineOvl') this._schliessen(); };

    const knopf = document.getElementById('termineBtn');
    if (knopf) knopf.onclick = () => this._oeffnen();
    const schliessenBtn = document.getElementById('termineSchliessen');
    if (schliessenBtn) schliessenBtn.onclick = () => this._schliessen();
    const ovl = document.getElementById('termineOvl');
    if (ovl) ovl.addEventListener('click', this._backdropHandler);
  }

  benoetigteMuster(did) {
    return [`dreame.0.${did}.schedule.*`, `dreame.0.${did}.shortcuts.*`];
  }

  /** Basisklasse abonniert benoetigteMuster() bereits automatisch, liefert dafuer aber
   * KEINEN Anfangswert (nur fuer benoetigteStates(), siehe panel.js-Kommentarkopf) --
   * deshalb hier zusaetzlich einmalig der aktuelle Stand nachgeladen, analog zu
   * shortcuts.js' init(). */
  async init(did) {
    await super.init(did);
    const [scheduleWerte, shortcutWerte] = await Promise.all([
      Daten.getStates(`dreame.0.${did}.schedule.*`),
      Daten.getStates(`dreame.0.${did}.shortcuts.*`),
    ]);
    for (const [stateId, st] of Object.entries(scheduleWerte || {})) this._scheduleUebernehmen(stateId, st && st.val);
    for (const [stateId, st] of Object.entries(shortcutWerte || {})) this._shortcutUebernehmen(stateId, st && st.val);
    this.render();
  }

  neueDatenMuster(stateId, wert) {
    if (stateId.includes('.shortcuts.')) this._shortcutUebernehmen(stateId, wert);
    else this._scheduleUebernehmen(stateId, wert);
    this.render();
  }

  _scheduleUebernehmen(stateId, wert) {
    const teile = stateId.split('.');
    const feld = teile[teile.length - 1];
    if (feld === '_backup') return; // eigener Pfad direkt unter .schedule, kein Termin-Feld
    const id = teile[teile.length - 2];
    if (!this._termine[id]) this._termine[id] = {};
    if (feld === 'rooms' || feld === 'parameters') {
      try { this._termine[id][feld] = JSON.parse(wert); } catch (e) { this._termine[id][feld] = null; }
    } else if (feld === 'enabled' || feld === 'orphan') {
      this._termine[id][feld] = !!wert;
    } else if (feld === 'shortcutId') {
      this._termine[id][feld] = wert == null ? null : Number(wert);
    } else if (feld === 'time' || feld === 'weekdays' || feld === 'type') {
      this._termine[id][feld] = wert;
    }
    // 'raw' bewusst nicht uebernommen -- reines Adapter-Debugfeld, im Modal nicht gebraucht.
  }

  _shortcutUebernehmen(stateId, wert) {
    const teile = stateId.split('.');
    if (teile[teile.length - 1] !== 'name') return;
    this._shortcutNamen[teile[teile.length - 2]] = wert;
  }

  _renderStatischeTexte() {
    if (this._statischeTexteGesetzt) return;
    this._statischeTexteGesetzt = true;
    const knopf = document.getElementById('termineBtn');
    if (knopf) knopf.innerHTML = `${uiIcon('wiederholung', 18)}<span>${t('termine.knopf')}</span>`;
    const titel = document.getElementById('termineTitel');
    if (titel) titel.textContent = t('termine.titel');
    const schliessenBtn = document.getElementById('termineSchliessen');
    if (schliessenBtn) schliessenBtn.setAttribute('aria-label', t('termine.schliessen'));
  }

  _sortierteEintraege() {
    return Object.entries(this._termine)
      .filter(([, termin]) => termin.time != null)
      .sort((a, b) => (a[1].time || '').localeCompare(b[1].time || ''));
  }

  /** Typ-Indikator ohne .type-Textvergleich, siehe Datei-Kommentarkopf. */
  _terminTyp(termin) {
    if (Array.isArray(termin.rooms)) return 'rooms';
    if (termin.parameters) return 'all_rooms';
    if (termin.shortcutId != null) return 'shortcut';
    return null;
  }

  /** Eine Zeile "Modus, Saugstaerke, Nx, Feuchtigkeit: Lvl[, Route: ...]" -- gemeinsames
   * Format fuer Raum-Zeilen (rooms) und die einzelne Parameter-Zeile (all_rooms). mode/
   * suction/route sind bereits adapterseitig uebersetzte Strings, kein escapeHtml() an
   * dieser Stelle noetig (fester Key-Katalog, kein freier Nutzertext) -- der Aufrufer
   * escaped das Gesamtergebnis trotzdem mit, s.u.
   * moisture ist eine Stufe 1-32 (remote.wetness-level, SIID 28-1), kein Prozentwert --
   * David-Live-Test-Fund: `${moisture}%` suggerierte faelschlich einen Prozentsatz, siehe
   * reinigung.js/frischwasser.js, die denselben State ebenfalls als bloße Stufenzahl ohne
   * Einheit anzeigen. */
  _formatEinstellungen({ mode, suction, cycles, route, moisture }) {
    const teile = [
      mode, suction,
      cycles != null ? `${cycles}×` : null,
      moisture != null ? `${t('termine.feuchtigkeit-praefix')} ${moisture}` : null,
      route ? `${t('termine.route-praefix')} ${route}` : null,
    ];
    return teile.filter(Boolean).join(', ');
  }

  _detailsHtml(termin) {
    const typ = this._terminTyp(termin);
    if (typ === 'rooms') {
      return termin.rooms.map(raum => `<div class="traum">`
        + `<span class="traum-name">${escapeHtml(raum.roomName || '?')}</span>`
        + ` <span class="traum-werte">${escapeHtml(this._formatEinstellungen(raum))}</span></div>`).join('');
    }
    if (typ === 'all_rooms') {
      return `<div class="traum-werte">${escapeHtml(this._formatEinstellungen(termin.parameters))}</div>`;
    }
    if (typ === 'shortcut') {
      const name = this._shortcutNamen[String(termin.shortcutId)];
      return `<div class="traum-werte">${name != null ? escapeHtml(name) : `#${termin.shortcutId}`}</div>`;
    }
    return '';
  }

  render() {
    if (!this.container) return;
    this._renderStatischeTexte();
    const eintraege = this._sortierteEintraege();
    this.container.hidden = eintraege.length === 0;
    if (this._modalOffen) this._renderModal(eintraege);
  }

  _renderModal(eintraege) {
    const liste = document.getElementById('termineListe');
    if (!liste) return;

    if (!eintraege.length) {
      liste.innerHTML = `<div class="zovl-inhalt">${t('termine.leer')}</div>`;
      return;
    }

    liste.innerHTML = eintraege.map(([id, termin]) => {
      const gesperrt = this._terminTyp(termin) === 'shortcut' && termin.orphan;
      const hinweis = gesperrt ? `<div class="tverwaist">${t('termine.verwaist')}</div>` : '';
      return `<div class="tcard">`
        + `<div class="tcard-kopf">`
        + `<span class="tzeit">${escapeHtml(termin.time || '')}</span>`
        + `<span class="ttage">${escapeHtml(termin.weekdays || '')}</span>`
        + `<span class="tart">${escapeHtml(termin.type || '')}</span>`
        + `<label class="zovl-switch-wrap tenable">`
        + `<input type="checkbox" class="zovl-switch" data-termin="${id}"`
        + `${termin.enabled ? ' checked' : ''}${gesperrt ? ' disabled' : ''}>`
        + `</label></div>`
        + `<div class="tdetails">${this._detailsHtml(termin)}</div>`
        + hinweis
        + `</div>`;
    }).join('');

    for (const el of liste.querySelectorAll('input[data-termin]')) {
      const scheduleId = el.dataset.termin;
      el.onchange = () => Daten.setState(`dreame.0.${this.did}.schedule.${scheduleId}.enabled`, el.checked);
    }
  }

  _oeffnen() {
    this._modalOffen = true;
    document.getElementById('termineOvl').classList.add('open');
    document.addEventListener('keydown', this._escapeHandler);
    this._renderModal(this._sortierteEintraege());
  }

  _schliessen() {
    this._modalOffen = false;
    document.getElementById('termineOvl').classList.remove('open');
    document.removeEventListener('keydown', this._escapeHandler);
  }

  dispose() {
    super.dispose();
    if (this._modalOffen) this._schliessen();
    const ovl = document.getElementById('termineOvl');
    if (ovl) ovl.removeEventListener('click', this._backdropHandler);
  }
}
