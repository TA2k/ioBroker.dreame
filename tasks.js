'use strict';

/**
 * Puts the built widget bundles where their hosts look for them.
 *
 *   node tasks.js devices   src-devices/build -> admin/dm-widgets   (the devices app)
 *   node tasks.js vis       src-widgets/build -> widgets/dreame     (vis-2)
 *
 * Run by the `devices:build` and `vis:build` npm scripts after the bundle is built. Each target is
 * emptied first, so no chunk of an earlier build - with a different hash - is left behind to ship.
 *
 * Copied is everything the build emits except `index.html`, the stand-alone dev page, and dot
 * directories such as `.vite`. `mf-manifest.json` has to come along: the hosts read it next to the
 * remote entry to see which shared modules the bundle was built against.
 */

const fs = require('node:fs');
const path = require('node:path');

/**
 * Copies a directory's contents into another, recursively.
 *
 * @param {string} from source directory
 * @param {string} to target directory, created if missing
 * @param {(name: string) => boolean} [keep] decides for each top-level entry whether it is copied
 */
function copyDir(from, to, keep = () => true) {
  if (!fs.existsSync(from)) {
    throw new Error(`${from} does not exist - build it first`);
  }
  fs.mkdirSync(to, { recursive: true });
  for (const name of fs.readdirSync(from)) {
    if (keep(name)) {
      fs.cpSync(path.join(from, name), path.join(to, name), { recursive: true });
    }
  }
}

/**
 * Keeps a build's deliverables: no dev page, no dot directories.
 *
 * @param {string} name top-level entry of the build directory
 */
function isDeliverable(name) {
  return name !== 'index.html' && !name.startsWith('.');
}

/**
 * Empties a directory, or leaves nothing where it was.
 *
 * @param {string} dir directory to remove
 */
function clean(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

function copyDevices() {
  const target = path.join(__dirname, 'admin', 'dm-widgets');
  clean(target);
  copyDir(path.join(__dirname, 'src-devices', 'build'), target, isDeliverable);
  // The tile's icon in the devices app's catalogue, named by `common.deviceWidgets` in io-package.json.
  copyDir(path.join(__dirname, 'src-devices', 'img'), target);
  copyDir(path.join(__dirname, 'src-devices', 'src', 'i18n'), path.join(target, 'i18n'));
}

function copyVis() {
  const target = path.join(__dirname, 'widgets', 'dreame');
  clean(target);
  // `img` with the preview comes along: Vite copies `public/` into the build.
  copyDir(path.join(__dirname, 'src-widgets', 'build'), target, isDeliverable);
}

const TASKS = { devices: copyDevices, vis: copyVis };

const task = TASKS[process.argv[2]];
if (!task) {
  console.error(`Usage: node tasks.js <${Object.keys(TASKS).join('|')}>`);
  process.exit(1);
}
task();
