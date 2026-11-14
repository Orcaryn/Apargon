import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, suite, test } from 'node:test';
import { describe, keyNames } from '../../src/permissions/describe.ts';
import { HOME } from '../../src/permissions/paths.ts';
import { declaredPermissions, noPermissions, site, windowFeatures } from '../../src/permissions/tags.ts';

// How tags are read, and the popup line each one makes.
const dir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'apargon-tags-')));
const page = path.join(dir, 'case.papp');
const kept = path.join(dir, 'kept');
fs.mkdirSync(path.join(dir, 'notes'));
fs.mkdirSync(path.join(kept, 'inside'), { recursive: true });
fs.writeFileSync(path.join(dir, 'file.txt'), '');
after(() => fs.rmSync(dir, { recursive: true, force: true }));

const ID = '4f2c9a1e-7b3d-4c58-9e21-0a6d8f3b5c77';
const read = (tags: string) => declaredPermissions(page, `<!doctype html><meta name="papp-id" content="${ID}">${tags}<title>x</title>`, [kept]);
const lines = (tags: string) => describe(read(tags)).map(line => [line.heading, line.text]);

// Refused with Apargon's own error, which names the reason: any other error, or none, fails.
function refuses(tags: string, reason: string) {
  assert.throws(
    () => read(tags),
    (err: Error) => {
      assert.ok(err.message.includes(reason), `"${err.message}" does not say "${reason}"`);

      return true;
    }
  );
}

test('no permission tags: nothing beyond reading and its own folder', () => {
  assert.deepEqual(read('<meta charset="utf-8"><meta name="description" content="x">'), noPermissions(ID));
  assert.deepEqual(describe(noPermissions(ID)), []);
});

suite('papp-id', () => {
  const bare = (tags: string) => declaredPermissions(page, `<!doctype html>${tags}<title>x</title>`, [kept]);
  test('names the app, and makes no popup line', () => assert.deepEqual(bare(`<meta name="papp-id" content="${ID.toUpperCase()}">`).tags, []));
  test('is lowercased', () => assert.equal(bare(`<meta name="papp-id" content="${ID.toUpperCase()}">`).id, ID));
  test('missing: refused, with a fresh UUID to copy', () => assert.throws(() => bare(''), /has no papp-id.*content="[0-9a-f-]{36}"/));
  test('not a UUID: refused', () => assert.throws(() => bare('<meta name="papp-id" content="notes">'), /It is a UUID/));
  test('two: refused', () => assert.throws(() => read(`<meta name="papp-id" content="${ID}">`), /Two papp-id/));
});

suite("the plan's table", () => {
  test('papp-write a folder', () => assert.deepEqual(lines('<meta name="papp-write" content="./notes/">'), [['Change files in', 'notes']]));
  test('papp-write all', () => assert.deepEqual(lines('<meta name="papp-write" all>'), [['Change files in', 'every folder on your computer']]));
  test('papp-run', () => assert.deepEqual(lines('<meta name="papp-run" content="sh">'), [['Use', 'sh']]));
  test('papp-run unfenced', () => assert.deepEqual(lines('<meta name="papp-run" content="sh" unfenced>'), [['Use', 'sh, with full access and the internet']]));
  test('papp-net', () => assert.deepEqual(lines('<meta name="papp-net" content="x.com">'), [['Send your files to', 'x.com']]));
  test('papp-net with a port', () => assert.deepEqual(lines('<meta name="papp-net" content="localhost:8080">'), [['Send your files to', 'localhost:8080']]));
  test('papp-listen', () => assert.deepEqual(lines('<meta name="papp-listen">'), [['Also', 'Let websites and apps on this computer connect']]));
  test('papp-listen network', () => assert.deepEqual(lines('<meta name="papp-listen" network>'), [['Also', 'Let phones and computers on your network connect']]));
  test('papp-use', () => assert.deepEqual(lines('<meta name="papp-use" content="notifications">'), [['Also', 'Show notifications']]));
  test('papp-window, one line per setting', () =>
    assert.deepEqual(lines('<meta name="papp-window" on-top frame="no" size="320x80">'), [
      ['Also', 'Open at 320 × 80'],
      ['Also', 'Hide its window frame'],
      ['Also', 'Stay on top of other windows'],
    ]));
  test('papp-env', () =>
    assert.deepEqual(lines('<meta name="papp-run" content="sh"><meta name="papp-env" content="AWS_PROFILE">'), [
      ['Use', 'sh'],
      ['Share with its programs', 'your AWS_PROFILE setting'],
    ]));
  test('papp-global-shortcut', () =>
    assert.deepEqual(lines('<meta name="papp-global-shortcut" content="CommandOrControl+Shift+N">'), [['Also', `Use ${keyNames('CommandOrControl+Shift+N')} in every app`]]));
  test('papp-system', () => assert.deepEqual(lines('<meta name="papp-system">'), [[null, 'Do anything on your computer, with the internet']]));
});

