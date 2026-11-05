import assert from 'node:assert/strict';
import fs from 'fs';
import net from 'net';
import { after, suite, test } from 'node:test';
import os from 'os';
import path from 'path';
import { describe, needsTrust, seenFiles } from '../../src/permissions/describe.ts';
import { PERMISSIONS_PLATFORM } from '../../src/permissions/platform.ts';
import { hostMatches } from '../../src/permissions/network.ts';
import { linkHost, OPENABLE } from '../../src/permissions/open.ts';
import { HOME, LAUNCH_FOLDER, runsOutsideSandbox } from '../../src/permissions/paths.ts';
import { withGiven } from '../../src/permissions/given.ts';
import { patternSource } from '../../src/permissions/patterns.ts';
import { declaredPermissions } from '../../src/permissions/tags.ts';

// How tags are read and what the popup shows for them. Linux and Windows check what their sandbox cannot fence; macOS checks the rest.
if (process.platform === 'linux') {
  linuxTests();
} else if (process.platform === 'win32') {
  windowsTests();
} else if (process.platform === 'darwin') {
  macTests();
}

// Writes the tags as the page and reads them.
function declare(page: string, tags: string) {
  fs.writeFileSync(page, tags);

  return declaredPermissions(page);
}

// Refused with Apargon's own error, which names the reason: any other error, or none, fails.
function refuses(run: () => unknown, reason: string) {
  assert.throws(run, (err: Error) => {
    assert.ok(err.message.includes(reason), `"${err.message}" does not say "${reason}"`);

    return true;
  });
}

// Where the sandbox grants whole folders, a page that runs programs may not write the folder that holds it. Each case: tags, and whether they are refused.
function ownFolderTests(page: string, program: string) {
  fs.mkdirSync(path.join(path.dirname(page), 'data'), { recursive: true });
  const cases: [string, boolean][] = [
    [`<meta name="papp-run" content="${program}">\n<meta name="papp-write" content="./out*">`, true],
    ['<meta name="papp-system" content="full">\n<meta name="papp-write" content="./out*">', true],
    [`<meta name="papp-run" content="${program}">\n<meta name="papp-write" content="./data/*">`, false],
    ['<meta name="papp-write" content="./out*">', false],
  ];
  suite("programs never get the page's own folder", () => {
    for (const [tags, refused] of cases) {
      test(`${refused ? 'refuses' : 'allows'} ${JSON.stringify(tags)}`, () => {
        fs.writeFileSync(page, tags);
        // As on disk, as approve passes it.
        const read = () => declaredPermissions(fs.realpathSync.native(page));

        if (refused) {
          refuses(read, 'holds this page');
        } else {
          read();
        }
      });
    }
  });
}

function linuxTests() {
  const page = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'apargon-popup-')), 'case.papp');
  // Not in /tmp: Linux refuses any page there, before the rule this checks.
  const ownFolder = fs.mkdtempSync(path.join(os.homedir(), 'apargon-popup-'));
  after(() => [path.dirname(page), ownFolder].forEach(dir => fs.rmSync(dir, { recursive: true, force: true })));

  for (const [tag, folder] of [
    ...['/', '/var/', '/var/tmp/', '/tmp/', '/tmp/*', '/run/'].map(folder => ['papp-read', folder]),
    ...['/', '/tmp/', '/run/'].map(folder => ['papp-socket', folder]),
  ]) {
    test(`refuses ${tag} ${folder}, an emptied folder`, () => refuses(() => declare(page, `<meta name="${tag}" content="${folder}">`), 'cannot open'));
  }

  // A pick is checked as a tag is: picked, an emptied folder would bring its sockets back too.
  for (const folder of ['/tmp/', '/var/tmp/', `/run/user/${os.userInfo().uid}/`, '/run/']) {
    for (const write of [false, true]) {
      test(`refuses the pick ${folder}${write ? ' to write' : ''}, an emptied folder`, () =>
        refuses(() => withGiven(declare(page, ''), [{ path: folder, write }], page), 'cannot open'));
    }
  }

  ownFolderTests(path.join(ownFolder, 'case.papp'), 'sh');
}

function windowsTests() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'apargon-popup-'));
  const page = path.join(dir, 'case.papp');
  fs.mkdirSync(path.join(dir, 'data'));
  fs.writeFileSync(path.join(dir, 'data', 'tool.cmd'), '@echo off');
  after(() => fs.rmSync(dir, { recursive: true, force: true }));
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

  for (const [tag, value, reason] of cases) {
    test(`refuses ${tag} ${value}`, () => refuses(() => declare(page, `<meta name="${tag}" content="${value}">`), reason));
  }

  test('papp-run cmd finds the one in System32', () => {
    const { run } = declare(page, '<meta name="papp-run" content="cmd">\n<meta name="papp-env" content="APARGON_TEST_ENV">');
    assert.match(run.cmd.toLowerCase(), /\\system32\\cmd\.exe$/);
  });

  test('allows papp-system and localhost', () => {
    declare(page, '<meta name="papp-system" content="full">');
    declare(page, '<meta name="papp-net" content="localhost:11434">');
  });

  ownFolderTests(page, 'cmd');
}

