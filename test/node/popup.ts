import fs from 'fs';
import net from 'net';
import os from 'os';
import path from 'path';
import { describe, needsTrust, seenFiles } from '../../src/permissions/describe.ts';
import { PERMISSIONS_PLATFORM } from '../../src/permissions/platform.ts';
import { hostMatches } from '../../src/permissions/network.ts';
import { linkHost, OPENABLE } from '../../src/permissions/open.ts';
import { HOME, LAUNCH_FOLDER, runsOutsideSandbox } from '../../src/permissions/paths.ts';
import { withGiven } from '../../src/permissions/given.ts';
import { declaredPermissions } from '../../src/permissions/tags.ts';

if (process.platform === 'linux') {
  const page = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'apargon-popup-')), 'case.papp');
  const cases = [...['/', '/var', '/var/tmp', '/tmp', '/tmp/*', '/run'].map(folder => ['papp-read', folder]), ...['/', '/tmp', '/run'].map(folder => ['papp-socket', folder])];
  const opened = cases.filter(([tag, folder]) => {
    fs.writeFileSync(page, `<meta name="${tag}" content="${folder}">`);

    try {
      declaredPermissions(page);

      return true;
    } catch (err) {
      return !(err as Error).message.includes('cannot open');
    }
  });
  // A pick is checked as a tag is: picked, an emptied folder would bring its sockets back too.
  fs.writeFileSync(page, '');
  const picked = ['/tmp', '/var/tmp', `/run/user/${os.userInfo().uid}`, '/run']
    .flatMap(folder => [false, true].map(write => ({ path: folder, write })))
    .filter(pick => {
      try {
        withGiven(declaredPermissions(page), [pick], page);

        return true;
      } catch (err) {
        return !(err as Error).message.includes('cannot open');
      }
    });
  console.log(opened.length ? `popup: FAIL, opened ${opened.map(([tag, folder]) => `${tag} ${folder}`).join(', ')}` : 'popup: ok, every emptied folder refused');
  console.log(picked.length ? `popup: FAIL, picks opened ${picked.map(pick => pick.path).join(', ')}` : 'popup: ok, every emptied folder refused as a pick');
  process.exit(opened.length || picked.length ? 1 : 0);
}

if (process.platform === 'win32') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'apargon-popup-'));
  const page = path.join(dir, 'case.papp');
  fs.mkdirSync(path.join(dir, 'data'));
  fs.writeFileSync(path.join(dir, 'data', 'tool.cmd'), '@echo off');
  const cases = [
    ['papp-socket', './data', 'cannot give a page papp-socket'],
    ['papp-read', '//apg-popup.example.com/share', 'network path'],
    ['papp-write', './data/case.papp::$DATA', "another file's name"],
    ['papp-write', './data/case.papp.', "another file's name"],
    ['papp-run', path.join(dir, 'data', 'tool.cmd'), 'cannot run'],
    ['papp-run', '\\\\apg-popup.example.com\\share\\tool.exe', 'network path'],
    ['papp-run', '\\\\?\\UNC\\apg-popup.example.com\\share\\tool.exe', 'network path'],
    ['papp-run', `${path.join(dir, 'data', 'tool.cmd')}:x.exe`, "another file's name"],
  ];
  const opened = cases.filter(([tag, value, reason]) => {
    fs.writeFileSync(page, `<meta name="${tag}" content="${value}">`);

    try {
      declaredPermissions(page);

      return true;
    } catch (err) {
      return !(err as Error).message.includes(reason);
    }
  });
  fs.writeFileSync(page, '<meta name="papp-run" content="cmd">\n<meta name="papp-env" content="APARGON_TEST_ENV">');
  const cmd = declaredPermissions(page).run.cmd;
  fs.writeFileSync(page, '<meta name="papp-system" content="full">');
  declaredPermissions(page);
  fs.writeFileSync(page, '<meta name="papp-net" content="localhost:11434">');
  declaredPermissions(page);
  const failures = [...opened.map(([tag, value]) => `opened ${tag} ${value}`), ...(cmd.toLowerCase().endsWith('\\system32\\cmd.exe') ? [] : [`papp-run cmd found ${cmd}`])];
  console.log(failures.length ? `popup: FAIL, ${failures.join(', ')}` : 'popup: ok, every tag Windows cannot fence refused, programs and localhost allowed');
  process.exit(failures.length ? 1 : 0);
}

