import { isYes } from '../attributes/index.ts';

// No Electron here: the Node tests load it.

// Only the settings the tag names.
export type WindowSettings = { width?: number; height?: number; minWidth?: number; minHeight?: number; resizable?: boolean; titleBar?: boolean; frame?: boolean; transparent?: boolean; onTop?: boolean; allSpaces?: boolean; clickThrough?: boolean; private?: boolean; dock?: boolean; blur?: boolean; mark?: boolean };

const SIZES = { width: 'width', height: 'height', 'min-width': 'minWidth', 'min-height': 'minHeight' } as const;
const SWITCHES = { resizable: 'resizable', 'title-bar': 'titleBar', frame: 'frame', transparent: 'transparent', 'on-top': 'onTop', 'all-spaces': 'allSpaces', 'click-through': 'clickThrough', private: 'private', dock: 'dock', blur: 'blur', mark: 'mark' } as const;
export const WINDOW_ATTRIBUTES = ['size', ...Object.keys(SIZES), ...Object.keys(SWITCHES)];

// Attributes, as <meta name="papp-window" on-top frame="no" size="320x80">. window.open's features take the same, as on-top, frame=no, size=320x80.
export function windowSettings(attributes: Map<string, { value: string; quoted: boolean }>, tag: string) {
  const settings: WindowSettings = {};

  for (const [key, given] of attributes) {
    const value = given.value.trim().toLowerCase();

    if (key === 'name') {
      continue;
    } else if (key === 'size' && (attributes.has('width') || attributes.has('height'))) {
      throw new Error(`${tag}: size sets the width and height. Keep size, or width and height.`);
    } else if (key === 'size' && /^[1-9]\d{1,3}x[1-9]\d{1,3}$/.test(value)) {
      const [width, height] = value.split('x').map(Number);
      Object.assign(settings, { width, height });
    } else if (Object.hasOwn(SIZES, key) && /^[1-9]\d{1,3}$/.test(value)) {
      settings[SIZES[key as keyof typeof SIZES]] = +value;
    } else if (Object.hasOwn(SWITCHES, key)) {
      settings[SWITCHES[key as keyof typeof SWITCHES]] = isYes(given, tag);
    } else {
      throw new Error(`${tag}: bad window setting ${key}${given.value ? `="${given.value}"` : ''}. Sizes take pixels, as in size="900x600" or min-width="400". The rest are bare for yes, as in on-top, or ="no", as in frame="no".`);
    }
  }

  return settings;
}

// window.open's features, as on-top, frame=no, size=320x80: read as the tag's attributes.
export function windowFeatures(features: string) {
  const attributes = new Map<string, { value: string; quoted: boolean }>();

  for (const feature of features.split(',').map(each => each.trim()).filter(Boolean)) {
    const [key, value = ''] = feature.split('=').map(part => part.trim());
    attributes.set(key.toLowerCase(), { value, quoted: true });
  }

  return windowSettings(attributes, `window.open features "${features}"`);
}
