import { app, dialog } from 'electron';
import { randomUUID } from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { DATA, readJson, writeJson } from '../shared.ts';

// Inside app.asar, so on macOS the build hash covers it.
const SKILL = path.join(app.getAppPath(), 'skills/papp/SKILL.md');
const FOLDERS = ['.claude', '.agents'].map(agents => path.join(agents, 'skills/papp'));
const WELCOME_FILE = path.join(DATA, 'welcome.json');
let asking = false;

// Right after installing, Apargon is opened from the Dock or the app menu, with no page: that is where an installer sees the skill. A first run that opens a page offers it once.
export async function welcome(withPage: boolean) {
  const skill = fs.readFileSync(SKILL, 'utf8');
  const installed = FOLDERS.every(folder => {
    const file = path.join(os.homedir(), folder, 'SKILL.md');

    return fs.existsSync(file) && fs.readFileSync(file, 'utf8') === skill;
  });

  // Dev test runs, like their popup, answer nothing; the installed app's test run writes welcome.json first (AGENTS.md).
  if (withPage && (installed || readJson<{ welcomed?: true }>(WELCOME_FILE).welcomed || (!app.isPackaged && process.env.APARGON_TEST_ALLOW === '1'))) {
    return;
  }

  writeJson(WELCOME_FILE, { welcomed: true });
  // Started from a terminal, the app is not in front, and a dialog with no window opens behind the others.
  app.focus({ steal: true });

  if (installed) {
    await dialog.showMessageBox({ type: 'info', message: 'Apargon is ready.', detail: 'Double-click a .papp file to open it.\n\nThe papp skill for coding agents is installed.' });
  } else {
    await offerSkill(withPage ? 'Welcome to Apargon.' : 'Apargon is ready. Double-click a .papp file to open it.');
  }
}

// From the menu, the page only asks; the user says yes in this process's dialog, and the file is the one Apargon ships. A page that breaks out of its sandbox can do no more than show the dialog.
export async function offerSkill(message: string) {
  if (asking) {
    return;
  }

  asking = true;

  try {
    // This process has no window of its own: without this, its dialog opens behind the page.
    app.focus({ steal: true });
    const { response } = await dialog.showMessageBox({
      type: 'question',
      message,
      detail: `Install the papp skill? With it, coding agents such as Claude Code build apps for Apargon when you ask. It goes in, replacing any older copy:\n\n${FOLDERS.map(folder => `~/${folder}`).join('\n')}\n\nLater: Help → Install the papp Skill for Agents…`,
      buttons: ['Install the Skill', 'Not Now'],
      defaultId: 0,
      cancelId: 1,
    });

    if (response === 1) {
      return;
    }

    const skill = fs.readFileSync(SKILL);

    // 'wx' never follows a link, and the rename replaces a link at SKILL.md rather than the file it leads to.
    for (const folder of FOLDERS.map(folder => path.join(os.homedir(), folder))) {
      const temporary = path.join(folder, `.SKILL.md.${randomUUID()}`);
      fs.mkdirSync(folder, { recursive: true });
      fs.writeFileSync(temporary, skill, { flag: 'wx' });
      fs.renameSync(temporary, path.join(folder, 'SKILL.md'));
    }

    await dialog.showMessageBox({ type: 'info', message: 'The papp skill is installed.', detail: 'Ask your agent for an app, for example: "Make me a papp that lists the Markdown notes in ~/notes and lets me edit them."' });
  } catch (err) {
    dialog.showErrorBox('Apargon', `Could not install the skill: ${(err as Error).message}`);
  } finally {
    asking = false;
  }
}
