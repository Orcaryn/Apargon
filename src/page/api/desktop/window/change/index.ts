import type { Rectangle } from 'electron';
import type { Permissions } from '../../../../../permissions/tags/index.ts';

type Size = { width: number; height: number };
// minSize and maxSize: 0 on a side is no limit. aspectRatio: width over height, 0 for none. file: the file the window shows, named in its title bar (macOS); edited: the dot for unsaved changes.
// shape: the rectangles of the window, in its own pixels, that are drawn and take clicks; [] is the whole window (Windows and Linux).
export type WindowChange = { onTop?: boolean; allSpaces?: boolean; clickThrough?: boolean; private?: boolean; opacity?: number; bounds?: Partial<Rectangle>; visible?: boolean; state?: 'normal' | 'minimized' | 'maximized'; resizable?: boolean; minSize?: Size; maxSize?: Size; aspectRatio?: number; file?: string | null; edited?: boolean; shape?: Rectangle[] };
// Below this a window on top would be a pane no one sees, catching the clicks meant for the app under it.
const LEAST_OPACITY = 0.3;

// Refuses a change the tags did not turn on, or one the window cannot take. resizable and frame: as this window opened.
export function checkChange(change: WindowChange, permissions: Permissions, { resizable, frame }: { resizable: boolean; frame: boolean }) {
  const { onTop = false, allSpaces = false, clickThrough: mayClickThrough = false, private: privateWindow = false } = permissions.window ?? {};

  if (change.onTop && !onTop) {
    throw new Error('Apargon: this window may not stay on top. Ask for it with <meta name="papp-window" on-top>.');
  } else if (change.allSpaces && !allSpaces) {
    throw new Error('Apargon: this window may not show on every desktop. Ask for it with <meta name="papp-window" all-spaces>.');
  } else if (change.clickThrough && !mayClickThrough) {
    throw new Error('Apargon: this window may not let clicks pass through. Ask for it with <meta name="papp-window" click-through>.');
  } else if (change.private && !privateWindow) {
    throw new Error('Apargon: this window may not hide from screen sharing. Ask for it with <meta name="papp-window" private>.');
  } else if (change.visible === false && !permissions.use.includes('background')) {
    throw new Error('Apargon: this .papp file may not hide its window: it would run with nothing to show it. Ask for it with <meta name="papp-use" content="background">, which gives it a tray icon.');
  } else if (change.opacity !== undefined && !(change.opacity >= LEAST_OPACITY && change.opacity <= 1)) {
    throw new Error(`Apargon: opacity takes a number from ${LEAST_OPACITY} to 1.`);
  } else if (!resizable && (change.resizable || change.bounds?.width !== undefined || change.bounds?.height !== undefined || change.state === 'maximized')) {
    throw new Error('Apargon: this window has a fixed size: papp-window says resizable="no".');
  } else if (change.state !== undefined && !['normal', 'minimized', 'maximized'].includes(change.state)) {
    throw new Error("Apargon: state takes normal, minimized or maximized. For fullscreen, use the .papp file's own requestFullscreen().");
  } else if ([change.minSize, change.maxSize].some(size => size && ![size.width, size.height].every(side => Number.isInteger(side) && side >= 0))) {
    throw new Error('Apargon: minSize and maxSize take { width, height } in whole pixels; 0 on a side is no limit.');
  } else if (change.aspectRatio !== undefined && !(change.aspectRatio >= 0)) {
    throw new Error('Apargon: aspectRatio takes width over height, such as 16 / 9, or 0 for none.');
  } else if (change.shape?.length && frame) {
    throw new Error('Apargon: a window with a frame keeps its shape. Ask for it with <meta name="papp-window" frame="no">.');
  } else if (change.shape?.some(rect => ![rect.x, rect.y, rect.width, rect.height].every(Number.isInteger))) {
    throw new Error('Apargon: shape takes a list of { x, y, width, height } in whole pixels, or [] for the whole window.');
  }
}
