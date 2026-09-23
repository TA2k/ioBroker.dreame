/**
 * The settings, behind the gear: the widget's settings overlay, section for section.
 *
 * - Appearance: colours - only on the stand-alone page, since in the admin, vis-2 and the
 *   devices app the host's theme applies - then map rotation, sidebar side, UI zoom and width.
 * - Panels: each panel on or off, and the rows or buttons inside it.
 * - Link: the look as a link, e.g. for a wall tablet - again only on the stand-alone page, the
 *   one place such a link can open.
 * - Reset, after asking once more.
 *
 * Every change applies at once and is stored per robot; see `useWidgetConfig`.
 */

import type React from "react";
import { useState } from "react";
import {
	Box,
	Button,
	Checkbox,
	Divider,
	Drawer,
	FormControlLabel,
	IconButton,
	MenuItem,
	Stack,
	Switch,
	TextField,
	Typography,
	useMediaQuery,
	useTheme,
} from "@mui/material";
import { Add as AddIcon, Close as CloseIcon, Remove as RemoveIcon } from "@mui/icons-material";
import { I18n } from "@iobroker/gui-components";

import {
	HIDEABLE_PANELS,
	ROTATIONS,
	SIDEBAR_WIDTH,
	UI_ZOOM,
	clampSidebarWidth,
	clampZoom,
	configDelta,
	encodeBase64Url,
	normaliseRotation,
	withFieldHidden,
	withLayout,
	withPanelVisible,
} from "../settings/widgetConfig";
import type { CustomColours, ThemeMode } from "../settings/widgetConfig";
import { PANEL_FIELDS, PANEL_TITLE_KEY } from "../settings/panelFields";
import type { WidgetConfigHandle } from "../settings/useWidgetConfig";

export interface SettingsDrawerProps {
	open: boolean;
	onClose: () => void;
	settings: WidgetConfigHandle;
	/** Colours: only where the view draws its own page. */
	appearance?: boolean;
	/** The share link: only where there is a page address to share. */
	link?: boolean;
}

const THEMES: readonly ThemeMode[] = ["hell", "dunkel", "hauptfarbe", "custom"];
const COLOURS: readonly (keyof CustomColours)[] = ["hintergrund", "menue", "knoepfe", "rahmen", "schrift"];