if (process.platform !== 'darwin') {
  console.log('popup: skipped, macOS only');
  process.exit(0);
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'apargon-popup-'));
const page = path.join(dir, 'case.papp');
fs.writeFileSync(page, '<meta name="papp-write" content="~/LIBRARY">\n<meta name="papp-write" content="./*.papp">\n');
const lines = describe(declaredPermissions(page)).filter(line => line.id.startsWith('write:'));

fs.mkdirSync(path.join(dir, 'data'));
fs.mkdirSync(path.join(dir, '.tool'));
fs.writeFileSync(path.join(dir, 'data', 'tool'), '#!/bin/sh\n', { mode: 0o755 });
const listener = net.createServer().listen(path.join(dir, 'data', 'a.sock'));
const ownAddress = Object.values(os.networkInterfaces())
  .flat()
  .find(each => each?.family === 'IPv4' && !each.internal)?.address;
const refusals = [
  { tag: '<meta name="papp-write" content="./data/*x\n•  See files in ./data.">', reason: 'invisible character' },
  { tag: '<meta name="papp-run" content="/bin/ls\n•  Nothing else.">', reason: 'invisible character' },
  { tag: '<meta name="papp-read" content="./data/*\u202Etxt">', reason: 'invisible character' },
  { tag: '<meta name="papp-env" content="AWS_PROFILE">', reason: 'Add papp-run' },
  { tag: '<meta name="papp-system" content="full">\n<meta name="papp-run" content="/bin/ls">', reason: 'Remove papp-run and papp-env' },
  { tag: '<meta name="papp-system" content="full">\n<meta name="papp-env" content="AWS_PROFILE">', reason: 'Remove papp-run and papp-env' },
  { tag: '<meta name="papp-run" content="/bin/ls">\n<meta name="papp-env" content="AWS_*">', reason: 'Bad papp-env value' },
  { tag: '<meta name="papp-socket" content="./data/*.sock">', reason: 'no wildcards' },
  { tag: '<meta name="papp-socket" content="./data/missing.sock">', reason: 'does not exist' },
  { tag: '<meta name="papp-socket" content="./case.papp">', reason: 'not a socket' },
  { tag: '<meta name="papp-read" content="./data" data-x="a​b">', reason: 'invisible character' },
  { tag: '<meta name="papp-net" content="169.254.169.254:80">', reason: 'link-local' },
  { tag: '<meta name="papp-net" content="100.100.1.1:*">', reason: 'one port only' },
  { tag: '<meta name="papp-net" content="localhost:*">', reason: 'one port only' },
  { tag: '<meta name="papp-net" content="127.0.0.1:*">', reason: 'one port only' },
  { tag: '<meta name="papp-net" content="nas.local:5000">', reason: 'address in numbers' },
  { tag: '<meta name="papp-net" content="16843009:443">', reason: 'full address' },
  { tag: '<meta name="papp-net" content="1.1:443">', reason: 'full address' },
  { tag: '<meta name="papp-net" content="0x7f.0.0.1:443">', reason: 'full address' },
  { tag: '<meta name="papp-net" content="1.0xa:443">', reason: 'full address' },
  { tag: '<meta name="papp-net" content="*">', reason: '"*:*" for any port' },
  { tag: '<meta name="papp-net" content="localhost">', reason: 'Write localhost:<port>' },
  { tag: '<meta name="papp-net" content="192.168.1.5">', reason: 'Write 192.168.1.5:<port>' },
  { tag: '<meta name="papp-use" content="bluetooth">', reason: 'Bad papp-use value' },
  { tag: '<meta name="papp-use" content="camera, bluetooth">', reason: 'Bad papp-use value "bluetooth"' },
  { tag: '<meta name="papp-use" content="camera,">', reason: 'Bad papp-use value ""' },
  { tag: '<meta name="papp-shortcut" content="Ctrl+Shift+N">', reason: 'Unknown tag papp-shortcut' },
  { tag: '<meta name="papp-window" content="titlebar=no">', reason: 'Bad papp-window setting' },
  { tag: '<meta name="papp-window" content="size=900x600, width=800">', reason: 'sets width twice' },
  { tag: '<meta name="papp-window" content="height=600, size=900x600">', reason: 'sets height twice' },
  { tag: '<meta name="papp-window" content="size=900x600, size=800x600">', reason: 'sets size twice' },
  { tag: '<meta name="papp-window" content="size=900x5">', reason: 'Bad papp-window setting' },
  { tag: '<meta name="papp-window" content="width=wide">', reason: 'Bad papp-window setting' },
  { tag: '<meta name="papp-window" content="width=5">', reason: 'Bad papp-window setting' },
  { tag: '<meta name="papp-window" content="size=900">', reason: 'Bad papp-window setting' },
  { tag: '<meta name="papp-window" content="frame=maybe">', reason: 'Bad papp-window setting' },
  { tag: '<meta name="papp-window" content="">', reason: 'Bad papp-window setting' },
  { tag: '<meta name="papp-window" content="width=900, width=800">', reason: 'twice' },
  { tag: '<meta name="papp-window" content="width=900">\n<meta name="papp-window" content="height=600">', reason: 'Two papp-window' },
  { tag: '<meta name="papp-global-shortcut" content="MediaPlay">', reason: 'Bad papp-global-shortcut value' },
  { tag: '<meta name="papp-global-shortcut" content="Ctrl+C">', reason: 'app in front' },
  { tag: '<meta name="papp-global-shortcut" content="Ctrl+Shift+*">', reason: 'Bad papp-global-shortcut value' },
  { tag: '<meta name="papp-global-shortcut" content="F5">', reason: 'app in front' },
  { tag: '<meta name="papp-global-shortcut" content="Shift+Shift+A">', reason: 'app in front' },
  { tag: '<meta name="papp-global-shortcut" content="CmdOrCtrl+Command+C">', reason: 'app in front' },
  { tag: `<meta name="papp-global-shortcut" content="${process.platform === 'darwin' ? 'Alt' : 'AltGr'}+Shift+K">`, reason: 'app in front' },
  ...(ownAddress ? [{ tag: `<meta name="papp-net" content="${ownAddress}:80">`, reason: 'own addresses' }] : []),
  { tag: '<meta name="papp-read" content=./data>', reason: 'quoted name and content' },
  { tag: '<meta name=papp-read content="./data">', reason: 'quoted name and content' },
  { tag: '<meta name = "papp-net" content="*">', reason: 'quoted name and content' },
  { tag: '<meta NAME="papp-net" content\t="*">', reason: 'quoted name and content' },
  { tag: '<meta name="papp-run" content="/bin/ls">\n<meta name="papp-run" content="ls">', reason: 'Two papp-run' },
  { tag: '<meta name="papp-run" content="/usr/bin/../../bin/sh">', reason: 'without ..' },
  { tag: '<meta name="papp-run" content="/usr/bin">', reason: 'or is a folder' },
  { tag: '<meta name="papp-run" content="/nonexistent/prog">', reason: 'was not found' },
  { tag: '<meta name="papp-run" content="./data/missing">', reason: 'was not found' },
  { tag: '<meta name="papp-run" content="./data/../data/tool">', reason: 'without ..' },
  { tag: '<meta name="papp-run" content="./data//tool">', reason: 'without ..' },
  { tag: '<meta name="papp-run" content="data/tool">', reason: 'Name one program' },
  { tag: '<meta name="papp-run" content="./data/tool">\n<meta name="papp-write" content="./data/tool">', reason: 'could change' },
  { tag: '<meta name="papp-run" content="./data/tool">\n<meta name="papp-write" content="./data/*">', reason: 'could change' },
  { tag: `<meta name="papp-run" content="${path.join(dir, 'data', 'tool')}">\n<meta name="papp-write" content="./data">`, reason: 'could change' },
  { tag: '<meta name="papp-listen" content="anyone">', reason: 'Bad papp-listen value' },
  { tag: '<meta name="papp-listen" content="localhost">\n<meta name="papp-listen" content="network">', reason: 'Two papp-listen' },
  { tag: '<meta name="papp-net" content="example.com:0443">', reason: 'Bad papp-net value' },
  { tag: '<meta name="papp-open" content="https://x.com">', reason: 'Bad papp-open value' },
  { tag: '<meta name="papp-open" content="x.com:443">', reason: 'Bad papp-open value' },
  { tag: '<meta name="papp-open" content="*.com:443">', reason: 'Bad papp-open value' },
].map(({ tag, reason }) => {
  fs.writeFileSync(page, tag);

  try {
    declaredPermissions(page);

    return { tag, refused: false };
  } catch (err) {
    return { tag, refused: (err as Error).message.includes(reason) };
  }
});
// A pick passes what a tag must: a " would end the Seatbelt string and the rest of the name would be rules.
fs.mkdirSync(path.join(dir, 'x"))(allow lsopen)(regex #"'));
fs.mkdirSync(path.join(dir, 'line\nbreak'));
fs.writeFileSync(page, '<meta name="papp-run" content="./data/tool">');
const pickRefusals = [
  { pick: { path: path.join(dir, 'x"))(allow lsopen)(regex #"'), write: true }, reason: 'has a "' },
  // As the dialog gives it: checkPick refuses a path through a link, and the temporary folder is one on macOS.
  { pick: { path: path.join(fs.realpathSync(dir), 'data'), write: true }, reason: 'could change' },
  { pick: { path: fs.realpathSync(dir), write: true }, reason: 'could change' },
  { pick: { path: path.join(dir, 'line\nbreak'), write: false }, reason: 'invisible character' },
].map(({ pick, reason }) => {
  try {
    withGiven(declaredPermissions(page), [pick], page);

    return { pick, refused: false };
  } catch (err) {
    return { pick, refused: (err as Error).message.includes(reason) };
  }
});
// The control: a plain pick passes, and is granted.
const plainPick =
  withGiven(
    declaredPermissions(page),
    [
      { path: path.join(dir, '.tool'), write: false },
      { path: path.join(dir, 'x"))(allow lsopen)(regex #"'), write: false },
    ],
    page
  ).read.length === 2;
