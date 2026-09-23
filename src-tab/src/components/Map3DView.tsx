/**
 * The 3D map.
 *
 * Owns a canvas, a renderer and a render loop; everything about what the scene contains is in
 * `map3d/scene.ts`.
 *
 * ## What it rebuilds, and when
 *
 * While the robot cleans, a map arrives every few seconds and almost all of it is unchanged - the
 * path grew, nothing moved. Rebuilding walls and furniture for that would stutter visibly, so the
 * scene is rebuilt only when {@link geometryKey} changes; the robot marker moves on its own in
 * between. The camera survives a rebuild, because a view thrown away while somebody was looking
 * through it is the complaint that gets reported.
 */

import type React from "react";
import { useEffect, useRef, useState } from "react";
import { Alert, Box, useTheme } from "@mui/material";
import { I18n } from "@iobroker/gui-components";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

import { buildModel, geometryKey } from "../map3d/model";
import { DARK_COLOURS, LIGHT_COLOURS, buildScene, frameCamera } from "../map3d/scene";
import type { SceneBundle } from "../map3d/scene";
import { isWebGlAvailable } from "../map3d/webgl";
import type { MapPackage } from "../map/mapPackage";
import type { LabelledRoom } from "../map/rooms";

export interface Map3DViewProps {
	map: MapPackage;
	hiddenRooms?: ReadonlySet<number>;
	/** Rooms to label, the same list the 2D view labels. */
	rooms: LabelledRoom[];
}

export function Map3DView({ map, hiddenRooms, rooms }: Map3DViewProps): React.JSX.Element {
	const hostRef = useRef<HTMLDivElement | null>(null);
	const bundleRef = useRef<SceneBundle | null>(null);
	// True once the user has orbited. A ref, because nothing renders from it.
	const touchedRef = useRef(false);
	const theme = useTheme();
	const [supported] = useState(() => isWebGlAvailable());

	const key = geometryKey(map);
	const dark = theme.palette.mode === "dark";

	useEffect(() => {
		const host = hostRef.current;
		if (!host || !supported) return;

		const renderer = new THREE.WebGLRenderer({ antialias: true });
		renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
		host.appendChild(renderer.domElement);
		renderer.domElement.style.display = "block";
		renderer.domElement.style.width = "100%";
		renderer.domElement.style.height = "100%";

		const model = buildModel(map, hiddenRooms, rooms);
		const bundle = buildScene(model, dark ? DARK_COLOURS : LIGHT_COLOURS, {
			maxTextureSize: renderer.capabilities.maxTextureSize,
			maxAnisotropy: renderer.capabilities.getMaxAnisotropy(),
		});
		bundleRef.current = bundle;

		const controls = new OrbitControls(bundle.camera, renderer.domElement);
		controls.enableDamping = true;
		// From the first drag onwards the camera belongs to the user, and re-framing it on a
		// resize would snatch the view back from under them.
		const onControlStart = (): void => {
			touchedRef.current = true;
		};
		controls.addEventListener("start", onControlStart);
		// Stops the camera going under the floor, where the map is an unlit underside and the
		// controls feel broken.
		controls.maxPolarAngle = Math.PI / 2.05;
		controls.minDistance = 20;
		controls.maxDistance = Math.max(map.header.width, map.header.height) * 2.5;

		const resize = (): void => {
			const { clientWidth, clientHeight } = host;
			if (clientWidth === 0 || clientHeight === 0) return;
			renderer.setSize(clientWidth, clientHeight, false);
			bundle.camera.aspect = clientWidth / clientHeight;
			bundle.camera.updateProjectionMatrix();
			// Only while the user has not taken the camera over: re-framing under someone who is
			// orbiting would snatch the view back on every resize.
			if (!touchedRef.current) {
				frameCamera(bundle.camera, model, bundle.camera.aspect);
				bundle.camera.lookAt(0, 0, 0);
			}
		};
		resize();
		const observer = new ResizeObserver(resize);
		observer.observe(host);

		let frame = 0;
		const tick = (): void => {
			frame = requestAnimationFrame(tick);
			controls.update();
			renderer.render(bundle.scene, bundle.camera);
		};
		tick();

		return () => {
			cancelAnimationFrame(frame);
			observer.disconnect();
			controls.removeEventListener("start", onControlStart);
			controls.dispose();
			bundle.dispose();
			bundleRef.current = null;
			// The context has to be released explicitly: a browser allows only a handful at a time,
			// and leaking one per device switch eventually leaves a blank canvas.
			renderer.dispose();
			renderer.forceContextLoss();
			host.removeChild(renderer.domElement);
		};
		// Rebuilt on a geometry change or a theme change, not on every map that arrives.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [key, dark, supported, hiddenRooms, rooms]);

	// Between rebuilds the robot marker is moved rather than the scene replaced.
	useEffect(() => {
		const bundle = bundleRef.current;
		if (!bundle?.robot) return;

		const model = buildModel(map, hiddenRooms, rooms);
		if (!model.robot) return;
		bundle.robot.position.set(
			model.robot.x - model.width / 2,
			bundle.robot.position.y,
			model.robot.y - model.height / 2,
		);
	}, [map, hiddenRooms]);

	if (!supported) {
		return (
			<Box sx={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", p: 2 }}>
				<Alert severity="info">{I18n.t("tab.3d.keinWebgl")}</Alert>
			</Box>
		);
	}

	return <Box ref={hostRef} sx={{ width: "100%", height: "100%", position: "relative" }} />;
}
