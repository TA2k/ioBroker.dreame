/**
 * The MUI theme of the stand-alone page, from its palette - see `theme.ts`.
 */

import { createTheme } from "@mui/material";
import type { Theme } from "@mui/material";
import type { WidgetPalette } from "./theme";

export function buildPageTheme(palette: WidgetPalette): Theme {
	return createTheme({
		palette: {
			mode: palette.mode,
			primary: { main: palette.accent },
			background: { default: palette.background, paper: palette.paper },
			divider: palette.divider,
			text: { primary: palette.text, secondary: palette.muted },
		},
		components: {
			// The widget's buttons have a colour of their own, apart from the panels.
			MuiButton: { styleOverrides: { outlined: { backgroundColor: palette.buttons } } },
		},
	});
}
