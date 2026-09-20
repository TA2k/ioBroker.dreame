/**
 * Builds the three.js scene from a {@link Map3DModel}.
 *
 * Kept apart from the React component so that the component only has to own a canvas and a
 * lifecycle, and everything about the scene - axes, lighting, materials, what the camera looks
 * at - is in one readable place.
 *
 * ## Axes
 *
 * The model is a picture: x to the right, y downwards. three.js has y upwards and z towards the
 * viewer. So a model point `(x, y)` becomes `(x, 0, y)` - the picture's y becomes the scene's z,
 * and the scene's y is height. Anything that gets this wrong produces a map lying on its side,
 * which is obvious, or one mirrored, which is not.
 *
 * ## Disposal
 *
 * WebGL resources are not garbage collected. Every geometry, material and texture created here is
 * registered so {@link SceneBundle.dispose} can release them; without that, switching device or
 * map a few dozen times exhausts the GPU's memory and the canvas goes blank.
 */

import * as THREE from "three";
import type { Map3DModel } from "./model";
import { shapeFor } from "./furnitureShapes";

/** A built scene, with everything needed to drive and then release it. */
export interface SceneBundle {
	scene: THREE.Scene;
	camera: THREE.PerspectiveCamera;
	/** The robot marker, so it can be moved without rebuilding anything. */
	robot: THREE.Object3D | null;
	/** Releases every GPU resource this bundle owns. */
	dispose: () => void;
}

/** Colours, kept together so the scene can be read as a whole. */
export interface SceneColours {
	background: number;
	wall: number;
	furniture: number;
	noGo: number;
	noMop: number;
	virtualWall: number;
	robot: number;
}

export const DARK_COLOURS: SceneColours = {
	background: 0x0f1620,
	wall: 0x9fa6ae,
	furniture: 0x6b7480,
	noGo: 0xe05263,
	noMop: 0x4098d8,
	virtualWall: 0xe05263,
	robot: 0x37c8ab,
};

export const LIGHT_COLOURS: SceneColours = {
	background: 0xeef2f8,
	wall: 0x8d949c,
	furniture: 0xb4bcc6,
	noGo: 0xd8455a,
	noMop: 0x3a8fd0,
	virtualWall: 0xd8455a,
	robot: 0x18a08a,
};

/**
 * Builds the scene.
 *
 * @param model What to draw.
 * @param colours Palette matching the admin's theme.
 */
