import type { TrayItem } from '../../src/shared/channel.ts';
import { pageMenuItems, trayItems, type PageMenuItem } from '../../src/shared/menuItems.ts';

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

const tray = trayItems(
  [
    { label: 'Run', id: 'run', ...smuggled },
    { separator: true, ...smuggled },
  ] as TrayItem[],
  id => clicked.push(id)
);
(tray[0].click as () => void)();

// JSON leaves out the clicks, which clicked checks: Apargon's, sending the id.
const checks = [
  {
    name: 'menu items keep only label, keys and submenu',
    ok: JSON.stringify(menu) === JSON.stringify([{ label: 'Run', accelerator: 'CmdOrCtrl+R', submenu: [{ type: 'separator' }, { label: 'Quit' }] }]),
  },
  { name: 'tray items keep only label', ok: JSON.stringify(tray) === JSON.stringify([{ label: 'Run' }, { type: 'separator' }]) },
  { name: 'clicks send the id', ok: clicked.join() === 'run,quit,run' },
];

checks.forEach(({ name, ok }) => console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`));
process.exit(checks.every(({ ok }) => ok) ? 0 : 1);