const trust = [
  { tags: '', expected: false },
  { tags: '<meta name="papp-read" content="./data">', expected: false },
  { tags: '<meta name="papp-net" content="api.github.com">', expected: true },
  { tags: '<meta name="papp-open" content="x.com">', expected: true },
  { tags: '<meta name="papp-use" content="camera">', expected: false },
  { tags: '<meta name="papp-read" content="./.tool/state.json">', expected: false },
  { tags: '<meta name="papp-write" content="./.tool/state.json">', expected: true },
  { tags: '<meta name="papp-run" content="/bin/ls">', expected: true },
  { tags: '<meta name="papp-system" content="full">', expected: true },
  { tags: '<meta name="papp-system" content="full">\n<meta name="papp-write" content="./data">\n<meta name="papp-read" content="./data">', expected: true },
  { tags: '<meta name="papp-socket" content="./data/a.sock">', expected: true },
  { tags: '<meta name="papp-listen" content="localhost">', expected: true },
].map(({ tags, expected }) => {
  fs.writeFileSync(page, tags);

  const permissions = declaredPermissions(page);

  return { tags, expected, said: needsTrust(permissions, describe(permissions)) };
});
const colours = [
  { tags: '<meta name="papp-run" content="/bin/ls">\n<meta name="papp-env" content="OPENAI_API_KEY">', kind: 'env:', level: 'yellow', says: '' },
  { tags: '<meta name="papp-run" content="/bin/ls">\n<meta name="papp-env" content="AWS_PROFILE">', kind: 'env:', level: 'plain', says: '' },
  { tags: '<meta name="papp-read" content="~/.netrc">', kind: 'read:', level: 'yellow', says: 'See files' },
  { tags: '<meta name="papp-write" content="~/DOCUMENTS">', kind: 'write:', level: 'yellow', says: 'change' },
  { tags: '<meta name="papp-run" content="/bin/ls">', kind: 'run:', level: 'yellow', says: 'Run' },
  { tags: '<meta name="papp-run" content="./data/tool">', kind: 'run:', level: 'yellow', says: 'Run' },
  { tags: '<meta name="papp-listen" content="localhost">', kind: 'listen:localhost', level: 'red', says: 'this computer' },
  { tags: '<meta name="papp-listen" content="Network">', kind: 'listen:network', level: 'red', says: 'your network' },
  { tags: '<meta name="papp-read" content="./.tool/state.json">', kind: 'read:', level: 'yellow', says: 'See files' },
  { tags: '<meta name="papp-write" content="./.tool/state.json">', kind: 'write:', level: 'red', says: 'change' },
  { tags: '<meta name="papp-socket" content="./data/a.sock">', kind: 'socket:', level: 'red', says: 'program' },
  { tags: '<meta name="papp-net" content="api.github.com">', kind: 'net:api.github.com:443', level: 'plain', says: 'data' },
  { tags: '<meta name="papp-net" content="api.github.com.">', kind: 'net:api.github.com:443', level: 'plain', says: 'data' },
  { tags: '<meta name="papp-net" content="*.example.com">', kind: 'net:*.example.com:443', level: 'yellow', says: 'data' },
  { tags: '<meta name="papp-net" content="*:443">', kind: 'net:*:443', level: 'red', says: 'data' },
  { tags: '<meta name="papp-net" content="*:*">', kind: 'net:*:*', level: 'red', says: 'any port' },
  { tags: '<meta name="papp-net" content="1.1.1.1">', kind: 'net:1.1.1.1:443', level: 'red', says: 'data' },
  { tags: '<meta name="papp-net" content="127.0.0.1:8080">', kind: 'net:', level: 'red', says: 'on this computer' },
  { tags: '<meta name="papp-net" content="localhost.:80">', kind: 'net:', level: 'red', says: 'on this computer' },
  { tags: '<meta name="papp-net" content="10.0.0.1:80">', kind: 'net:', level: 'red', says: 'data' },
  { tags: '<meta name="papp-net" content="192.168.1.1:443">', kind: 'net:', level: 'red', says: 'data' },
  { tags: '<meta name="papp-open" content="x.com">', kind: 'open:', level: 'plain', says: 'browser' },
  { tags: '<meta name="papp-open" content="*.example.com">', kind: 'open:', level: 'yellow', says: 'browser' },
  { tags: '<meta name="papp-open" content="*">', kind: 'open:', level: 'red', says: 'any link' },
  { tags: '<meta name="papp-open" content="*.com">', kind: 'open:', level: 'red', says: 'browser' },
  { tags: '<meta name="papp-open" content="localhost">', kind: 'open:', level: 'red', says: 'browser' },
  { tags: '<meta name="papp-open" content="192.168.1.1">', kind: 'open:', level: 'red', says: 'browser' },
  { tags: '<meta name="papp-open" content="1.1.1.1">', kind: 'open:', level: 'red', says: 'browser' },
  { tags: '<meta name="papp-use" content="clipboard">', kind: 'use:', level: 'yellow', says: 'copy' },
  { tags: '<meta name="papp-use" content="notifications">', kind: 'use:', level: 'plain', says: 'notifications' },
  { tags: '<meta name="papp-use" content="camera">', kind: 'use:', level: 'yellow', says: 'camera' },
  { tags: '<meta name="papp-use" content="screen">', kind: 'use:', level: 'yellow', says: 'screen' },
  { tags: '<meta name="papp-use" content="notifications, Clipboard">', kind: 'use:clipboard', level: 'yellow', says: 'copy' },
  { tags: '<meta name="papp-global-shortcut" content="cmdorctrl+shift+n">', kind: 'shortcut:', level: 'yellow', says: 'every app' },
  { tags: '<meta name="papp-global-shortcut" content="mediaplaypause">', kind: 'shortcut:MediaPlayPause', level: 'yellow', says: 'every app' },
  { tags: '<meta name="papp-window" content="width=900, height=600, title-bar=no, resizable=no">', kind: 'window:', level: 'plain', says: '900 × 600, fixed size, no title bar' },
  { tags: '<meta name="papp-window" content="size=900x600, title-bar=no">', kind: 'window:', level: 'plain', says: '900 × 600, no title bar' },
  { tags: '<meta name="papp-window" content="Min-Width=400">', kind: 'window:', level: 'plain', says: 'at least 400 × 0' },
  { tags: '<meta name="papp-window" content="frame=no">', kind: 'window:', level: 'yellow', says: 'no frame' },
  { tags: '<meta name="papp-window" content="transparent=yes, on-top=yes">', kind: 'window:', level: 'yellow', says: 'see-through, stays on top' },
  { tags: '<meta name="papp-window" content="frame=yes, on-top=no">', kind: 'window:', level: 'plain', says: 'frame, not on top' },
  { tags: '<meta name="papp-use" content="background">', kind: 'use:', level: 'plain', says: 'Keep running' },
  { tags: '<meta name="papp-use" content="login">', kind: 'use:', level: 'yellow', says: 'log in' },
  { tags: '<meta name="papp-use" content="usb">', kind: 'use:', level: 'yellow', says: 'USB' },
  { tags: '<meta name="papp-use" content="serial">', kind: 'use:', level: 'yellow', says: 'serial' },
  { tags: '<meta name="papp-use" content="hid">', kind: 'use:', level: 'yellow', says: 'keyboard' },
  { tags: '<meta name="papp-use" content="midi">', kind: 'use:', level: 'plain', says: 'MIDI' },
  { tags: '<meta name="papp-use" content="print">', kind: 'use:', level: 'yellow', says: 'any printer' },
].map(({ tags, kind, level, says }) => {
  fs.writeFileSync(page, tags);
  const line = describe(declaredPermissions(page)).find(line => line.id.startsWith(kind))!;

  return { tags, ok: line.level === level && line.text.includes(says), said: `${line.level}: ${line.short}: ${line.text}` };
});
// What the page sees, once: a path in a listed folder, its own included, is left out, unless a hidden name keeps it out.
const seen = [
  {
    tags: '<meta name="papp-read" content="./data">\n<meta name="papp-write" content="./data/out">\n<meta name="papp-read" content="./data/.tool">',
    all: false,
    shows: ['', path.join('data', '.tool')],
  },
  { tags: '<meta name="papp-read" content="./data/*.txt">\n<meta name="papp-read" content="./data/a.txt">', all: false, shows: [''] },
  {
    tags: '<meta name="papp-system" content="full">\n<meta name="papp-write" content="./data">\n<meta name="papp-read" content="~/.ssh">',
    all: PERMISSIONS_PLATFORM.readsAll,
    shows: [path.join(HOME, '.ssh')],
  },
]
  // A machine without ~/.ssh cannot declare it.
  .filter(({ shows }) => shows.every(file => fs.existsSync(file)))
  .map(({ tags, all, shows }) => {
    fs.writeFileSync(page, tags);
    const said = seenFiles(declaredPermissions(fs.realpathSync(page)));
    const files = said.lines.map(line => line.id.slice('read:'.length));
    const expected = shows.map(file => path.resolve(fs.realpathSync(dir), file));

    return { tags, ok: said.all === all && files.join('\n') === expected.join('\n'), said: `${said.all ? 'all, ' : ''}${files.join(', ')}` };
  });
