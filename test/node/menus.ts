import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TrayItem } from '../../src/shared/protocol.ts';
import { cleanTrayItems, pageMenuItems, trayItems, type PageMenuItem } from '../../src/shared/menuItems.ts';

// Keys Electron reads that a page may write beside its label and id: none may reach Electron.
const smuggled = {
  role: 'quit',
  type: 'checkbox',
  enabled: false,
  visible: false,
  checked: true,
  sublabel: 'x',
  icon: '/etc/passwd',
  registerAccelerator: true,
  toolTip: 'x',
  before: ['x'],
  after: ['x'],
};
const clicked: (string | undefined)[] = [];
const menu = pageMenuItems(
  [
    {
      label: 'Run',
      id: 'run',
      keys: 'CmdOrCtrl+R',
      ...smuggled,
      submenu: [
        { separator: true, ...smuggled },
        { label: 'Quit', id: 'quit', ...smuggled },
      ],
    },
  ] as PageMenuItem[],
  id => clicked.push(id)
);
(menu[0].click as () => void)();
((menu[0].submenu as typeof menu)[1].click as () => void)();

// A tray item's checked is its own: a checkbox, or with radio a radio button. Every other key goes, type and role too.
const { checked: _checked, ...notChecked } = smuggled;
const tray = trayItems(
  cleanTrayItems([
    { label: 'Run', id: 'run', ...notChecked },
    { separator: true, ...smuggled },
    { label: 'Mode', id: 'ignored', ...notChecked, submenu: [{ label: 'Fast', id: 'fast', ...smuggled, radio: true }] },
  ] as TrayItem[]),
  id => clicked.push(id)
);
(tray[0].click as () => void)();
((tray[2].submenu as typeof tray)[0].click as () => void)();
const nested = (depth: number): unknown[] => [depth === 1 ? { label: 'x', id: 'x' } : { label: 'x', submenu: nested(depth - 1) }];

// JSON leaves out the clicks, which clicked checks: Apargon's, sending the id.
test('menu items keep only label, keys and submenu', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(menu)), [{ label: 'Run', accelerator: 'CmdOrCtrl+R', submenu: [{ type: 'separator' }, { label: 'Quit' }] }]);
});

test('tray items keep only label, checked and submenu', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(tray)), [{ label: 'Run' }, { type: 'separator' }, { label: 'Mode', submenu: [{ label: 'Fast', type: 'radio', checked: true }] }]);
});

test('tray items nest 3 deep, 50 to a menu', () => {
  assert.equal(cleanTrayItems(nested(3)).length, 1);
  assert.throws(() => cleanTrayItems(nested(4)), /nested up to 3 deep/);
  assert.throws(() => cleanTrayItems(Array.from({ length: 51 }, () => ({ separator: true }))), /up to 50 items/);
  assert.throws(() => cleanTrayItems([{ label: 'x', submenu: 'not a list' }]), /^Error: Apargon: /);
});

test('clicks send the id', () => {
  assert.deepEqual(clicked, ['run', 'quit', 'run', 'fast']);
});
