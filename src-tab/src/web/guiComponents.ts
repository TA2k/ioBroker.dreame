/**
 * What the page takes from `@iobroker/gui-components`: the connection and `I18n`, nothing else.
 *
 * The web build points every import of the package here (see `vite.web.config.ts`). The page
 * needs no admin app frame, and the package's entry drags in cronstrue, cropperjs, the type
 * detector and parts of react-icons, which tree-shaking cannot take out again - over a megabyte
 * for two classes. `Connection` is the socket-client's own, which gui-components only re-exports.
 *
 * A view that starts importing anything else from the package fails this build with a missing
 * export, rather than quietly pulling the rest back in. The vis-2 build does the same
 * (`src-widgets/src/guiComponents.ts`).
 */

export { I18n } from "@iobroker/gui-components/build/i18n.js";
export { Connection } from "@iobroker/socket-client";
