/**
 * The words the element shows, in the languages of ioBroker.
 *
 * Two sources:
 * - the words of the native views - status texts, room types, button labels - picked out of `src-tab/i18n` by the
 *   build (`__DREAME_WORDS__`, see `vite.config.ts`), so the element says what the admin tab, the devices tile and
 *   the vis-2 widget say, in the same words;
 * - the few words only this element needs, below.
 */

/** Words of the native views, by language; only the keys `vite.config.ts` picks */
declare const __DREAME_WORDS__: Record<string, Record<string, string>>;

/** Once: the build puts the dictionary wherever the name is written */
const VIEW_WORDS = __DREAME_WORDS__;

const EN = {
	noRobot: "No Dreame robot found - choose one in the settings",
	notRobot: "Not a Dreame robot: choose the device dreame.<n>.<id>",
	details: "Show everything",
	pause: "Pause",
};

export type OwnWordKey = keyof typeof EN;

const OWN: Record<string, Record<OwnWordKey, string>> = {
	en: EN,
	de: {
		noRobot: "Kein Dreame-Roboter gefunden - einen in den Einstellungen wählen",
		notRobot: "Kein Dreame-Roboter: das Gerät dreame.<n>.<id> wählen",
		details: "Alles anzeigen",
		pause: "Pause",
	},
	ru: {
		noRobot: "Робот Dreame не найден - выберите его в настройках",
		notRobot: "Это не робот Dreame: выберите устройство dreame.<n>.<id>",
		details: "Показать всё",
		pause: "Пауза",
	},
	pt: {
		noRobot: "Nenhum robô Dreame encontrado - escolha um nas configurações",
		notRobot: "Não é um robô Dreame: escolha o dispositivo dreame.<n>.<id>",
		details: "Mostrar tudo",
		pause: "Pausa",
	},
	nl: {
		noRobot: "Geen Dreame-robot gevonden - kies er een in de instellingen",
		notRobot: "Geen Dreame-robot: kies het apparaat dreame.<n>.<id>",
		details: "Alles tonen",
		pause: "Pauze",
	},
	fr: {
		noRobot: "Aucun robot Dreame trouvé - choisissez-en un dans les paramètres",
		notRobot: "Pas un robot Dreame : choisissez l'appareil dreame.<n>.<id>",
		details: "Tout afficher",
		pause: "Pause",
	},
	it: {
		noRobot: "Nessun robot Dreame trovato - sceglierne uno nelle impostazioni",
		notRobot: "Non è un robot Dreame: scegliere il dispositivo dreame.<n>.<id>",
		details: "Mostra tutto",
		pause: "Pausa",
	},
	es: {
		noRobot: "No se encontró ningún robot Dreame - elija uno en la configuración",
		notRobot: "No es un robot Dreame: elija el dispositivo dreame.<n>.<id>",
		details: "Mostrar todo",
		pause: "Pausa",
	},
	pl: {
		noRobot: "Nie znaleziono robota Dreame - wybierz go w ustawieniach",
		notRobot: "To nie jest robot Dreame: wybierz urządzenie dreame.<n>.<id>",
		details: "Pokaż wszystko",
		pause: "Pauza",
	},
	uk: {
		noRobot: "Робота Dreame не знайдено - виберіть його в налаштуваннях",
		notRobot: "Це не робот Dreame: виберіть пристрій dreame.<n>.<id>",
		details: "Показати все",
		pause: "Пауза",
	},
	"zh-cn": {
		noRobot: "未找到 Dreame 机器人 - 请在设置中选择一个",
		notRobot: "不是 Dreame 机器人：请选择设备 dreame.<n>.<id>",
		details: "显示全部",
		pause: "暂停",
	},
};

/** A function that names a word in the language of the system */
export interface Words {
	/** A word of this element */
	own(key: OwnWordKey): string;
	/**
	 * A word of the native views, with `%s` replaced by the arguments in turn; the key itself if there is none, which
	 * is what `labelRooms` of the views takes for "no translation"
	 */
	view(key: string, ...args: string[]): string;
}

/**
 * The words in one language, English where there is none in it
 *
 * @param lang the language of the ioBroker system
 */
export function getWords(lang: string): Words {
	const viewWords = VIEW_WORDS[lang] || {};
	const viewEnglish = VIEW_WORDS.en || {};
	return {
		own: key => OWN[lang]?.[key] || EN[key],
		view: (key, ...args) => {
			let text = viewWords[key] || viewEnglish[key] || key;
			for (const arg of args) {
				text = text.replace("%s", arg);
			}
			return text;
		},
	};
}