fs.writeFileSync(page, '<meta name="papp-run" content="./data/tool">');
const bundled = declaredPermissions(page).run.tool === path.join(dir, 'data', 'tool');
fs.writeFileSync(page, '<meta\n  name="papp-read"\n  content="./data">\n<meta charset="utf-8">');
const written = declaredPermissions(page).tags;
const tagsAsWritten = written.length === 1 && written[0] === '<meta name="papp-read" content="./data">';
fs.mkdirSync(path.join(dir, "Jon's notes"));
fs.writeFileSync(
  page,
  [
    '<!doctype html><html><head><meta charset="utf-8">',
    '<!-- <meta name="papp-net" content="*"> -->',
    '<meta name="papp-read" content="./Jon\'s notes">',
    '<script>const tpl = `<meta name="papp-system" content="full">`;</script>',
    '</head><body><meta name="papp-write" content="./data"></body></html>',
  ].join('\n')
);
const head = declaredPermissions(page);
const headOnly = head.tags.length === 1 && head.read[0].endsWith("/Jon's notes") && !head.net.length && !head.write.length && !head.system;
fs.writeFileSync(page, `<meta data-name="papp-net" name="description" content="*">\n<meta name="x" lang=' name="papp-system" content="full" '>`);
const smuggled = declaredPermissions(page).tags;
fs.writeFileSync(page, '<meta name="papp-open" content="X.com">\n<meta name="papp-open" content="*.example.com">');
const { open } = declaredPermissions(page);
const links = [
  { href: 'https://x.com/jack', opens: true },
  { href: 'http://x.com/jack', opens: true },
  { href: 'https://www.example.com/a', opens: true },
  { href: 'https://www.x.com/jack', opens: false },
  { href: 'https://example.com/', opens: false },
  { href: 'https://evilx.com/', opens: false },
  { href: 'https://x.com.evil.com/', opens: false },
  { href: 'file:///etc/passwd', opens: false },
  { href: 'vscode://file/etc/passwd', opens: false },
  { href: 'not a url', opens: false },
].map(link => {
  const host = linkHost(link.href);

  return { ...link, ok: (host !== null && open.some(pattern => hostMatches(pattern, host))) === link.opens };
});
const anyLink = hostMatches('*', 'anything.example') && linkHost('ssh://host') === null && linkHost('javascript:1') === null;
const viewers =
  ['a.PNG', 'b.pdf', 'c.md', 'd.mov'].every(name => OPENABLE.test(name)) &&
  ['e.html', 'f.svg', 'g.papp', 'h.command', 'i.py', 'j.sh', 'k.webloc', 'l.desktop', 'm.app'].every(name => !OPENABLE.test(name));
