import type React from "react";
import { useEffect, useRef, useState } from "react";
import {
	Alert,
	Box,
	Button,
	Card,
	CardContent,
	Chip,
	Dialog,
	DialogActions,
	DialogContent,
	DialogTitle,
	FormControlLabel,
	Stack,
	Switch,
	Typography,
} from "@mui/material";
import { I18n } from "@iobroker/gui-components";
import type { TabConnection } from "../connection/types";
import { activity, booleanValue, controls, fresh, numeric, sendCommand } from "../sf25/model";
import { useSF25 } from "../sf25/useSF25";
import sf25Image from "../assets/sf25.png";

export function SF25View({
	connection,
	instanceId,
	did,
	header,
}: {
	connection: TabConnection;
	instanceId: string;
	did: string;
	header: React.ReactNode;
}): React.JSX.Element {
	const t = (key: string): string => I18n.t(`sf25.ui.${key}`);
	const { states, error } = useSF25(connection, `${instanceId}.${did}`);
	const [, refreshClock] = useState(0);
	const now = Date.now();
	const [pending, setPending] = useState(false);
	const [notice, setNotice] = useState<"sent" | "failed" | null>(null);
	const [confirmation, setConfirmation] = useState<number | null>(null);
	const locked = useRef(false);
	const alive = useRef(true);
	useEffect(() => {
		alive.current = true;
		const timer = window.setInterval(() => refreshClock(tick => tick + 1), 10000);
		return () => {
			alive.current = false;
			window.clearInterval(timer);
		};
	}, []);
	const available = controls(states, now);
	const current = activity(states);
	const run = async (name: string, value: unknown): Promise<void> => {
		if (locked.current) return;
		locked.current = true;
		setPending(true);
		setNotice(null);
		try {
			await sendCommand(connection, instanceId, did, name, value);
			if (alive.current) setNotice("sent");
		} catch {
			if (alive.current) setNotice("failed");
		} finally {
			locked.current = false;
			if (alive.current) setPending(false);
		}
	};
	const stamp = states["status.state"]?.ts;
	const timestamp = (value: number | undefined): string =>
		value ? new Date(value).toLocaleString(I18n.getLanguage()) : "—";
	const program = numeric(states["remote.program"]);
	const metrics = [
		["remaining", "status.remaining-time", "min"],
		["temperature", "status.temperature", "°C"],
		["humidity", "status.humidity", "%"],
		["energy", "status.energy", "Wh"],
		["filterLife", "status.carbon-filter-life", "%"],
		["filterDays", "status.carbon-filter-days", t("days")],
	];
	const action = (label: string, enabled: boolean, name: string, value: unknown): React.ReactNode => (
		<Button
			variant="outlined"
			disabled={pending || !enabled}
			onClick={() => {
				void run(name, value);
			}}
		>
			{t(label)}
		</Button>
	);
	return (
		<Box sx={{ overflowY: "auto", flex: 1, width: "100%", bgcolor: "background.default" }}>
			<Box sx={{ maxWidth: 1080, mx: "auto", p: { xs: 2, md: 3 } }}>
				<Stack spacing={2.5}>
					<Stack
						direction={{ xs: "column", sm: "row" }}
						spacing={2}
						sx={{ alignItems: { sm: "center" }, flexWrap: "wrap" }}
					>
						{header}
						<Chip label="Dreame SF25 WiFi" variant="outlined" />
						<Box sx={{ flex: 1 }} />
						{action("refresh", true, "Refresh", true)}
					</Stack>
					<Card variant="outlined">
						<CardContent sx={{ display: "flex", alignItems: "center", gap: { xs: 1, sm: 3 } }}>
							<Box sx={{ flex: 1, minWidth: 0 }}>
								<Typography variant="overline">{t("operation")}</Typography>
								<Typography variant="h4" sx={{ my: 1 }}>
									{t(available.stale ? "unknown" : current)}
								</Typography>
								<Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }} useFlexGap>
									<Chip size="small" label={t(available.ready ? "reachable" : "unavailable")} />
									<Chip
										size="small"
										variant="outlined"
										label={t(
											booleanValue(states["status.lid-open"]) === true
												? "lidOpen"
												: booleanValue(states["status.lid-open"]) === false
													? "lidClosed"
													: "lidUnknown",
										)}
									/>
								</Stack>
								<Typography color="text.secondary" sx={{ mt: 1.5 }}>
									{t("updated")}: {timestamp(stamp)}
								</Typography>
								<Typography color="text.secondary" variant="body2">
									{t("program")}:{" "}
									{program === null ? "—" : [-1, 0, 1, 2].includes(program) ? t(`program${program}`) : `${program}`}
									{(current === "standby" || current === "sleeping") && program !== -1 && program !== null
										? ` · ${t("retained")}`
										: ""}
								</Typography>
							</Box>
							<Box
								component="img"
								src={sf25Image}
								alt="Dreame SF25 WiFi"
								sx={{
									width: { xs: 96, sm: 240 },
									height: { xs: 132, sm: 200 },
									objectFit: "cover",
									flexShrink: 0,
									borderRadius: 1,
									bgcolor: "#fff",
								}}
							/>
						</CardContent>
					</Card>
					{(error || !available.ready) && <Alert severity="warning">{t(error ? "loadFailed" : "stale")}</Alert>}
					<Box
						sx={{
							display: "grid",
							gridTemplateColumns: { xs: "repeat(2, minmax(0, 1fr))", md: "repeat(3, minmax(0, 1fr))" },
							gap: 2,
						}}
					>
						{metrics.map(([label, field, unit]) => {
							const state = states[field!];
							const value = numeric(state);
							return (
								<Card variant="outlined" key={field}>
									<CardContent>
										<Typography color="text.secondary" variant="body2">
											{t(label!)}
										</Typography>
										<Typography variant="h5" sx={{ my: 1 }}>
											{value === null ? "—" : `${value.toLocaleString(I18n.getLanguage())} ${unit}`}
										</Typography>
										<Typography variant="caption" color="text.secondary">
											{timestamp(state?.ts)}
											{state && !fresh(state, now) ? ` · ${t("old")}` : ""}
										</Typography>
									</CardContent>
								</Card>
							);
						})}
					</Box>
					<Typography variant="body2" color="text.secondary">
						{t("energyNote")}
					</Typography>
					<Card variant="outlined">
						<CardContent>
							<Typography variant="h6" gutterBottom>
								{t("controls")}
							</Typography>
							<Stack direction="row" spacing={1.5} sx={{ flexWrap: "wrap" }} useFlexGap>
								<Button variant="contained" disabled={pending || !available.start} onClick={() => setConfirmation(0)}>
									{t("start")}
								</Button>
								<Button variant="outlined" disabled={pending || !available.start} onClick={() => setConfirmation(2)}>
									{t("clean")}
								</Button>
								{action("pause", available.pause, "pause", true)}
								{action("resume", available.resume, "resume", true)}
								<Button
									color="error"
									variant="outlined"
									disabled={pending || !available.stop}
									onClick={() => setConfirmation(-1)}
								>
									{t("stop")}
								</Button>
								{action("wake", available.wake, "wake", true)}
								{action("openLid", available.openLid, "open-lid", true)}
							</Stack>
							<Typography color="text.secondary" variant="body2" sx={{ mt: 2 }}>
								{t("lidNote")}
							</Typography>
							<Stack direction={{ xs: "column", sm: "row" }} sx={{ mt: 1 }}>
								{[
									["silent-mode", "silent"],
									["child-lock", "childLock"],
								].map(([name, label]) => {
									const state = states[`remote.${name}`];
									const value = booleanValue(state);
									return (
										<FormControlLabel
											key={name}
											label={`${t(label!)}${value === null ? ` · ${t("unknown")}` : ""}`}
											control={
												<Switch
													checked={value === true}
													disabled={pending || !available.ready || !fresh(state, now) || value === null}
													onChange={(_event, checked) => {
														void run(name!, checked);
													}}
												/>
											}
										/>
									);
								})}
							</Stack>
						</CardContent>
					</Card>
					{notice && (
						<Alert severity={notice === "failed" ? "error" : "info"} onClose={() => setNotice(null)}>
							{t(notice)}
						</Alert>
					)}
					<Alert severity="info">{t("coolingNote")}</Alert>
				</Stack>
			</Box>
			<Dialog open={confirmation !== null} onClose={() => setConfirmation(null)}>
				<DialogTitle>
					{t(confirmation === -1 ? "confirmStop" : confirmation === 2 ? "confirmClean" : "confirmStart")}
				</DialogTitle>
				<DialogContent>
					<Typography>
						{t(confirmation === -1 ? "stopNote" : confirmation === 2 ? "cleanPreparation" : "startPreparation")}
					</Typography>
				</DialogContent>
				<DialogActions>
					<Button onClick={() => setConfirmation(null)}>{t("cancel")}</Button>
					<Button
						variant="contained"
						disabled={pending || !(confirmation === -1 ? available.stop : available.start)}
						onClick={() => {
							const value = confirmation;
							setConfirmation(null);
							if (value !== null) void run("program", value);
						}}
					>
						{t("confirm")}
					</Button>
				</DialogActions>
			</Dialog>
		</Box>
	);
}