suite('papp-write', () => {
  test('a folder, as on disk, ending in the separator', () => assert.deepEqual(read('<meta name="papp-write" content="./notes">').write, [path.join(dir, 'notes') + path.sep]));
  test('not a file', () => refuses('<meta name="papp-write" content="./file.txt">', 'is not a folder'));
  test('not a pattern', () => refuses('<meta name="papp-write" content="./notes/*">', 'is not a folder'));
  test('not a folder that is not there', () => refuses('<meta name="papp-write" content="./missing/">', "isn't there"));
  test('not the home folder', () => refuses('<meta name="papp-write" content="~/">', 'whole home folder'));
  test('not one that holds the home folder', () => refuses(`<meta name="papp-write" content="${path.parse(HOME).root}">`, 'whole home folder'));
  test("not Apargon's own, or one inside it, or one that holds it", () => {
    refuses('<meta name="papp-write" content="./kept/">', "Apargon's own");
    refuses('<meta name="papp-write" content="./kept/inside/">', "Apargon's own");
    refuses(`<meta name="papp-write" content="${dir}">`, "Apargon's own");
  });
  test('all takes no folder', () => refuses('<meta name="papp-write" content="./notes/" all>', 'takes no folder'));
  test('all with another papp-write is said twice', () => refuses('<meta name="papp-write" all><meta name="papp-write" content="./notes/">', 'already allows every folder'));
});

suite('papp-net', () => {
  test('a host gets 443', () => assert.equal(site('Example.com.'), 'example.com:443'));
  test('an address and localhost are fine: the user said yes', () => {
    assert.equal(site('127.0.0.1:8080'), '127.0.0.1:8080');
    assert.equal(site('localhost'), 'localhost:443');
    assert.equal(site('192.168.1.5:80'), '192.168.1.5:80');
  });

  for (const bad of ['*.example.com', '*', 'https://x.com', 'x.com/path', 'x.com:0', 'x.com:70000', 'x.com:1:2', '127.1', 'a.localhost', '-x.com']) {
    test(`refuses ${bad}`, () => assert.throws(() => site(bad)));
  }
});

suite('attributes', () => {
  test('an unknown attribute refuses the file', () => refuses('<meta name="papp-net" content="x.com" wide>', 'no attribute "wide"'));
  test('content where a tag takes none refuses the file', () => {
    refuses('<meta name="papp-listen" content="localhost">', 'takes no content');
    refuses('<meta name="papp-window" content="on-top=yes">', 'attributes now');
    refuses('<meta name="papp-system" content="full">', 'takes no content');
  });
  test('a bare attribute is yes, ="no" is no', () => {
    assert.deepEqual(read('<meta name="papp-window" on-top frame="no" resizable="yes">').window, { onTop: true, frame: false, resizable: true });
  });
  test('a setting is bare, yes or no', () => refuses('<meta name="papp-window" on-top="maybe">', 'bare for yes'));
  test('sizes take pixels', () => {
    assert.deepEqual(read('<meta name="papp-window" size="900x600" min-width="400">').window, { width: 900, height: 600, minWidth: 400 });
    refuses('<meta name="papp-window" size="big">', 'bad window setting');
    refuses('<meta name="papp-window" size="900x600" width="800">', 'Keep size, or width and height');
  });
  test('window.open features read as the attributes', () =>
    assert.deepEqual(windowFeatures('on-top, frame=no, size=320x80'), { onTop: true, frame: false, width: 320, height: 80 }));
});

suite('old tags and forms are refused', () => {
  test('papp-read', () => refuses('<meta name="papp-read" content="./">', 'papp-read is gone'));
  test('papp-open', () => refuses('<meta name="papp-open" content="x.com">', 'papp-open is gone'));
  test('an unknown tag', () => refuses('<meta name="papp-everything" content="yes">', 'Unknown tag'));
  test('papp-use with a list', () => refuses('<meta name="papp-use" content="sound, camera">', 'one feature per tag'));
  test('an unknown feature', () => refuses('<meta name="papp-use" content="telepathy">', 'The features are'));
});

suite('together', () => {
  test('papp-system with other ways out is said twice', () => refuses('<meta name="papp-system"><meta name="papp-net" content="x.com">', 'already allows everything'));
  test('papp-env needs a program', () => refuses('<meta name="papp-env" content="HOME">', 'runs none'));
  test('a duplicate is refused', () => refuses('<meta name="papp-net" content="x.com"><meta name="papp-net" content="x.com:443">', 'Two tags allow x.com:443'));
  test('dock="no" needs background', () => refuses('<meta name="papp-window" dock="no">', 'background'));
  test('an unfenced program the .papp file could change is refused', () => {
    // Windows runs only .exe and .com files.
    const name = process.platform === 'win32' ? 'tool.exe' : 'tool';
    fs.writeFileSync(path.join(dir, 'notes', name), '#!/bin/sh\n', { mode: 0o755 });
    refuses(`<meta name="papp-write" content="./notes/"><meta name="papp-run" content="./notes/${name}" unfenced>`, 'could change');
    assert.ok(read(`<meta name="papp-write" content="./notes/"><meta name="papp-run" content="./notes/${name}">`).run[name]);
  });
  test('so is one reached through a link', { skip: process.platform === 'win32' && 'a link needs an admin on Windows' }, () => {
    fs.writeFileSync(path.join(dir, 'notes', 'linked'), '#!/bin/sh\n', { mode: 0o755 });
    fs.symlinkSync(path.join(dir, 'notes', 'linked'), path.join(dir, 'linked'));
    refuses('<meta name="papp-write" content="./notes/"><meta name="papp-run" content="./linked" unfenced>', 'could change');
  });
});

test('tags after the head are not read', () => assert.deepEqual(read('<body><meta name="papp-system">').tags, []));
test('a tag in a comment is not read', () => assert.deepEqual(read('<!-- <meta name="papp-system"> -->').tags, []));
test('an invisible character refuses the file', () => refuses('<meta name="papp-net" content="x.com‮">', 'invisible'));
test('a line break in the path refuses the file', () =>
  assert.throws(() => declaredPermissions(path.join(dir, 'notes\nExec=sh.papp'), `<meta name="papp-id" content="${ID}">`, [kept]), /control character/));