export function SettingsDrawer({
	open,
	onClose,
	settings,
	appearance = false,
	link = false,
}: SettingsDrawerProps): React.JSX.Element {
	const theme = useTheme();
	const phone = useMediaQuery(theme.breakpoints.down("sm"));
	const { config, update } = settings;
	const layout = config.layout;

	return (
		<Drawer
			anchor="right"
			open={open}
			onClose={onClose}
			slotProps={{ paper: { sx: { width: phone ? "100%" : 380, maxWidth: "100%" } } }}
		>
			<Stack direction="row" sx={{ alignItems: "center", px: 2, py: 1 }}>
				<Typography variant="h6" sx={{ flex: "1 1 auto" }}>
					{I18n.t("tab.settings.titel")}
				</Typography>
				<IconButton onClick={onClose} aria-label={I18n.t("tab.settings.schliessen")}>
					<CloseIcon />
				</IconButton>
			</Stack>
			<Typography variant="caption" color="text.secondary" sx={{ px: 2 }}>
				{I18n.t("tab.settings.gilt")}
			</Typography>
			<Divider sx={{ mt: 1 }} />

			<Stack spacing={2} sx={{ p: 2, overflowY: "auto" }}>
				<Section title={I18n.t("tab.settings.aussehen")}>
					{appearance ? (
						<>
							<TextField
								select
								size="small"
								label={I18n.t("tab.settings.farbmodus")}
								value={layout.theme}
								onChange={event => update(c => withLayout(c, { theme: event.target.value as ThemeMode }))}
							>
								{THEMES.map(mode => (
									<MenuItem key={mode} value={mode}>
										{I18n.t(`tab.settings.farbmodus.${mode}`)}
									</MenuItem>
								))}
							</TextField>
							{layout.theme === "hauptfarbe" ? (
								<ColourField
									label={I18n.t("tab.settings.farbe.hauptfarbe")}
									value={layout.hauptfarbe}
									onChange={hauptfarbe => update(c => withLayout(c, { hauptfarbe }))}
								/>
							) : null}
							{layout.theme === "custom"
								? COLOURS.map(colour => (
										<ColourField
											key={colour}
											label={I18n.t(`tab.settings.farbe.${colour}`)}
											value={layout.custom[colour]}
											onChange={value =>
												update(c => withLayout(c, { custom: { ...c.layout.custom, [colour]: value } }))
											}
										/>
									))
								: null}
						</>
					) : null}

					<TextField
						select
						size="small"
						label={I18n.t("tab.settings.drehung")}
						value={String(normaliseRotation(layout.drehung))}
						onChange={event => update(c => withLayout(c, { drehung: Number(event.target.value) }))}
					>
						{ROTATIONS.map(rotation => (
							<MenuItem key={rotation} value={String(rotation)}>
								{rotation}°
							</MenuItem>
						))}
					</TextField>

					<FormControlLabel
						control={
							<Switch
								checked={layout.leiste === "links"}
								onChange={event => update(c => withLayout(c, { leiste: event.target.checked ? "links" : "rechts" }))}
							/>
						}
						label={I18n.t("tab.settings.leiste")}
					/>

					<Stepper
						label={I18n.t("tab.settings.zoom")}
						value={Math.round(layout.groesse * 100)}
						unit="%"
						onChange={percent => update(c => withLayout(c, { groesse: clampZoom(percent / 100) }))}
						step={Math.round(UI_ZOOM.step * 100)}
					/>
					<Stepper
						label={I18n.t("tab.settings.breite")}
						value={layout.width}
						unit="px"
						onChange={px => update(c => withLayout(c, { width: clampSidebarWidth(px) }))}
						step={SIDEBAR_WIDTH.step}
					/>
				</Section>

				<Section title={I18n.t("tab.settings.panels")}>
					{HIDEABLE_PANELS.map(id => {
						const visible = config.panels[id]?.sichtbar !== false;
						const hidden = new Set(config.panels[id]?.versteckt ?? []);
						return (
							<Box key={id}>
								<FormControlLabel
									control={
										<Switch
											checked={visible}
											onChange={event => update(c => withPanelVisible(c, id, event.target.checked))}
										/>
									}
									label={I18n.t(PANEL_TITLE_KEY[id])}
								/>
								{visible
									? (PANEL_FIELDS[id] ?? []).map(field => (
											<FormControlLabel
												key={field.id}
												sx={{ display: "flex", ml: 4 }}
												control={
													<Switch
														size="small"
														checked={!hidden.has(field.id)}
														onChange={event => update(c => withFieldHidden(c, id, field.id, !event.target.checked))}
													/>
												}
												label={<Typography variant="body2">{I18n.t(field.labelKey)}</Typography>}
											/>
										))
									: null}
							</Box>
						);
					})}
				</Section>

				{link ? <LinkSection settings={settings} /> : null}

				<ResetButton onReset={settings.reset} />
			</Stack>
		</Drawer>
	);
}

function Section({ title, children }: { title: string; children: React.ReactNode }): React.JSX.Element {
	return (
		<Stack spacing={1.5}>
			<Typography variant="overline" color="text.secondary">
				{title}
			</Typography>
			{children}
		</Stack>
	);
}

function ColourField({
	label,
	value,
	onChange,
}: {
	label: string;
	value: string;
	onChange: (value: string) => void;
}): React.JSX.Element {
	return (
		<Stack direction="row" spacing={1} sx={{ alignItems: "center", justifyContent: "space-between" }}>
			<Typography variant="body2">{label}</Typography>
			<input
				type="color"
				value={value}
				onChange={event => onChange(event.target.value)}
				style={{ width: 48, height: 28, border: "none", background: "none", cursor: "pointer" }}
			/>
		</Stack>
	);
}

