/**
 * The styles of the shadow root - of the element and of the content of its dialog. The element fills the box of the
 * host, has a transparent background and inherits `color` and `font`; the colors of buttons and states come from the
 * theme of the host (`--iob-*`).
 *
 * Which parts show is decided by container queries on the box (`.mount`, `container-type: size`), never by
 * measuring: icon beside or above the text, buttons or none, and with `auto` the map or the status. The map keeps its
 * shape by the container units of its own area (`.map-area`).
 */
export const STYLES = `
:host {
    display: block;
    width: 100%;
    height: 100%;
}
.mount {
    width: 100%;
    height: 100%;
    /* the size of the box does not depend on what is in it - no loop between measuring and laying out */
    container-type: size;
}
.tile {
    --tint: color-mix(in srgb, currentColor 10%, transparent);
    --tint-strong: color-mix(in srgb, currentColor 18%, transparent);
    box-sizing: border-box;
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
    cursor: pointer;
    user-select: none;
    -webkit-tap-highlight-color: transparent;
}
.tile.edit {
    cursor: default;
    pointer-events: none;
}

/* ---- the status ---- */
.status-view {
    box-sizing: border-box;
    position: relative;
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: clamp(2px, 3cqmin, 8px);
    padding: clamp(4px, 5cqmin, 12px);
    text-align: center;
}
.robot-icon {
    flex: none;
    width: clamp(22px, 26cqmin, 56px);
    height: clamp(22px, 26cqmin, 56px);
    color: var(--iob-text-secondary);
}
.working .robot-icon {
    color: var(--iob-primary);
}
.texts {
    min-width: 0;
    max-width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1px;
}
.caption {
    max-width: 100%;
    font-size: clamp(9px, 7.5cqmin, 13px);
    line-height: 1.2;
    color: var(--iob-text-secondary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
.state {
    font-size: clamp(11px, 10cqmin, 18px);
    font-weight: 600;
    line-height: 1.15;
    /* two lines at most: a long state wraps once instead of being cut to its first word */
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
}
.battery {
    flex: none;
    display: inline-flex;
    align-items: center;
    gap: 2px;
    font-size: clamp(10px, 8cqmin, 14px);
    line-height: 1;
    color: var(--iob-text-secondary);
    font-variant-numeric: tabular-nums;
}
.battery svg {
    width: clamp(12px, 9cqmin, 18px);
    height: clamp(12px, 9cqmin, 18px);
    fill: currentColor;
}
.battery.low {
    color: var(--iob-warning);
}
.progress {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 3px;
    background: color-mix(in srgb, var(--iob-primary) 25%, transparent);
}
.progress > div {
    height: 100%;
    background: var(--iob-primary);
}
/* wide and short, as a strip is: icon beside the text, buttons at the end */
@container (min-aspect-ratio: 3/2) {
    .status-view {
        flex-direction: row;
        justify-content: flex-start;
        text-align: left;
    }
    .status-view .texts {
        flex: 1;
        align-items: flex-start;
    }
}
@container (max-height: 150px) and (max-aspect-ratio: 3/2) {
    .robot-icon {
        display: none;
    }
}
@container (max-height: 100px) and (max-aspect-ratio: 3/2) {
    .status-view .controls {
        display: none;
    }
}
@container (max-width: 200px) and (min-aspect-ratio: 3/2) {
    .status-view .controls {
        display: none;
    }
}

/* ---- the buttons ---- */
.controls {
    flex: none;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: clamp(4px, 3cqmin, 10px);
}
button.command {
    --size: clamp(26px, 14cqmin, 40px);
    box-sizing: border-box;
    width: var(--size);
    height: var(--size);
    margin: 0;
    padding: 0;
    border: none;
    border-radius: 50%;
    background: var(--tint);
    color: inherit;
    font: inherit;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
}
button.command:hover:not(:disabled) {
    background: var(--tint-strong);
}
button.command:focus-visible {
    outline: 2px solid var(--iob-primary);
    outline-offset: 1px;
}
button.command:disabled {
    cursor: default;
}
button.command svg {
    width: 62%;
    height: 62%;
    fill: currentColor;
    flex: none;
}
.tile .command.start {
    color: var(--iob-success);
}
.tile .command.pause {
    color: var(--iob-warning);
}
.tile .command.stop {
    color: var(--iob-error);
}
.tile .command.dock {
    color: var(--iob-primary);
}

/* ---- the map ---- */
.map-view {
    box-sizing: border-box;
    position: relative;
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    gap: clamp(2px, 1.5cqmin, 6px);
    padding: clamp(4px, 2.5cqmin, 10px);
}
.map-head,
.map-foot {
    flex: none;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 8px;
}
.map-head .caption {
    flex: 1;
    font-size: clamp(12px, 4.5cqi, 17px);
    font-weight: 600;
    color: inherit;
}
.map-foot .state {
    flex: 1;
    min-width: 0;
    display: block;
    font-size: clamp(11px, 4cqi, 15px);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
.map-foot button.command {
    --size: clamp(26px, 9cqmin, 36px);
}
.map-area {
    flex: 1 1 auto;
    min-width: 0;
    min-height: 0;
    position: relative;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    /* the map keeps its shape by the units of this box */
    container-type: size;
}
.map-fit {
    flex: none;
    position: relative;
    width: min(100cqw, calc(100cqh * var(--map-w) / var(--map-h)));
    height: min(100cqh, calc(100cqw * var(--map-h) / var(--map-w)));
}
.map-layer {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    display: block;
    /* one pixel per cell: smoothing would blur the cell edges */
    image-rendering: pixelated;
}
svg.map-layer {
    overflow: visible;
}
.badge {
    stroke: #ffffff;
}
.badge.working {
    fill: var(--iob-primary);
}
.badge.charging {
    fill: var(--iob-success);
}
.badge.error {
    fill: var(--iob-error);
}
.labels {
    pointer-events: none;
}
.room-label {
    position: absolute;
    transform: translate(-50%, -50%);
    white-space: nowrap;
    font-size: clamp(8px, 3.4cqmin, 13px);
    font-weight: 800;
    letter-spacing: 0.2px;
    line-height: 1;
    /* the text color outlined in the background: legible on every room color, in a light and a dark theme */
    color: var(--iob-text);
    text-shadow:
        0 0 2px var(--iob-background),
        0 0 2px var(--iob-background),
        0 0 3px var(--iob-background);
}
.floor-image {
    width: 100%;
    height: 100%;
    object-fit: contain;
    image-rendering: pixelated;
    display: block;
}
.map-message {
    padding: 8px;
    text-align: center;
    font-size: clamp(11px, 5cqmin, 14px);
    color: var(--iob-text-secondary);
}
.spinner {
    width: 24px;
    height: 24px;
    box-sizing: border-box;
    border-radius: 50%;
    border: 3px solid color-mix(in srgb, var(--iob-primary) 25%, transparent);
    border-top-color: var(--iob-primary);
    animation: dreame-spin 0.9s linear infinite;
}
@keyframes dreame-spin {
    to {
        transform: rotate(360deg);
    }
}
@media (prefers-reduced-motion: reduce) {
    .spinner {
        animation-duration: 3s;
    }
}

/* ---- auto: the map where there is room for it, the status elsewhere ---- */
.tile.auto .map-view {
    display: none;
}
@container (min-width: 240px) and (min-height: 220px) {
    .tile.auto .map-view {
        display: flex;
    }
    .tile.auto .status-view {
        display: none;
    }
}

/* ---- hint and failure ---- */
.tile.hint {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 8px;
    text-align: center;
    cursor: default;
    font-size: clamp(11px, 5cqmin, 15px);
    color: var(--iob-text-secondary);
}
.hint-icon {
    width: clamp(18px, 12cqmin, 36px);
    height: clamp(18px, 12cqmin, 36px);
}
.failure {
    position: absolute;
    left: 4px;
    right: 4px;
    bottom: 6px;
    padding: 2px 6px;
    border-radius: var(--iob-border-radius);
    background: var(--iob-error);
    color: #ffffff;
    font-size: 12px;
    text-align: center;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

/* ---- the dialog ---- */
.dialog-root {
    width: 100%;
    height: 100%;
    container-type: size;
    color: var(--iob-text);
    font-family: var(--iob-font-family);
    font-size: var(--iob-font-size);
}
.detail {
    box-sizing: border-box;
    width: 100%;
    height: 100%;
    display: flex;
    gap: 16px;
}
.panel {
    flex: 0 0 260px;
    min-height: 0;
    overflow: auto;
    display: flex;
    flex-direction: column;
    gap: 12px;
}
.panel-state {
    font-size: 1.3em;
    font-weight: 600;
    line-height: 1.25;
}
.panel-details,
.figure-label {
    color: var(--iob-text-secondary);
    font-size: 0.85em;
}
.figures {
    display: flex;
    gap: 16px;
}
.figure-value {
    font-size: 1.1em;
    font-weight: 700;
    line-height: 1.2;
    font-variant-numeric: tabular-nums;
}
.progress.inline {
    position: static;
    height: 4px;
    border-radius: 2px;
    overflow: hidden;
}
.controls.labelled {
    justify-content: flex-start;
    flex-wrap: wrap;
    gap: 8px;
}
.controls.labelled button.command {
    width: auto;
    height: auto;
    padding: 6px 14px;
    gap: 6px;
    border-radius: var(--iob-border-radius);
    color: #ffffff;
    font-weight: 500;
}
.controls.labelled button.command svg {
    width: 20px;
    height: 20px;
}
.controls.labelled .start {
    background: var(--iob-success);
}
.controls.labelled .pause {
    background: var(--iob-warning);
}
.controls.labelled .stop {
    background: var(--iob-error);
}
.controls.labelled .dock {
    background: var(--iob-primary);
    color: var(--iob-primary-contrast);
}
.controls.labelled button.command:hover:not(:disabled) {
    filter: brightness(1.1);
}
.panel .failure {
    position: static;
    white-space: normal;
}
/* narrow, as on a phone: the panel under the map */
@container (max-width: 640px) {
    .detail {
        flex-direction: column;
    }
    .panel {
        flex: none;
        max-height: 50%;
    }
}
`;
