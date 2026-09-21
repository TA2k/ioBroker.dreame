/**
 * The Dreame admin tab.
 *
 * `GenericApp` from `@iobroker/gui-components` supplies the socket, the theme, the language and
 * the instance, which is the reason the tab is worth having at all: the widget in `www/` builds
 * every one of those itself, including its own connection handling.
 *
 * The 11 translation files are the widget's own (`www/i18n`), reused through the `@i18n` alias
 * rather than copied. Two stores of the same strings drift apart, and these already cover every
 * panel that still has to be brought across.
 */

import React from "react";
import { StyledEngineProvider, ThemeProvider } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import { Box, Typography } from "@mui/material";
import {
	AdminConnection,
	GenericApp,
	I18n,
	Loader,
	type GenericAppProps,
	type GenericAppState,
} from "@iobroker/gui-components";

import { SocketConnection } from "./connection/SocketConnection";
import { DeviceWorkspace } from "./components/DeviceWorkspace";

import enLang from "@i18n/en.json";
import deLang from "@i18n/de.json";
import esLang from "@i18n/es.json";
import frLang from "@i18n/fr.json";
import itLang from "@i18n/it.json";
import nlLang from "@i18n/nl.json";
import plLang from "@i18n/pl.json";
import ptLang from "@i18n/pt.json";
import ruLang from "@i18n/ru.json";
import ukLang from "@i18n/uk.json";
import zhCnLang from "@i18n/zh-cn.json";

interface AppState extends GenericAppState {
	/** True once the socket is up and the instance is known. */
	ready: boolean;
}

export default class App extends GenericApp<GenericAppProps, AppState> {
	public constructor(props: GenericAppProps) {
		super(props, {
			// @ts-expect-error the settings type declares an instance, not the class
			Connection: AdminConnection,
			translations: {
				en: enLang,
				de: deLang,
				es: esLang,
				fr: frLang,
				it: itLang,
				nl: nlLang,
				pl: plLang,
				pt: ptLang,
				ru: ruLang,
				uk: ukLang,
				"zh-cn": zhCnLang,
			},
			// A tab has nothing to save, so the Save/Close bar of a config dialog is out of place.
			bottomButtons: false,
			// The tab reads a handful of states by id; loading every object in the system to open it
			// would cost seconds on a large installation and buy nothing.
			doNotLoadAllObjects: true,
		});

		this.state = { ...this.state, ready: false };
	}

	/**
	 * Built once, here, rather than in `render`.
	 *
	 * Views take the connection as an effect dependency, so a fresh instance on every render would
	 * tear down and rebuild every subscription each time the component re-renders - a resubscribe
	 * loop rather than a live map.
	 */
	private connection: SocketConnection | null = null;

	public override onConnectionReady(): void {
		if (this.socket) this.connection = new SocketConnection(this.socket);
		this.setState({ ready: true });
	}

	public override render(): React.JSX.Element {
		if (!this.state.ready || !this.connection) {
			return (
				<StyledEngineProvider injectFirst>
					<ThemeProvider theme={this.state.theme}>
						<Loader themeType={this.state.themeType} />
					</ThemeProvider>
				</StyledEngineProvider>
			);
		}

		const connection = this.connection;
		const instanceId = `${this.adapterName}.${this.instance}`;

		return (
			<StyledEngineProvider injectFirst>
				<ThemeProvider theme={this.state.theme}>
					<CssBaseline />
					<Box
						sx={{
							width: "100%",
							height: "100%",
							display: "flex",
							flexDirection: "column",
							overflow: "hidden",
						}}
					>
						<DeviceWorkspace
							connection={connection}
							instanceId={instanceId}
							requestedDid={new URLSearchParams(window.location.search).get("did")}
							emptyMessage={<Typography>{I18n.t("tab.noDevices")}</Typography>}
						/>
					</Box>
				</ThemeProvider>
			</StyledEngineProvider>
		);
	}
}
