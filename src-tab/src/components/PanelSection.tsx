/**
 * The frame every sidebar panel sits in, and the shared way a command reports failure.
 *
 * Each panel would otherwise repeat the same heading, the same spacing and - more importantly -
 * the same decision about what happens when a state write is refused. A button that silently does
 * nothing is the worst outcome, so {@link useCommandRunner} makes reporting the failure the
 * default rather than something each panel remembers to add.
 */

import type React from "react";
import { useState } from "react";
import { Alert, Box, Snackbar, Stack, Typography } from "@mui/material";
import { I18n } from "@iobroker/gui-components";

export interface PanelSectionProps {
	/** Already-translated heading. */
	title: string;
	children: React.ReactNode;
}

export function PanelSection({ title, children }: PanelSectionProps): React.JSX.Element {
	return (
		<Box sx={{ py: 1 }}>
			<Typography
				variant="overline"
				color="text.secondary"
				sx={{ display: "block", lineHeight: 1.6, letterSpacing: "0.08em" }}
			>
				{title}
			</Typography>
			<Stack spacing={1} sx={{ pt: 0.5 }}>
				{children}
			</Stack>
		</Box>
	);
}

/**
 * Runs a command and surfaces a failure.
 *
 * Returns the runner and the element that shows the error, so a panel wires up both without
 * knowing how either works.
 */
export function useCommandRunner(): {
	run: (action: () => Promise<void>) => () => void;
	failureElement: React.JSX.Element;
} {
	const [failure, setFailure] = useState<string | null>(null);

	const run = (action: () => Promise<void>) => (): void => {
		void action().catch((error: unknown) => {
			setFailure(error instanceof Error ? error.message : String(error));
		});
	};

	const failureElement = (
		<Snackbar
			open={failure !== null}
			autoHideDuration={6000}
			onClose={() => setFailure(null)}
			anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
		>
			<Alert severity="error" onClose={() => setFailure(null)}>
				{I18n.t("tab.commandFailed")}: {failure}
			</Alert>
		</Snackbar>
	);

	return { run, failureElement };
}
