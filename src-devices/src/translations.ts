/**
 * Words for the tile's settings dialog.
 *
 * Kept apart from the shared view translations (`../src-tab/src/i18n`), which the tile registers
 * itself: these belong to this widget set alone, and the devices app loads them through the
 * exposed `./translations` module.
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

const translations = { en, de, ru, pt, nl, fr, it, es, pl, uk, "zh-cn": zhCn };

export default translations;