export function buildScene(model: Map3DModel, colours: SceneColours): SceneBundle {
	const scene = new THREE.Scene();
	scene.background = new THREE.Color(colours.background);

	// Tracked for disposal; see the note at the top.
	const disposables: { dispose: () => void }[] = [];
	const track = <T extends { dispose: () => void }>(resource: T): T => {
		disposables.push(resource);
		return resource;
	};

	const { width, height } = model;
	// The scene is centred on the map, so the camera and the orbit target can both sit at the
	// origin and the map does not drift as it is rotated.
	const centre = new THREE.Vector3(0, 0, 0);
	const toScene = (x: number, y: number): [number, number] => [x - width / 2, y - height / 2];

	// --- Floor ---------------------------------------------------------------------------------
	// The 2D bitmap with the driven path drawn onto it, so the 3D floor shows what the 2D one
	// does. The path is strokes rather than pixels, so this goes through a canvas.
	const texture = track(buildFloorTexture(model));

	const floorGeometry = track(new THREE.PlaneGeometry(width, height));
	const floorMaterial = track(
		new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }),
	);
	const floor = new THREE.Mesh(floorGeometry, floorMaterial);
	floor.rotation.x = -Math.PI / 2;
	scene.add(floor);

	// --- Walls ---------------------------------------------------------------------------------
	// One geometry and one material for every wall box, drawn as a single instanced mesh: a flat
	// can hold a few hundred boxes after merging, and that many separate meshes is a draw call
	// each.
	if (model.walls.length > 0) {
		const wallGeometry = track(new THREE.BoxGeometry(1, 1, 1));
		const wallMaterial = track(new THREE.MeshLambertMaterial({ color: colours.wall }));
		const walls = new THREE.InstancedMesh(wallGeometry, wallMaterial, model.walls.length);

		const matrix = new THREE.Matrix4();
		model.walls.forEach((rect, index) => {
			const [x, z] = toScene(rect.x + rect.width / 2, rect.y + rect.height / 2);
			matrix.compose(
				new THREE.Vector3(x, model.wallHeight / 2, z),
				new THREE.Quaternion(),
				new THREE.Vector3(rect.width, model.wallHeight, rect.height),
			);
			walls.setMatrixAt(index, matrix);
		});
		walls.instanceMatrix.needsUpdate = true;
		scene.add(walls);
		disposables.push(walls);
	}

	// --- Furniture -----------------------------------------------------------------------------
	// Each piece is several parts, and the parts of every piece are pooled into two instanced
	// meshes - one for the boxes, one for the cylinders. A flat with thirty pieces of eight parts
	// each is then still two draw calls rather than two hundred and forty meshes.
	{
		const boxes: THREE.Matrix4[] = [];
		const cylinders: THREE.Matrix4[] = [];

		for (const piece of model.furniture) {
			const [x, z] = toScene(piece.x, piece.y);
			// The piece's own frame: turned about the vertical axis and stood on the floor. The
			// angle is degrees clockwise in the picture, which is anticlockwise about the scene's
			// y - hence the sign.
			const pieceFrame = new THREE.Matrix4().compose(
				new THREE.Vector3(x, 0, z),
				new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -(piece.angle * Math.PI) / 180, 0)),
				new THREE.Vector3(1, 1, 1),
			);

			for (const part of shapeFor(piece.type)) {
				// Fractions of the piece resolved into scene units, with the part standing on its
				// own bottom edge rather than centred on it.
				const local = new THREE.Matrix4().compose(
					new THREE.Vector3(
						part.dx * piece.width,
						(part.y0 + part.h / 2) * piece.height,
						part.dz * piece.depth,
					),
					new THREE.Quaternion(),
					new THREE.Vector3(part.w * piece.width, part.h * piece.height, part.d * piece.depth),
				);
				(part.round ? cylinders : boxes).push(pieceFrame.clone().multiply(local));
			}
		}

		const addParts = (matrices: THREE.Matrix4[], geometry: THREE.BufferGeometry): void => {
			if (matrices.length === 0) {
				geometry.dispose();
				return;
			}
			track(geometry);
			const material = track(
				new THREE.MeshLambertMaterial({ color: colours.furniture, transparent: true, opacity: 0.92 }),
			);
			const mesh = new THREE.InstancedMesh(geometry, material, matrices.length);
			matrices.forEach((matrix, index) => mesh.setMatrixAt(index, matrix));
			mesh.instanceMatrix.needsUpdate = true;
			scene.add(mesh);
			disposables.push(mesh);
		};

		addParts(boxes, new THREE.BoxGeometry(1, 1, 1));
		// Radius a half, so a unit scale gives a cylinder exactly one unit across - the same
		// footprint a unit box has, which is what lets both share one part description.
		addParts(cylinders, new THREE.CylinderGeometry(0.5, 0.5, 1, 20));
	}

	// --- Zones ---------------------------------------------------------------------------------
	// Drawn flat on the floor rather than as boxes: they are rules about the floor, not objects in
	// the room, and a waist-high slab would hide what it is a rule about. Lifted a hair so they do
	// not fight the floor for the same depth.
	const addZones = (areas: typeof model.noGoZones, colour: number, lift: number): void => {
		for (const area of areas) {
			if (area.width <= 0 || area.depth <= 0) continue;
			const geometry = track(new THREE.PlaneGeometry(area.width, area.depth));
			const material = track(
				new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: 0.35, depthWrite: false }),
			);
			const mesh = new THREE.Mesh(geometry, material);
			const [x, z] = toScene(area.x + area.width / 2, area.y + area.depth / 2);
			mesh.position.set(x, lift, z);
			mesh.rotation.x = -Math.PI / 2;
			scene.add(mesh);
		}
	};
	addZones(model.noGoZones, colours.noGo, 0.05);
	addZones(model.noMopZones, colours.noMop, 0.1);

	// --- Virtual walls -------------------------------------------------------------------------
	// Thin standing panels: they are barriers, so they read better upright than as a line painted
	// on the floor.
	for (const line of model.virtualWalls) {
		const dx = line.to.x - line.from.x;
		const dy = line.to.y - line.from.y;
		const length = Math.hypot(dx, dy);
		if (length <= 0) continue;

		const geometry = track(new THREE.BoxGeometry(length, model.wallHeight * 0.8, 0.4));
		const material = track(
			new THREE.MeshLambertMaterial({ color: colours.virtualWall, transparent: true, opacity: 0.6 }),
		);
		const mesh = new THREE.Mesh(geometry, material);
		const [x, z] = toScene((line.from.x + line.to.x) / 2, (line.from.y + line.to.y) / 2);
		mesh.position.set(x, (model.wallHeight * 0.8) / 2, z);
		mesh.rotation.y = -Math.atan2(dy, dx);
		scene.add(mesh);
	}

	// --- Robot ---------------------------------------------------------------------------------
	let robot: THREE.Object3D | null = null;
	if (model.robot) {
		// A cylinder, because that is what the robot is. Sized from the real thing: about 350 mm
		// across and 100 mm tall, which at 50 mm per cell is 7 by 2.
		const geometry = track(new THREE.CylinderGeometry(3.5, 3.5, 2, 24));
		const material = track(new THREE.MeshLambertMaterial({ color: colours.robot }));
		robot = new THREE.Mesh(geometry, material);
		const [x, z] = toScene(model.robot.x, model.robot.y);
		robot.position.set(x, 1, z);
		scene.add(robot);
	}

	// --- Room labels ---------------------------------------------------------------------------
	// Sprites, so they face the camera from every angle: a label lying flat on the floor is
	// unreadable from the side, and one standing upright is unreadable from above.
	for (const label of model.labels) {
		const sprite = buildLabelSprite(label.text, colours.background);
		if (!sprite) continue;
		track(sprite.material.map!);
		track(sprite.material);
		const [x, z] = toScene(label.at.x, label.at.y);
		// Floated just above the walls, so a label is never buried inside one.
		sprite.position.set(x, model.wallHeight * 1.6, z);
		// Sized in scene units, i.e. cells: about four metres wide at 50 mm a cell. Large enough to
		// read when the whole flat is in view, which is the case this has to work in.
		const scale = Math.max(12, Math.min(model.width, model.height) * 0.12);
		sprite.scale.set(scale, scale / LABEL_ASPECT, 1);
		scene.add(sprite);
	}

	// --- Lighting ------------------------------------------------------------------------------
	// Ambient plus one directional light from above and to the side: enough for the box faces to
	// differ from one another, which is what makes the shapes readable, without any shadow work.
	scene.add(new THREE.AmbientLight(0xffffff, 1.6));
	const key = new THREE.DirectionalLight(0xffffff, 1.4);
	key.position.set(width * 0.4, Math.max(width, height), height * 0.5);
	scene.add(key);

	// --- Camera --------------------------------------------------------------------------------
	const camera = new THREE.PerspectiveCamera(CAMERA_FOV, 1, 0.1, Math.max(width, height) * 12);
	// Straight on rather than from a corner, so the map keeps the left-to-right orientation it has
	// in 2D. A corner view looks more three-dimensional and makes the same flat harder to
	// recognise when switching between the two.
	frameCamera(camera, model, 1);
	camera.lookAt(centre);

	return {
		scene,
		camera,
		robot,
		dispose: () => {
			for (const resource of disposables) resource.dispose();
			scene.clear();
		},
	};
}

