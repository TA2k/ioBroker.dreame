/**
 * Stands in for `@mui/material/SvgIcon`, so that the icons are the host's MUI too.
 *
 * vis-2 shares `@mui/material` as a singleton, but only under that bare name. The icon package
 * reaches for the deep path `@mui/material/SvgIcon` (through its own `utils/createSvgIcon`), which
 * the share scope does not cover - so a second copy of `SvgIcon`, `@mui/system` and the styling
 * engine ended up in this bundle. Those worked out an `sx` with this bundle's MUI against the
 * theme of the host's, and where the two versions differ that throws: an older theme has no
 * `breakpoints.internal_mediaKeys`, and MUI 9.4's `sx` reads its length.
 *
 * The build points that deep path here (see `vite.config.ts`), and everything an icon does goes
 * through the one MUI vis-2 provides. It also takes some 70 KB of duplicated MUI out of the
 * bundle.
 */

import type React from "react";
import { forwardRef, memo } from "react";
import { SvgIcon } from "@mui/material";
import type { SvgIconProps } from "@mui/material";

export default SvgIcon;
export { SvgIcon };

/** What `@mui/icons-material` calls for each icon: its paths wrapped in an `SvgIcon`. */
export function createSvgIcon(path: React.ReactNode, displayName: string): React.ComponentType<SvgIconProps> {
	const Icon = forwardRef<SVGSVGElement, SvgIconProps>((props, ref) => (
		<SvgIcon data-testid={`${displayName}Icon`} ref={ref} {...props}>
			{path}
		</SvgIcon>
	));
	Icon.displayName = `${displayName}Icon`;
	return memo(Icon);
}
