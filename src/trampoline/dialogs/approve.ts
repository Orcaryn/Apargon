import { app } from 'electron';
import { createHash } from 'crypto';
import fs from 'fs';
import path from 'path';
import { describe, worstCase } from '../../permissions/describe.ts';
import { HOME } from '../../permissions/paths.ts';
import { declaredPermissions } from '../../permissions/tags.ts';
import { GRANTS_FILE, LINKS_FILE, readJson, writeJson, type Grants, type Links } from '../../shared/data.ts';
import { TRAMPOLINE_PLATFORM } from '../platform.ts';
import { ask } from './ask.ts';

export async function approve(file: string) {
  const page = fs.realpathSync.native(file);
  const html = fs.readFileSync(page);
  const permissions = declaredPermissions(page, html.toString());
  const downloadAddress = TRAMPOLINE_PLATFORM!.downloadAddress(page);
  const site = downloadAddress === null ? null : (URL.parse(downloadAddress)?.hostname ?? '');
  const downloadedFrom = site === '' ? 'another computer' : site;
  const lines = describe(permissions);
  const opensWithoutAsking = downloadedFrom === null && lines.every(line => line.id.startsWith('own:'));
  const pageHash = downloadedFrom === null ? null : createHash('sha256').update(html).digest('hex');
  const grant = lines.map(line => line.id).concat(pageHash ? `content:${pageHash}` : []).sort();
  const grants = readJson<Grants>(GRANTS_FILE);
  const previous = grants[page];
  const worst = worstCase(permissions);
  const approved = { page, permissions, pageHash };

  if (opensWithoutAsking || previous?.join('\n') === grant.join('\n')) {
    return approved;
  }

  const seesFiles = permissions.own !== null || permissions.read.length > 0 || permissions.write.length > 0;
  const popup = {
    source: downloadedFrom === null ? 'Made on this computer' : `Downloaded from ${downloadedFrom}`,
    downloaded: downloadedFrom !== null,
    name: path.basename(page),
    changed: previous?.some(id => id.startsWith('content:') && id !== `content:${pageHash}`) ? 'This page changed since you allowed it.' : null,
    worst,
    lines: lines.map(line => ({
      level: line.level,
      id: line.id,
      short: line.short.replaceAll(HOME + path.sep, `~${path.sep}`),
      text: line.text.replaceAll(HOME + path.sep, `~${path.sep}`),
      isNew: previous !== undefined && !previous.includes(line.id),
    })),
    note: seesFiles ? `Hidden files (names starting with a dot), keys and logins (~/.ssh and others) are left out unless named.${permissions.write.length ? ' Pages (.papp) can be changed only if named.' : ''}` : null,
    folder: (path.dirname(page) + path.sep).replaceAll(HOME + path.sep, `~${path.sep}`),
    tags: permissions.tags,
    trust: worst !== null || lines.some(line => line.level === 'red'),
  };

  if (!app.isPackaged && process.env.APARGON_TEST_ALLOW === '1') {
    console.log(['Apargon: allowed for the test:', popup.source, popup.name, popup.changed ?? [], worst ?? [], popup.lines.map(line => `${line.level}: ${line.short} [${line.text}]`)].flat().join('\n  '));

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

// The pages revoked forget their approval and the hosts ticked "Always" for them.
export function revoke(pages: string[]) {
  for (const file of [GRANTS_FILE, LINKS_FILE]) {
    const kept = Object.entries(readJson<Grants>(file)).filter(([approved]) => !pages.includes(approved));
    writeJson(file, Object.fromEntries(kept));
  }
}
