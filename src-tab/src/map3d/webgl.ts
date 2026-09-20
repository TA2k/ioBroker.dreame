/**
 * Whether this browser can render the 3D view at all.
 *
 * Checked before a renderer is created rather than catching the failure afterwards: three.js
 * throws when it cannot get a context, and an exception during render is a blank tab, whereas a
 * check up front is a sentence explaining why the 2D view is the one on offer.
 *
 * Real cases where this is false: a remote desktop session without GPU passthrough, a browser
 * with hardware acceleration switched off, and a machine that has already handed out its
 * maximum number of WebGL contexts.
 */
export function isWebGlAvailable(): boolean {
	try {
		const canvas = document.createElement("canvas");
		// `webgl2` first because that is what three.js asks for; the older context is enough for
		// what this scene does, so it counts as available too.
		const context = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
		if (!context) return false;

		// Free it again at once. A probe that keeps its context uses up one of the few the browser
		// allows, which is exactly the shortage this function exists to detect.
		const lose = (context as WebGLRenderingContext).getExtension("WEBGL_lose_context");
		lose?.loseContext();

		return true;
	} catch {
		return false;
	}
}
