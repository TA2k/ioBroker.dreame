/** Centres a single child in the space it is given. */

import type React from "react";
import { Box } from "@mui/material";

export function Centre({ children }: { children: React.ReactNode }): React.JSX.Element {
	return (
		<Box
			sx={{
				width: "100%",
				height: "100%",
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				p: 1,
				textAlign: "center",
			}}
		>
			{children}
		</Box>
	);
}