/**
 * Paints the floor: the room bitmap, with the driven path stroked on top.
 *
 * ## Why a canvas and not the bitmap directly
 *
 * The rooms are pixels and could be a `DataTexture`, but the path is a set of strokes with widths
 * and opacities - rasterising those by hand would mean writing a line renderer and keeping it in
 * agreement with the 2D view's SVG. Drawing both into a canvas reuses the exact same path data,
 * so the two views cannot disagree about where the robot has been.
 *
 * ## Colour space
 *
 * `colorSpace` is set explicitly. three.js renders to sRGB, and a texture that does not say what
 * space its data is in is treated as linear and converted again on the way out - which washes
 * every room colour out towards white. The symptom looks like a lighting problem and is not.
 */
function buildFloorTexture(model: Map3DModel): THREE.Texture {
	const { floor, trail } = model;
	const canvas = document.createElement("canvas");
	canvas.width = floor.width;
	canvas.height = floor.height;

	const context = canvas.getContext("2d");
	if (context) {
		context.putImageData(new ImageData(floor.rgba, floor.width, floor.height), 0, 0);

		// Same widths, colours and order as the 2D overlay: the wide mopping band first, the thin
		// vacuum line over it.
		context.strokeStyle = "#ffffff";
		context.lineJoin = "round";

		if (trail.mop) {
			context.globalAlpha = 0.33;
			context.lineWidth = 8;
			context.lineCap = "butt";
			context.stroke(new Path2D(trail.mop));
		}
		if (trail.vacuum) {
			context.globalAlpha = 0.85;
			context.lineWidth = 1.1;
			context.lineCap = "round";
			context.stroke(new Path2D(trail.vacuum));
		}
		context.globalAlpha = 1;
	}

	const texture = new THREE.CanvasTexture(canvas);
	// See the note above: without this every room colour comes out pale.
	texture.colorSpace = THREE.SRGBColorSpace;
	// Nearest-neighbour when magnified keeps cell edges hard, the same choice the 2D canvas makes;
	// mipmaps keep the floor from shimmering when it is small on screen.
	texture.magFilter = THREE.NearestFilter;
	texture.minFilter = THREE.LinearMipmapLinearFilter;
	texture.generateMipmaps = true;
	texture.needsUpdate = true;
	return texture;
}