// saveAs refuses these folders, and the popup shows writes to them red.
const runsOutside =
  (LAUNCH_FOLDER === null || runsOutsideSandbox(path.join(LAUNCH_FOLDER, 'x'))) &&
  runsOutsideSandbox(path.join(HOME, '.config', 'autostart')) &&
  runsOutsideSandbox(path.join(HOME, 'Library', 'CloudStorage', 'Dropbox', '.git', 'hooks')) &&
  !runsOutsideSandbox(path.join(HOME, 'Library', 'CloudStorage', 'Dropbox')) &&
  !runsOutsideSandbox(path.join(HOME, 'Library', 'Mobile Documents', 'com~apple~CloudDocs')) &&
  !runsOutsideSandbox(path.join(HOME, 'Downloads')) &&
  !runsOutsideSandbox(HOME);
listener.close();
fs.rmSync(dir, { recursive: true });

for (const line of lines) {
  console.log(`${line.level === 'red' ? 'ok  ' : 'FAIL'} popup ${line.short}: ${line.text}`);
}

for (const { tag, refused } of refusals) {
  console.log(`${refused ? 'ok  ' : 'FAIL'} popup refuses ${JSON.stringify(tag)}`);
}

for (const { pick, refused } of pickRefusals) {
  console.log(`${refused ? 'ok  ' : 'FAIL'} popup refuses the pick ${JSON.stringify(pick)}`);
}

