/**
 * The dialog a widget opens: the full view of the robot, as large as the screen allows.
 *
 * Shared by the devices tile and the vis-2 widget, which differ in how they are drawn but agree on
 * what a click should show. Full screen on a phone, where a dialog with margins would leave the
 * map a strip; a large window everywhere else, so the page it came from stays in sight around it.
 */

import type React from "react";
import { Dialog, DialogTitle, IconButton, Typography, useMediaQuery, useTheme } from "@mui/material";
import { Close as CloseIcon } from "@mui/icons-material";

import { DreameView } from "../components/DreameView";
import type { MapMode } from "../components/DreameView";
import type { TabConnection } from "../connection/types";

export interface RobotDialogProps {
	open: boolean;
	onClose: () => void;
	connection: TabConnection;
	instanceId: string;
	did: string;
	title: string;
	defaultMode?: MapMode;
	defaultFloor?: string;
}

export function RobotDialog({
	open,
	onClose,
	connection,
	instanceId,
	did,
	title,
	defaultMode,
	defaultFloor,
}: RobotDialogProps): React.JSX.Element {
	const theme = useTheme();
	const phone = useMediaQuery(theme.breakpoints.down("sm"));

	return (
		<Dialog
			open={open}
			onClose={onClose}
			fullScreen={phone}
			maxWidth={false}
			slotProps={{
				paper: {
					sx: phone
						? { display: "flex", flexDirection: "column" }
						: {
								width: "min(1600px, 95vw)",
								height: "90vh",
								display: "flex",
								flexDirection: "column",
							},
				},
			}}
		>
			<DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1, py: 1, pr: 1 }}>
				<Typography variant="h6" noWrap sx={{ flex: "1 1 auto", minWidth: 0 }}>
					{title}
				</Typography>
				<IconButton onClick={onClose} aria-label="close" size="small">
					<CloseIcon />
				</IconButton>
			</DialogTitle>

			{/*
			 * No DialogContent: its padding and its own scrolling would fight the view's, which already
			 * decides for itself whether the whole body or each column scrolls. The dialog only needs
			 * to give it the remaining height.
			 */}
			{open ? (
				<div style={{ flex: "1 1 auto", minHeight: 0 }}>
					<DreameView
						connection={connection}
						instanceId={instanceId}
						did={did}
						defaultMode={defaultMode}
						defaultFloor={defaultFloor}
					/>
				</div>
			) : null}
		</Dialog>
	);
}
