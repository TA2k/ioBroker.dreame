/**
 * What the settings offer to hide: each panel's title and the rows or buttons inside it.
 *
 * The ids are the widget's, since they are stored in the same `config.widget` - a row hidden
 * there must be the same row here. Shortcuts are not listed: they differ per robot, and are
 * hidden where they are, with the eye on each while the settings are open.
 */

import { WEAR_PARTS, DUST_BAG_STATE } from "../panels/maintenance";
import { STATISTICS } from "../panels/statistics";
import type { PanelId } from "./widgetConfig";

export interface PanelField {
	id: string;
	labelKey: string;
}

export const PANEL_TITLE_KEY: Readonly<Record<PanelId, string>> = {
	kopf: "tab.settings.kopf",
	fehler: "tab.settings.fehler",
	reinigung: "panel.reinigung.titel",
	sequence: "tab.sequence.titel",
	shortcuts: "panel.shortcuts.titel",
	termine: "termine.titel",
	station: "panel.station.titel",
	wartung: "panel.wartung.titel",
	frischwasser: "panel.frischwasser.titel",
	statistik: "panel.statistik.titel",
};

export const PANEL_FIELDS: Readonly<Partial<Record<PanelId, readonly PanelField[]>>> = {
	reinigung: [
		{ id: "modus", labelKey: "panel.reinigung.modus.label" },
		{ id: "route", labelKey: "panel.reinigung.route.label" },
		{ id: "saug", labelKey: "panel.reinigung.saug.label" },
		{ id: "wasser", labelKey: "panel.reinigung.wasser.label" },
	],
	station: [
		{ id: "empty", labelKey: "panel.station.entleeren.label" },
		{ id: "wash", labelKey: "panel.station.waschen.label" },
		{ id: "dry", labelKey: "panel.station.trocknen.label" },
	],
	wartung: [
		...WEAR_PARTS.map(part => ({ id: part.state, labelKey: part.nameKey })),
		{ id: DUST_BAG_STATE, labelKey: "panel.wartung.saugbeutel.label" },
	],
	frischwasser: [
		{ id: "fuellstand", labelKey: "panel.frischwasser.fuellstand.label" },
		{ id: "wasch-zyklen", labelKey: "panel.frischwasser.wasch-zyklen.label" },
		{ id: "tank-status", labelKey: "panel.frischwasser.tank-status.label" },
		{ id: "mopp-montiert", labelKey: "panel.frischwasser.mopp-montiert.label" },
		{ id: "feuchtigkeit", labelKey: "panel.frischwasser.feuchtigkeit.label" },
		{ id: "reinigungsmittel", labelKey: "panel.frischwasser.reinigungsmittel.label" },
		{ id: "temperatur", labelKey: "panel.frischwasser.temperatur.label" },
	],
	statistik: STATISTICS.map(statistic => ({ id: statistic.state, labelKey: statistic.nameKey })),
};
