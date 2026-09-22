/**
 * The translations every view of this project draws its text from.
 *
 * The same 11 files the widget in `www/` uses, so all four places a robot is shown - that widget,
 * the admin tab, a devices tile and a vis-2 widget - say the same thing in the same words.
 *
 * ## Registered without a prefix, on purpose
 *
 * vis-2 registers a widget set's own translations under a prefix (`dreame_...`), which keeps one
 * set's words from colliding with another's. The components here are shared with the admin tab,
 * where there is no prefix, and they look their keys up as `panel.reinigung.titel`, not
 * `dreame_panel.reinigung.titel`. So these are added to the shared `I18n` directly, and the prefix
 * is kept for the handful of words that belong to a widget set's own settings.
 */

import { I18n } from "@iobroker/gui-components";

import en from "@i18n/en.json";
import de from "@i18n/de.json";
import es from "@i18n/es.json";
import fr from "@i18n/fr.json";
import it from "@i18n/it.json";
import nl from "@i18n/nl.json";
import pl from "@i18n/pl.json";
import pt from "@i18n/pt.json";
import ru from "@i18n/ru.json";
import uk from "@i18n/uk.json";
import zhCn from "@i18n/zh-cn.json";

export const DREAME_TRANSLATIONS = { en, de, es, fr, it, nl, pl, pt, ru, uk, "zh-cn": zhCn };

let registered = false;

/**
 * Adds the translations to the host's `I18n`, once.
 *
 * Called when a widget module is first evaluated. This reaches the dictionary the host itself
 * renders from in both widget hosts, though for different reasons: the devices app hands out its
 * own `I18n`, and vis-2, which does not share gui-components, still keeps the words of every copy
 * of `I18n` in one place, `window.i18nTranslations`.
 */
export function registerDreameTranslations(): void {
	if (registered) return;
	registered = true;
	I18n.extendTranslations(DREAME_TRANSLATIONS);
}
