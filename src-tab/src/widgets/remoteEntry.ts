/**
 * The absolute URL of a widget bundle's remote entry, worked out from inside the bundle.
 *
 * A host that loads a module of the bundle a second way - json-config's custom fields, which the
 * devices app renders a tile's settings with - needs the entry's full URL, and the bundle is
 * served from different places: `/adapter/dreame/dm-widgets/` inside the admin,
 * `/dreame.admin/dm-widgets/` from the web adapter. Every module knows its own URL, though, and
 * the build puts every module into `assets/`, right next to the entry. So the entry is found from
 * there instead of being guessed.
 *
 * @param moduleUrl `import.meta.url` of the calling module
 * @param entryFile file name of the remote entry, as the federation config names it
 */
export function remoteEntryUrl(moduleUrl: string, entryFile: string): string {
	const assets = moduleUrl.lastIndexOf("/assets/");
	// Outside a build - the dev server serves the sources - there is no `assets/`; the entry is then
	// taken to sit beside the module, which is at least a well-defined answer.
	const base = assets === -1 ? moduleUrl.slice(0, moduleUrl.lastIndexOf("/") + 1) : moduleUrl.slice(0, assets + 1);
	return base + entryFile;
}
