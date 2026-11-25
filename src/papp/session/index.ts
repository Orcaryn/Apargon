import { app, BrowserWindow, desktopCapturer, dialog, net, session } from 'electron';
import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import { describe } from '../../permissions/describe/index.ts';
import type { Permissions, Use } from '../../permissions/tags/index.ts';
import type { Yes } from '../../shared/wire/protocol/index.ts';
import { callTrampoline, tellTrampoline, trampolineBytes } from '../channel/index.ts';
import { liveReload } from './liveReload/index.ts';
import { fileServer } from './serve/index.ts';

export function createPappSession(papp: string, permissions: Permissions, yes: Yes | null, canChange: (file: string) => boolean) {
  const { use } = permissions;
  const pappSession = session.defaultSession;
  const reloadWindows = () => BrowserWindow.getAllWindows().filter(win => win.webContents.session === pappSession).forEach(win => win.webContents.reloadIgnoringCache());
  const serve = fileServer(papp, yes, describe(permissions), canChange, liveReload(papp, canChange, reloadWindows), (file, hash) => tellTrampoline('code', { file, hash }), request => net.fetch(request, { bypassCustomProtocolHandlers: true }), reloadWindows, () => tellTrampoline('restart'));
  pappSession.protocol.handle('file', serve);

  // The sandbox may not write where the user picks. Chromium downloads into Apargon's data folder, and the trampoline saves it on, as papp.save.
  pappSession.on('will-download', (_event, item) => {
    const file = path.join(app.getPath('userData'), `download-${randomUUID()}`);
    item.setSavePath(file);
    item.once('done', async (_done, state) => {
      if (state === 'completed') {
        const bytes = fs.createReadStream(file);
        await callTrampoline('save', { file: item.getFilename(), data: trampolineBytes.send(bytes) }).catch((err: Error) => dialog.showErrorBox('Apargon', `${item.getFilename()} wasn't saved. ${err.message}`));
        bytes.destroy();
      }

      // A cancelled download leaves no file.
      fs.rmSync(file, { force: true });
    });
  });

  // Chromium asks for system-exclusive MIDI, which can also change an instrument's settings, for any MIDI access.
  const webPermissions: Partial<Record<Use, string[]>> = { clipboard: ['clipboard-read'], location: ['geolocation'], camera: ['media:video'], microphone: ['media:audio'], screen: ['display-capture'], usb: ['usb'], serial: ['serial'], hid: ['hid'], midi: ['midi', 'midiSysex'], bluetooth: ['bluetooth'] };
  // These reach nothing off the computer and write nothing outside its folders, so they need no tag, as in Chrome.
  const allowed = ['clipboard-sanitized-write', 'fullscreen', 'pointerLock', 'screen-wake-lock', 'window-management', 'idle-detection', 'local-fonts', 'keyboardLock', 'persistent-storage', 'speaker-selection', ...use.flatMap(name => webPermissions[name] ?? [])];
  pappSession.setPermissionRequestHandler((_contents, permission, answer, details) => {
    const asked = permission === 'media' && 'mediaTypes' in details ? (details.mediaTypes ?? []).map(type => `media:${type}`) : [permission];
    answer(asked.length > 0 && asked.every(name => allowed.includes(name)));
  });
  pappSession.setPermissionCheckHandler((_contents, permission, _origin, details) => allowed.includes(permission === 'media' ? `media:${details.mediaType}` : permission));

  if (use.includes('screen')) {
    // macOS 15 and later show their own picker, and never call the handler.
    pappSession.setDisplayMediaRequestHandler(
      async (_request, answer) => {
        const sources = await desktopCapturer.getSources({ types: ['screen', 'window'] });
        const picked = await pickOne('Share which screen or window?', sources.map(source => source.name));
        answer(picked === null ? {} : { video: sources[picked] });
      },
      { useSystemPicker: true }
    );
  }

  if (use.includes('usb')) {
    pappSession.on('select-usb-device', async (event, { deviceList }, choose) => {
      event.preventDefault();
      const picked = await pickOne('Give it which USB device?', deviceList.map(device => device.productName ?? `USB device ${device.vendorId}:${device.productId}`));
      choose(picked === null ? undefined : deviceList[picked].deviceId);
    });
  }

  if (use.includes('serial')) {
    pappSession.on('select-serial-port', async (event, portList, _contents, choose) => {
      event.preventDefault();
      const picked = await pickOne('Give it which serial port?', portList.map(port => port.displayName ?? port.portName));
      choose(picked === null ? '' : portList[picked].portId);
    });
  }

  if (use.includes('hid')) {
    pappSession.on('select-hid-device', async (event, { deviceList }, choose) => {
      event.preventDefault();
      const picked = await pickOne('Give it which input device?', deviceList.map(device => device.name));
      choose(picked === null ? null : deviceList[picked].deviceId);
    });
  }

  return pappSession;
}

// Bluetooth asks each window, not the session.
export function chooseBluetooth(contents: Electron.WebContents) {
  contents.on('select-bluetooth-device', async (event, devices, choose) => {
    event.preventDefault();
    const picked = await pickOne('Give it which Bluetooth device?', devices.map(device => device.deviceName || device.deviceId));
    choose(picked === null ? '' : devices[picked].deviceId);
  });
}

// In this process's own dialog, as text: the .papp file cannot draw the choice or make it.
async function pickOne(message: string, names: string[]) {
  const { response } = await dialog.showMessageBox({ type: 'question', message, detail: names.length ? '' : 'None found.', buttons: [...names, 'Cancel'], defaultId: names.length, cancelId: names.length });

  return response === names.length ? null : response;
}