/** A number with minus and plus, the widget's control for zoom and width. */
function Stepper({
	label,
	value,
	unit,
	step,
	onChange,
}: {
	label: string;
	value: number;
	unit: string;
	step: number;
	onChange: (value: number) => void;
}): React.JSX.Element {
	return (
		<Stack direction="row" spacing={1} sx={{ alignItems: "center", justifyContent: "space-between" }}>
			<Typography variant="body2">{label}</Typography>
			<Stack direction="row" sx={{ alignItems: "center" }}>
				<IconButton size="small" onClick={() => onChange(value - step)} aria-label="-">
					<RemoveIcon fontSize="small" />
				</IconButton>
				<Typography variant="body2" sx={{ minWidth: 64, textAlign: "center" }}>
					{value} {unit}
				</Typography>
				<IconButton size="small" onClick={() => onChange(value + step)} aria-label="+">
					<AddIcon fontSize="small" />
				</IconButton>
			</Stack>
		</Stack>
	);
}

/**
 * The share link: the look's difference from the defaults as `?cfg=`, optionally without the
 * gear. Never the robot - a link should not pick one.
 */
function LinkSection({ settings }: { settings: WidgetConfigHandle }): React.JSX.Element {
	const [withoutGear, setWithoutGear] = useState(false);
	const [url, setUrl] = useState("");
	const [copied, setCopied] = useState<string | null>(null);

	const create = (): void => {
		const target = new URL(window.location.origin + window.location.pathname);
		const current = new URLSearchParams(window.location.search);
		// Keep the instance and robot the page was opened for; replace the look.
		for (const key of ["instance", "did"]) {
			const value = current.get(key);
			if (value) target.searchParams.set(key, value);
		}
		target.searchParams.set("cfg", encodeBase64Url(JSON.stringify(configDelta(settings.config))));
		if (withoutGear) target.searchParams.set("gear", "0");
		setUrl(target.toString());
	};

	const copy = async (): Promise<void> => {
		// The clipboard API needs a secure context, which a plain http:// ioBroker is not.
		try {
			if (navigator.clipboard && window.isSecureContext) {
				await navigator.clipboard.writeText(url);
				setCopied(I18n.t("tab.settings.link.kopiert"));
				return;
			}
		} catch {
			// falls through to the manual hint
		}
		setCopied(I18n.t("tab.settings.link.manuell"));
	};

	return (
		<Section title={I18n.t("tab.settings.link")}>
			<Typography variant="body2" color="text.secondary">
				{I18n.t("tab.settings.link.hinweis")}
			</Typography>
			<FormControlLabel
				control={<Checkbox checked={withoutGear} onChange={event => setWithoutGear(event.target.checked)} />}
				label={I18n.t("tab.settings.link.ohneZahnrad")}
			/>
			<Stack direction="row" spacing={1}>
				<Button variant="outlined" size="small" onClick={create}>
					{I18n.t("tab.settings.link.erzeugen")}
				</Button>
				<Button variant="outlined" size="small" disabled={!url} onClick={() => void copy()}>
					{copied ?? I18n.t("tab.settings.link.kopieren")}
				</Button>
			</Stack>
			{url ? (
				<TextField
					size="small"
					value={url}
					slotProps={{ htmlInput: { readOnly: true } }}
					onFocus={event => event.target.select()}
				/>
			) : null}
		</Section>
	);
}

/** Resets after a second click, as the widget did: the first only asks. */
function ResetButton({ onReset }: { onReset: () => void }): React.JSX.Element {
	const [asking, setAsking] = useState(false);
	return (
		<Button
			color={asking ? "error" : "inherit"}
			variant={asking ? "contained" : "outlined"}
			onClick={() => {
				if (!asking) {
					setAsking(true);
					return;
				}
				setAsking(false);
				onReset();
			}}
			onBlur={() => setAsking(false)}
		>
			{I18n.t(asking ? "tab.settings.reset.bestaetigen" : "tab.settings.reset")}
		</Button>
	);
}