/** Vertical field of view, in degrees. */
export const CAMERA_FOV = 45;

/**
 * Elevation of the default view, in degrees above the floor.
 *
 * Steep enough that the floor plan reads as a plan, shallow enough that the walls have visible
 * height. At 90 it would be the 2D map with extra steps; at 20 the near wall hides the room
 * behind it.
 */
const CAMERA_ELEVATION = 52;

/**
 * Places the camera so the whole map fits, whatever shape the window is.
 *
 * The map is enclosed in a sphere and the distance chosen so that sphere fits both the vertical
 * and the horizontal field of view - conservative for a long thin flat, but never wrong, and it
 * cannot leave part of the map off the screen the way fitting one axis can.
 *
 * Called again on every resize: a tall narrow window and a wide short one need very different
 * distances for the same map, and framing it once at startup leaves one of the two wrong.
 *
 * @param aspect Viewport width divided by height.
 */
export function frameCamera(camera: THREE.PerspectiveCamera, model: Map3DModel, aspect: number): void {
	const radius = Math.hypot(model.width, model.height) / 2;

	const vertical = (camera.fov * Math.PI) / 180;
	// The horizontal field follows from the vertical one and the aspect ratio.
	const horizontal = 2 * Math.atan(Math.tan(vertical / 2) * Math.max(aspect, 0.0001));

	// A little margin, so the outermost wall is not flush against the edge of the canvas.
	const distance = 1.08 * Math.max(radius / Math.sin(vertical / 2), radius / Math.sin(horizontal / 2));

	const elevation = (CAMERA_ELEVATION * Math.PI) / 180;
	camera.position.set(0, distance * Math.sin(elevation), distance * Math.cos(elevation));
	camera.updateProjectionMatrix();
}

/** Width-to-height ratio of a label sprite's canvas. */
const LABEL_ASPECT = 4;

/**
 * Renders a room name onto a sprite.
 *
 * Text in three.js means either a font loader and generated geometry, or a picture of the text.
 * A picture is the right trade here: the labels are short, they never animate, and a sprite keeps
 * them facing the camera at every orbit angle - which is what makes them readable at all in a
 * view you can spin.
 *
 * Returns null where a 2D context cannot be had, so a browser that refuses one loses the labels
 * rather than the whole scene.
 */
function buildLabelSprite(text: string, backgroundColour: number): THREE.Sprite | null {
	const height = 128;
	const canvas = document.createElement("canvas");
	canvas.width = height * LABEL_ASPECT;
	canvas.height = height;

	const context = canvas.getContext("2d");
	if (!context) return null;

	context.font = `700 ${Math.round(height * 0.52)}px sans-serif`;
	context.textAlign = "center";
	context.textBaseline = "middle";

	// Outlined in the scene's own background colour, so a label stays legible over a pale floor
	// and over a dark wall alike - the same trick the 2D labels use.
	const outline = `#${backgroundColour.toString(16).padStart(6, "0")}`;
	context.lineJoin = "round";
	context.lineWidth = height * 0.14;
	context.strokeStyle = outline;
	context.strokeText(text, canvas.width / 2, canvas.height / 2);

	context.fillStyle = "#ffffff";
	context.fillText(text, canvas.width / 2, canvas.height / 2);

	const texture = new THREE.CanvasTexture(canvas);
	texture.colorSpace = THREE.SRGBColorSpace;
	texture.needsUpdate = true;

	const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
	return new THREE.Sprite(material);
}
