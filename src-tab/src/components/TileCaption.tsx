/**
 * The caption line of a map tile.
 *
 * Beside the map rather than laid over it: a caption on top of a room would hide part of it, and
 * would need a backdrop to stay readable over rooms of every colour. The map gives up one line of
 * height for it and fits itself into what is left.
 *
 * Below the map in the devices app, where its own tiles put their name; above it in vis-2, where
 * a card's title sits.
 */

import type React from "react";
import { Typography } from "@mui/material";

export interface TileCaptionProps {
	text: string;
	placement?: "top" | "bottom";
}

export function TileCaption({ text, placement = "bottom" }: TileCaptionProps): React.JSX.Element {
	// The larger gap faces the tile's edge, the smaller one the map.
	const outer = "clamp(4px, 3cqi, 10px)";
	return (
		<Typography
			noWrap
			// A caption cut short by the tile's width can still be read in full on hover.
			title={text}
			sx={{
				flex: "0 0 auto",
				px: "clamp(6px, 4cqi, 14px)",
				pt: placement === "top" ? outer : "2px",
				pb: placement === "top" ? "2px" : outer,
				fontWeight: 600,
				lineHeight: 1.3,
				// Sized by the tile, like the host's own names, within bounds that keep it a caption.
				fontSize: "clamp(0.8rem, 4.5cqi, 1.1rem)",
			}}
		>
			{text}
		</Typography>
	);
}
