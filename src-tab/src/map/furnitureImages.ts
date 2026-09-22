/**
 * The furniture pictures of the 2D map, one per furniture type: the Dreame app's top views as
 * Home Assistant's dreame-vacuum integration ships them (Copyright (c) 2022 Tasshack, MIT
 * License), taken over from the old web interface.
 *
 * Files rather than inlined data: the bundle carries only their names, and the browser loads the
 * pictures of the types a map actually has - the widget made the same call, since all fifteen
 * together weigh some 350 KB.
 */

const images = import.meta.glob<string>("./furniture/*.png", { eager: true, query: "?url", import: "default" });

/** The picture of a furniture type, or null for a type without one. */
export function furnitureImage(type: number): string | null {
	return images[`./furniture/${type}.png`] ?? null;
}