console.log(`${plainPick ? 'ok  ' : 'FAIL'} popup grants a plain pick`);

for (const { tags, expected, said } of trust) {
  console.log(`${said === expected ? 'ok  ' : 'FAIL'} popup asks for trust with ${JSON.stringify(tags)}: ${said}`);
}

for (const { tags, ok, said } of seen) {
  console.log(`${ok ? 'ok  ' : 'FAIL'} popup sees ${JSON.stringify(tags)}: ${said}`);
}

for (const { tags, ok, said } of colours) {
  console.log(`${ok ? 'ok  ' : 'FAIL'} popup for ${JSON.stringify(tags)}: ${said}`);
}

console.log(`${bundled ? 'ok  ' : 'FAIL'} papp-run ./data/tool names the program beside the page`);
console.log(`${tagsAsWritten ? 'ok  ' : 'FAIL'} popup shows the tags as written: ${JSON.stringify(written)}`);
console.log(`${headOnly ? 'ok  ' : 'FAIL'} popup reads the head before any script, outside comments: ${JSON.stringify(head.tags)}`);
console.log(`${smuggled.length ? 'FAIL' : 'ok  '} popup reads papp- only from a name attribute: ${JSON.stringify(smuggled)}`);

for (const { href, opens, ok } of links) {
  console.log(`${ok ? 'ok  ' : 'FAIL'} papp-open ${opens ? 'opens' : 'asks about'} ${href}`);
}

console.log(`${anyLink ? 'ok  ' : 'FAIL'} papp-open * takes any http(s) link and no other scheme`);
console.log(`${viewers ? 'ok  ' : 'FAIL'} papp.open takes viewable files only`);
console.log(`${runsOutside ? 'ok  ' : 'FAIL'} papp.saveAs refuses launch agents and hidden folders, not cloud drives`);

process.exit(
  (
    lines.every(line => line.level === 'red') &&
      refusals.every(({ refused }) => refused) &&
      pickRefusals.every(({ refused }) => refused) &&
      plainPick &&
      trust.every(({ expected, said }) => said === expected) &&
      colours.every(({ ok }) => ok) &&
      seen.every(({ ok }) => ok) &&
      bundled &&
      tagsAsWritten &&
      headOnly &&
      !smuggled.length &&
      links.every(({ ok }) => ok) &&
      anyLink &&
      viewers &&
      runsOutside
  ) ?
    0
  : 1
);
