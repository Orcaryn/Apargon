import { app } from 'electron';
import { createHash } from 'crypto';
import fs from 'fs';
import path from 'path';
import { describe, givenLine, needsTrust, seenFiles, type Line } from '../../permissions/describe.ts';
import { HOME } from '../../permissions/paths.ts';
import { isInside } from '../../permissions/patterns.ts';
import { declaredPermissions } from '../../permissions/tags.ts';
import { GIVEN_FILE, GRANTS_FILE, LINKS_FILE, readJson, writeJson, type Given, type Grants, type Links } from '../../shared/data.ts';
import { TRAMPOLINE_PLATFORM } from '../platform.ts';
import { forgetSecrets } from '../requests/secrets.ts';
import { ask } from './ask.ts';

export async function approve(file: string) {
  const page = fs.realpathSync.native(file);
  const html = fs.readFileSync(page);
  const permissions = declaredPermissions(page, html.toString());
  const downloadAddress = TRAMPOLINE_PLATFORM.downloadAddress(page);
  const site = downloadAddress === null ? null : (URL.parse(downloadAddress)?.hostname ?? '');
  const downloadedFrom = site === '' ? 'another computer' : site;
  const lines = describe(permissions);
  // Its own folder and a plain window are what any page made here has.
  const opensWithoutAsking = downloadedFrom === null && lines.every(line => line.id.startsWith('own:') || (line.id.startsWith('window:') && line.level === 'plain'));
  const pageHash = downloadedFrom === null ? null : createHash('sha256').update(html).digest('hex');
  const grant = lines.map(line => line.id).concat(pageHash ? `content:${pageHash}` : []).sort();
  const grants = readJson<Grants>(GRANTS_FILE);
  const previous = grants[page];
  const approved = { page, permissions, pageHash };

  if (opensWithoutAsking || previous?.join('\n') === grant.join('\n')) {
    return approved;
  }

  const folder = path.dirname(page);

  // A path in the page's folder shows as ./name: the header names the folder once.
  const shortOf = (line: Line) => {
    const kind = line.id.split(':')[0];
    const file = line.id.slice(kind.length + 1);

    if (!['read', 'write', 'socket', 'run', 'given'].includes(kind) || !isInside(file, folder)) {
      return line.short.replaceAll(HOME + path.sep, `~${path.sep}`);
    }

    return file === folder ? 'This folder' : `.${path.sep}${path.relative(folder, file)}`;
  };

  const seen = seenFiles(permissions);
  const seenPaths = seen.lines.map(shortOf).join(', ');
  const seenShort =
    !seen.all ? seenPaths
    : seenPaths === '' ? 'All your files, except passwords and keys'
    : `All your files, including ${seenPaths}, except other passwords and keys`;
  const seenLevel: Line['level'] = seen.all || seen.lines.some(line => line.level === 'yellow') ? 'yellow' : 'plain';
  const order = { red: 0, yellow: 1, plain: 2 };
  const isFolder = (file: string) => fs.statSync(file, { throwIfNoEntry: false })?.isDirectory() === true;
  // The user's picks: shown so the whole of what the page gets is in one place, but no part of the approval.
  const given = (readJson<Given>(GIVEN_FILE)[page] ?? []).map(givenLine);
  const popup = {
    source: downloadedFrom === null ? 'Made on this computer' : `Downloaded from ${downloadedFrom}`,
    downloaded: downloadedFrom !== null,
    name: path.basename(page),
    changed: previous?.some(id => id.startsWith('content:') && id !== `content:${pageHash}`) ? 'This page changed since you allowed it.' : null,
    // What it sees is one line, under Can see. Each write stays a line, under Can change and delete.
    lines: [
      ...lines
        .filter(line => !/^(read|own):/.test(line.id))
        .map(line => ({
          level: line.level,
          id: line.id,
          short: shortOf(line),
          text: line.text.replaceAll(HOME + path.sep, `~${path.sep}`),
          isNew: previous !== undefined && !previous.includes(line.id),
          isFolder: line.id.startsWith('write:') && isFolder(line.id.slice('write:'.length)),
        })),
      ...given.map(line => ({ level: line.level, id: line.id, short: shortOf(line), text: line.text, isNew: false, isFolder: isFolder(line.id.slice('given:'.length)) })),
      ...(seenShort === '' ? [] : [
        {
          level: seenLevel,
          id: 'sees',
          short: seenShort,
          text: '',
          isNew: previous !== undefined && ((seen.all && !previous.includes('system')) || lines.some(line => /^(read|write|own):/.test(line.id) && !previous.includes(line.id))),
          isFolder: true,
        },
      ]),
    ].sort((a, b) => order[a.level] - order[b.level]),
    // A papp-system page's line already says so.
    note: seen.lines.length > 0 && !seen.all ? 'Hidden files, passwords and keys stay out unless named.' : null,
    folder: (folder + path.sep).replaceAll(HOME + path.sep, `~${path.sep}`),
    tags: permissions.tags,
    trust: needsTrust(permissions, lines),
  };

  if (!app.isPackaged && process.env.APARGON_TEST_ALLOW === '1') {
    console.log(['Apargon: allowed for the test:', popup.source, popup.name, popup.changed ?? [], popup.lines.map(line => `${line.level}: ${line.short} [${line.text}]`)].flat().join('\n  '));

    return approved;
  } else if (!(await ask('popup.html', popup))) {
    return null;
  }

  const latest = readJson<Grants>(GRANTS_FILE);
  writeJson(GRANTS_FILE, { ...latest, [page]: grant });
  // A new approval forgets the hosts ticked "Always": the user allowed this page, not what the last one opened.
  const links = readJson<Links>(LINKS_FILE);
  delete links[page];
  writeJson(LINKS_FILE, links);

  return approved;
}

// Everything the user gave the page goes with its approval: the links, the picks and the secrets.
export function revoke(pages: string[]) {
  pages.forEach(page => TRAMPOLINE_PLATFORM.startAtLogin(page, false));
  pages.forEach(forgetSecrets);

  for (const file of [GRANTS_FILE, LINKS_FILE, GIVEN_FILE]) {
    const kept = Object.entries(readJson<Record<string, unknown>>(file)).filter(([approved]) => !pages.includes(approved));
    writeJson(file, Object.fromEntries(kept));
  }
}
