/**
 * Words for the widget's own settings, registered by vis-2 under the `dreame_` prefix.
 *
 * vis-2 prefixes every key that does not already start with the prefix (`I18n.extendTranslations`
 * in gui-components), which keeps one widget set's words from colliding with another's. The shared
 * views' words are a separate thing: those are registered unprefixed by the widget itself, because
 * the same components look them up unprefixed in the admin tab.
 *
 * English stands in for the nine languages without a reviewed translation yet.
 */

import en from "./i18n/en.json";
import de from "./i18n/de.json";
import ru from "./i18n/ru.json";
import pt from "./i18n/pt.json";
import nl from "./i18n/nl.json";
import fr from "./i18n/fr.json";
import it from "./i18n/it.json";
import es from "./i18n/es.json";
import pl from "./i18n/pl.json";
import uk from "./i18n/uk.json";
import zhCn from "./i18n/zh-cn.json";

const translations = { en, de, ru, pt, nl, fr, it, es, pl, uk, "zh-cn": zhCn, prefix: "dreame_" };

export default translations;
