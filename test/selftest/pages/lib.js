// Shared by the selftest pages, as a classic script: a module would need the network's rules for file: URLs.
// Each page fills result and calls finish, which writes it to the page's own folder. check.ts reads it there.
const result = {};
// Refused by Apargon itself, not failed some other way: a renamed call or a crash is not a refusal. What else happened goes to check.ts, as refused_wrongly.
const wrong = [];

async function refused(call, expected = /^Error: Apargon: (?!no such call)/) {
  const said = await call().then(
    () => 'not refused',
    err => `${err.name}: ${err.message}`
  );

  if (!expected.test(said)) {
    wrong.push(`${call}: ${said}`);
  }

  return expected.test(said);
}

// The bytes a run gives, as text, and its exit status.
async function ran(...args) {
  const { status, stdout, stderr } = await papp.run(...args);

  return { status, out: String(stdout).trim(), err: String(stderr).trim() };
}

async function finish(name, error) {
  if (error) {
    result.error = error.message;
  }

  if (wrong.length) {
    result.refused_wrongly = wrong;
  }

  document.body.textContent = JSON.stringify(result);
  await papp.writeFile(`${papp.folder}/selftest-result-${name}.json`, JSON.stringify(result, null, 2) + '\n');
}
