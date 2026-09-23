/**
 * The stand-alone page at `http://<host>:<web port>/dreame/`, served by the web adapter.
 *
 * It replaces the old web interface and shows what the admin tab shows - the same views, from the
 * same code - with what only a page of its own needs on top:
 *
 * - its own colours, from the settings behind the gear, since there is no host theme to follow;
 * - a share link for its look (`?cfg=`), and a kiosk mode without the gear (`?gear=0`), e.g. for
 *   a tablet on the wall or a frame in a dashboard;
 * - its own connection to ioBroker - see `server.ts` - which works whether the web adapter speaks
 *   socket.io or pure websockets.
 *
 * `?instance=1` picks another adapter instance, `?did=` a robot; both as in the admin tab.
 */

import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { Alert, Box, CircularProgress, CssBaseline, ThemeProvider, Typography } from "@mui/material";
import { Connection, I18n } from "@iobroker/gui-components";

import { SocketConnection } from "../connection/SocketConnection";
import { DeviceWorkspace } from "../components/DeviceWorkspace";
import { Centre } from "../components/Centre";
import { registerDreameTranslations } from "../i18n/dreameTranslations";
import { parseDelta } from "../settings/widgetConfig";
import { buildPageTheme } from "../settings/pageTheme";
import { widgetPalette } from "../settings/theme";
import { defaultWidgetConfig } from "../settings/widgetConfig";
import { loadScript, pickConnect, serverBase } from "./server";

registerDreameTranslations();

type Phase =
	{ kind: "connecting" } | { kind: "ready"; connection: SocketConnection } | { kind: "failed"; reason: string };

function storage(): Storage | null {
	try {
		return window.localStorage;
	} catch {
		return null;
	}
}

export function WebApp(): React.JSX.Element {
	const params = useMemo(() => new URLSearchParams(window.location.search), []);
	const instanceId = `dreame.${Number(params.get("instance")) || 0}`;
	const configDelta = useMemo(() => parseDelta(params.get("cfg")), [params]);
	// Until a robot's settings are read, the page wears the widget's default: dark.
	const startTheme = useMemo(() => buildPageTheme(widgetPalette(defaultWidgetConfig().layout)), []);
	const [phase, setPhase] = useState<Phase>({ kind: "connecting" });

	useEffect(() => {
		const base = serverBase(window.location.search, window.location.origin, window.location.protocol, storage());
		if (!base) {
			setPhase({ kind: "failed", reason: I18n.t("tab.web.keinServer") });
			return;
		}

		let cancelled = false;
		void (async () => {
			try {
				await loadScript(`${base}/socket.io/socket.io.js`);
				const connect = pickConnect((window as unknown as { io?: unknown }).io);
				if (!connect) throw new Error("socket.io.js provides no connect function");

				// Makes the client treat this as a web page: the socket sits at the server's root,
				// not under /dreame/, where the page itself is.
				(window as unknown as { socketUrl: string }).socketUrl = base;

				const socket: Connection = new Connection({
					name: "dreame",
					port: "",
					connect: connect as never,
					// The views read a handful of states by id; every object in the system is not needed.
					doNotLoadAllObjects: true,
					doNotLoadACL: true,
					onReady: () => {
						void socket
							.getSystemConfig()
							.then(config => {
								const language = config?.common?.language;
								if (language) I18n.setLanguage(language);
							})
							.catch(() => undefined)
							.finally(() => {
								if (!cancelled) setPhase({ kind: "ready", connection: new SocketConnection(socket) });
							});
					},
					onError: (error: unknown) => {
						console.error("[dreame] connection error", error);
					},
				});
			} catch (error) {
				console.error("[dreame] cannot connect", error);
				if (!cancelled) setPhase({ kind: "failed", reason: I18n.t("tab.web.keineVerbindung") });
			}
		})();

		return () => {
			cancelled = true;
		};
	}, []);

	return (
		<ThemeProvider theme={startTheme}>
			<CssBaseline />
			<Box sx={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
				{phase.kind === "connecting" ? (
					<Centre>
						<CircularProgress />
					</Centre>
				) : phase.kind === "failed" ? (
					<Centre>
						<Alert severity="error">{phase.reason}</Alert>
					</Centre>
				) : (
					<DeviceWorkspace
						connection={phase.connection}
						instanceId={instanceId}
						requestedDid={params.get("did")}
						emptyMessage={<Typography>{I18n.t("tab.noDevices")}</Typography>}
						settingsMode="page"
						showGear={params.get("gear") !== "0"}
						configDelta={configDelta}
					/>
				)}
			</Box>
		</ThemeProvider>
	);
}