function macTests() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'apargon-popup-'));
  const page = path.join(dir, 'case.papp');
  // As the dialog gives them: real paths. The temporary folder is a link on macOS, and a kept pick through a link is dropped.
  const realDir = fs.realpathSync(dir);
  // A pick passes what a tag must: a " would end the Seatbelt string and the rest of the name would be rules.
  const quoted = path.join(realDir, 'x"))(allow lsopen)(regex #"');
  const runsTool = '<meta name="papp-run" content="./data/tool">';
  const read = (tags: string) => declare(page, tags);
  [path.join(dir, 'data'), path.join(dir, '.tool'), quoted, path.join(dir, 'line\nbreak'), path.join(dir, 'picked'), path.join(dir, "Jon's notes")].forEach(folder =>
    fs.mkdirSync(folder)
  );
  fs.writeFileSync(path.join(dir, 'data', 'tool'), '#!/bin/sh\n', { mode: 0o755 });
  // A named link would grant what it leads to.
  fs.symlinkSync(page, path.join(dir, 'link.txt'));
  // A kept pick that became a link since is not granted: the sandbox would grant what it leads to.
  fs.symlinkSync(os.homedir(), path.join(realDir, 'swapped'));
  const listener = net.createServer().listen(path.join(dir, 'data', 'a.sock'));
  const ownAddress = Object.values(os.networkInterfaces())
    .flat()
    .find(each => each?.family === 'IPv4' && !each.internal)?.address;
  after(() => {
    listener.close();
    fs.rmSync(dir, { recursive: true });
  });

  test('writes to ~/Library and to pages are red', () => {
    for (const line of describe(read('<meta name="papp-write" content="~/LIBRARY/">\n<meta name="papp-write" content="./*.papp">\n')).filter(line =>
      line.id.startsWith('write:')
    )) {
      assert.equal(line.level, 'red', `${line.short}: ${line.text}`);
    }
  });

  for (const { tag, reason } of [
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
    { tag: '<meta name="papp-read" content="./link.txt">', reason: 'is a link' },
    { tag: '<meta name="papp-read" content="./data/" data-x="a​b">', reason: 'invisible character' },
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
    { tag: '<meta name=papp-read content="./data/">', reason: 'quoted name and content' },
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
    { tag: `<meta name="papp-run" content="${path.join(dir, 'data', 'tool')}">\n<meta name="papp-write" content="./data/">`, reason: 'could change' },
    { tag: '<meta name="papp-listen" content="anyone">', reason: 'Bad papp-listen value' },
    { tag: '<meta name="papp-listen" content="localhost">\n<meta name="papp-listen" content="network">', reason: 'Two papp-listen' },
    { tag: '<meta name="papp-net" content="example.com:0443">', reason: 'Bad papp-net value' },
    { tag: '<meta name="papp-open" content="https://x.com">', reason: 'Bad papp-open value' },
    { tag: '<meta name="papp-open" content="x.com:443">', reason: 'Bad papp-open value' },
    { tag: '<meta name="papp-open" content="*.com:443">', reason: 'Bad papp-open value' },
    // A last label of numbers makes a host an address, as a browser reads a link: *.0.1 would be 127.0.0.1 and 10.0.0.1.
    ...['*.0.1', '*.0.0.1', '*.168.1.1', '*.1', '*.1.1.1.1', '0x7f.1', '16843009', '127.1', '1.1'].flatMap(host => [
      { tag: `<meta name="papp-open" content="${host}">`, reason: 'full address' },
      { tag: `<meta name="papp-net" content="${host}:80">`, reason: 'full address' },
    ]),
    // Browsers send every name under localhost to this computer.
    ...['app.localhost', '*.localhost'].flatMap(host => [
      { tag: `<meta name="papp-open" content="${host}">`, reason: 'write localhost' },
      { tag: `<meta name="papp-net" content="${host}:80">`, reason: 'write localhost' },
    ]),
    { tag: '<meta name="papp-open" content="a..com">', reason: 'Bad papp-open value' },
    { tag: '<meta name="papp-read" content="./data/**/x/**/*.md">', reason: 'one ** per path' },
    { tag: '<meta name="papp-read" content="./data/a*b*.md">', reason: 'one * per name' },
    { tag: '<meta name="papp-write" content="./data/a**b">', reason: 'one * per name' },
  ]) {
    test(`refuses ${JSON.stringify(tag)}`, () => refuses(() => read(tag), reason));
  }

  for (const { pick, reason } of [
    { pick: { path: quoted, write: true }, reason: 'has a "' },
    { pick: { path: path.join(realDir, 'data'), write: true }, reason: 'could change' },
    { pick: { path: realDir, write: true }, reason: 'could change' },
    { pick: { path: path.join(realDir, 'line\nbreak'), write: false }, reason: 'invisible character' },
  ]) {
    test(`refuses the pick ${JSON.stringify(pick)}`, () => refuses(() => withGiven(read(runsTool), [pick], page), reason));
  }

  // The control: a plain pick passes, and is granted. A folder too, kept with its separator.
  test('grants a plain pick', () => {
    const picks = [
      { path: path.join(realDir, '.tool'), write: false },
      { path: quoted, write: false },
      { path: path.join(realDir, 'picked') + path.sep, write: false },
    ];
    assert.equal(withGiven(read(runsTool), picks, page).read.length, 3);
  });

  test('drops a kept pick that became a link', () => {
    assert.deepEqual(withGiven(read(runsTool), [{ path: path.join(realDir, 'swapped'), write: true }], page).write, []);
  });

  for (const { tags, expected } of [
    { tags: '', expected: false },
    { tags: '<meta name="papp-read" content="./data/">', expected: false },
    { tags: '<meta name="papp-net" content="api.github.com">', expected: true },
    { tags: '<meta name="papp-open" content="x.com">', expected: true },
    { tags: '<meta name="papp-use" content="camera">', expected: false },
    { tags: '<meta name="papp-read" content="./.tool/state.json">', expected: false },
    { tags: '<meta name="papp-write" content="./.tool/state.json">', expected: true },
    { tags: '<meta name="papp-run" content="/bin/ls">', expected: true },
    { tags: '<meta name="papp-system" content="full">', expected: true },
    { tags: '<meta name="papp-system" content="full">\n<meta name="papp-write" content="./data/">\n<meta name="papp-read" content="./data/">', expected: true },
    { tags: '<meta name="papp-socket" content="./data/a.sock">', expected: true },
    { tags: '<meta name="papp-listen" content="localhost">', expected: true },
  ]) {
    test(`${expected ? 'asks' : 'does not ask'} for trust with ${JSON.stringify(tags)}`, () => {
      const permissions = read(tags);
      assert.equal(needsTrust(permissions, describe(permissions)), expected);
    });
  }

  for (const { tags, kind, level, says } of [
    { tags: '<meta name="papp-run" content="/bin/ls">\n<meta name="papp-env" content="OPENAI_API_KEY">', kind: 'env:', level: 'yellow', says: '' },
    { tags: '<meta name="papp-run" content="/bin/ls">\n<meta name="papp-env" content="AWS_PROFILE">', kind: 'env:', level: 'plain', says: '' },
    { tags: '<meta name="papp-read" content="~/.netrc">', kind: 'read:', level: 'yellow', says: 'See your saved server passwords' },
    { tags: '<meta name="papp-read" content="~/.ssh/config">', kind: 'read:', level: 'yellow', says: 'See your SSH keys' },
    { tags: '<meta name="papp-write" content="~/DOCUMENTS/">', kind: 'write:', level: 'yellow', says: 'change' },
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
    { tags: '<meta name="papp-open" content="localhost.">', kind: 'open:localhost', level: 'red', says: 'browser' },
    { tags: '<meta name="papp-open" content="x.com.">', kind: 'open:x.com', level: 'plain', says: 'browser' },
    { tags: '<meta name="papp-open" content="*.co.uk">', kind: 'open:', level: 'yellow', says: 'browser' },
    { tags: '<meta name="papp-open" content="*.x1.com">', kind: 'open:', level: 'yellow', says: 'browser' },
    { tags: '<meta name="papp-net" content="*.com">', kind: 'net:', level: 'red', says: 'data' },
    { tags: '<meta name="papp-net" content="1password.com">', kind: 'net:', level: 'plain', says: 'data' },
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
  ]) {
    test(`shows ${JSON.stringify(tags)} ${level}`, () => {
      const line = describe(read(tags)).find(line => line.id.startsWith(kind));
      assert.ok(line, `no line for ${kind}`);
      assert.equal(line.level, level, `${line.short}: ${line.text}`);
      assert.ok(line.text.includes(says), `"${line.text}" does not say "${says}"`);
    });
  }

  // What the page sees, once: a path in a listed folder, its own included, is left out, unless a hidden name keeps it out.
  for (const { tags, all, shows } of [
    {
      tags: '<meta name="papp-read" content="./data/">\n<meta name="papp-write" content="./data/out">\n<meta name="papp-read" content="./data/.tool">',
      all: false,
      shows: ['', path.join('data', '.tool')],
    },
    { tags: '<meta name="papp-read" content="./data/*.txt">\n<meta name="papp-read" content="./data/a.txt">', all: false, shows: [''] },
    { tags: '<meta name="papp-system" content="full">\n<meta name="papp-write" content="./data/">', all: PERMISSIONS_PLATFORM.readsAll, shows: [] },
  ]) {
    test(`sees ${JSON.stringify(tags)}`, () => {
      fs.writeFileSync(page, tags);
      const said = seenFiles(declaredPermissions(fs.realpathSync(page)));
      // A folder's id ends in a separator; the expected paths do not.
      const files = said.lines.map(line => path.resolve(line.id.slice('read:'.length)));
      assert.deepEqual({ all: said.all, files }, { all, files: shows.map(file => path.resolve(realDir, file)) });
    });
  }

  test('papp-run ./data/tool names the program beside the page', () => assert.equal(read(runsTool).run.tool, path.join(dir, 'data', 'tool')));

  test('shows the tags as written', () => {
    assert.deepEqual(read('<meta\n  name="papp-read"\n  content="./data/">\n<meta charset="utf-8">').tags, ['<meta name="papp-read" content="./data/">']);
  });

  test('reads the head before any script, outside comments', () => {
    const head = read(
      [
        '<!doctype html><html><head><meta charset="utf-8">',
        '<!-- <meta name="papp-net" content="*"> -->',
        '<meta name="papp-read" content="./Jon\'s notes/">',
        '<script>const tpl = `<meta name="papp-system" content="full">`;</script>',
        '</head><body><meta name="papp-write" content="./data/"></body></html>',
      ].join('\n')
    );
    assert.equal(head.tags.length, 1);
    assert.ok(head.read[0].endsWith("/Jon's notes/"), head.read[0]);
    assert.deepEqual({ net: head.net, write: head.write, system: head.system }, { net: [], write: [], system: false });
  });

  test('reads papp- only from a name attribute', () => {
    assert.deepEqual(read(`<meta data-name="papp-net" name="description" content="*">\n<meta name="x" lang=' name="papp-system" content="full" '>`).tags, []);
  });

  for (const { href, opens } of [
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
  ]) {
    test(`papp-open ${opens ? 'opens' : 'asks about'} ${href}`, () => {
      const { open } = read('<meta name="papp-open" content="X.com">\n<meta name="papp-open" content="*.example.com">');
      const host = linkHost(href);
      assert.equal(host !== null && open.some(pattern => hostMatches(pattern, host)), opens);
    });
  }

  // * is part of one name, ** any number of names; neither matches a hidden one.
  for (const { pattern, file, matches } of [
    { pattern: '/n/**/*.md', file: '/n/a.md', matches: true },
    { pattern: '/n/**/*.md', file: '/n/x/y/a.md', matches: true },
    { pattern: '/n/**/*.md', file: '/n/x/a.txt', matches: false },
    { pattern: '/n/**/*.md', file: '/n/.git/a.md', matches: false },
    { pattern: '/n/**/*.md', file: '/n/x/.a.md', matches: false },
    { pattern: '/n/*/*.md', file: '/n/x/y/a.md', matches: false },
  ]) {
    test(`${pattern} ${matches ? 'matches' : 'does not match'} ${file}`, () => assert.equal(new RegExp(patternSource(pattern)).test(file), matches));
  }

  test('papp-open * takes any http(s) link and no other scheme', () => {
    assert.ok(hostMatches('*', 'anything.example'));
    assert.equal(linkHost('ssh://host'), null);
    assert.equal(linkHost('javascript:1'), null);
  });

  test('papp.open takes viewable files only', () => {
    assert.deepEqual(
      ['a.PNG', 'b.pdf', 'c.md', 'd.mov', 'e.html', 'f.svg', 'g.papp', 'h.command', 'i.py', 'j.sh', 'k.webloc', 'l.desktop', 'm.app'].filter(name => OPENABLE.test(name)),
      ['a.PNG', 'b.pdf', 'c.md', 'd.mov']
    );
  });

  // saveAll refuses these folders, and the popup shows writes to them red.
  test('papp.saveAll refuses launch agents and hidden folders, not cloud drives', () => {
    const refused = [
      ...(LAUNCH_FOLDER === null ? [] : [path.join(LAUNCH_FOLDER, 'x')]),
      path.join(HOME, '.config', 'autostart'),
      path.join(HOME, 'Library', 'CloudStorage', 'Dropbox', '.git', 'hooks'),
    ];
    const allowed = [
      path.join(HOME, 'Library', 'CloudStorage', 'Dropbox'),
      path.join(HOME, 'Library', 'Mobile Documents', 'com~apple~CloudDocs'),
      path.join(HOME, 'Downloads'),
      HOME,
    ];
    assert.deepEqual([...refused, ...allowed].filter(runsOutsideSandbox), refused);
  });
}
