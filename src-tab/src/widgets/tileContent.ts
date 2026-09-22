/**
 * What a tile shows: the robot's status, or its map.
 *
 * "auto" follows the tile's size, because the two contents suit different shapes: a map needs
 * area to be anything but a coloured smudge, so it is the default for the one square tile large
 * enough for it, and status - a word and a number - is the default everywhere else.
 */

export type TileContent = "auto" | "status" | "map";

/** The tile sizes the devices app offers. */
export type TileSize = "1x1" | "2x0.5" | "2x1" | "2x2";

/** Resolves a tile's content setting against its size. */
export function resolveTileContent(content: TileContent | undefined, size: TileSize | undefined): "status" | "map" {
	if (content === "status" || content === "map") return content;
	return size === "2x2" ? "map" : "status";
}

/** How a tile is captioned: by the robot's own name, by a text of the user's, or not at all. */
export type CaptionMode = "auto" | "custom" | "none";

/**
 * The caption a tile shows, or null for none.
 *
 * Automatic is the robot's name, followed by the floor's where the tile is pinned to one: a
 * household with two floors puts up a tile for each, and two tiles both saying "Kitchen robot"
 * would leave the user guessing which is which. A custom caption left empty falls back to the
 * automatic one, as the devices app's own tiles fall back to the object's name - an empty text
 * is a setting not yet made, not a request for no caption, which is what `none` is for.
 *
 * @param floorName the name of the floor the tile is pinned to, or null where it follows the robot
 */
export function tileCaption(
	mode: CaptionMode | undefined,
	customText: string | undefined,
	robotName: string,
	floorName: string | null,
): string | null {
	if (mode === "none") return null;
	const custom = mode === "custom" ? customText?.trim() : "";
	if (custom) return custom;
	return floorName ? `${robotName} · ${floorName}` : robotName;
}

/**
 * The title of the dialog a tile opens.
 *
 * A caption the user wrote names the tile, so it names the dialog as well; an automatic one would
 * only repeat the robot's name, which is then used on its own - the dialog shows every floor, so a
 * floor in its title would be wrong as soon as the user switched to another.
 */
export function dialogTitle(mode: CaptionMode | undefined, customText: string | undefined, robotName: string): string {
	return (mode === "custom" && customText?.trim()) || robotName;
}
