import {readFile, writeFile, mkdir, access, rm, mkdtemp, cp} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {FILES, validate} from './validate-public-data.mjs';
import {sync} from './sync-public-data.mjs';

export const PAUSE_FILE = 'maintenance/paused.json';
export const SCHEDULE = "  schedule:\n    - cron: '*/5 * * * *'\n";
const WORKFLOW = '.github/workflows/sync-public-data.yml';
export async function isPaused(repo) {
  try { await access(join(repo, PAUSE_FILE)); return true; }
  catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}

// Preparation only: never commits, pushes, calls GitHub, or touches Minecraft.
export async function pause(repo, {confirmed = false, now = new Date()} = {}) {
  if (!confirmed) throw new Error('Confirm the actual server closure before preparing the pause.');
  if (await isPaused(repo)) return {changed: false};
  const workflow = await readFile(join(repo, WORKFLOW), 'utf8');
  if (workflow.split(SCHEDULE).length !== 2) throw new Error('Unexpected schedule: review workflow manually.');
  const bytes = {};
  for (const name of FILES) {
    bytes[name] = await readFile(join(repo, 'data', name));
    validate(name, bytes[name]);
  }
  const pausedAt = now.toISOString();
  const archive = `history/${pausedAt.replace(/[:.]/g, '-')}`;
  const status = JSON.parse(bytes['status.json']);
  const metadata = {schema: 1, state: 'paused', pausedAt, lastExportAt: status.generatedAt,
    archive, reason: 'Cierre temporal confirmado por administración. Regreso sin fecha confirmada.'};
  await mkdir(join(repo, archive), {recursive: true});
  for (const name of FILES) await writeFile(join(repo, archive, name), bytes[name], {flag: 'wx'});
  await mkdir(join(repo, 'maintenance'), {recursive: true});
  await writeFile(join(repo, PAUSE_FILE), JSON.stringify(metadata, null, 2) + '\n', {flag: 'wx'});
  // Schema v1 remains unchanged. This is an administrative status publication,
  // not a new observation/export from the stopped Minecraft process.
  status.generatedAt = pausedAt;
  status.status = 'offline'; status.server.online = false; status.server.playersOnline = 0;
  const output = JSON.stringify(status) + '\n';
  validate('status.json', Buffer.from(output));
  await writeFile(join(repo, 'data/status.json'), output);
  await writeFile(join(repo, WORKFLOW), workflow.replace(SCHEDULE, ''));
  return {changed: true, archive};
}

export async function resume(repo, {fetcher = fetch, now = new Date()} = {}) {
  if (!await isPaused(repo)) throw new Error('Statistics is not paused.');
  const workflow = await readFile(join(repo, WORKFLOW), 'utf8');
  if (workflow.includes('  schedule:') || workflow.split('  workflow_dispatch:').length !== 2)
    throw new Error('Unexpected workflow: review manually.');
  const temp = await mkdtemp(join(tmpdir(), 'pepaworld-resume-'));
  try {
    await cp(join(repo, 'data'), join(temp, 'data'), {recursive: true});
    await sync(temp, fetcher);
    const status = validate('status.json', await readFile(join(temp, 'data/status.json')));
    const age = now.getTime() - Date.parse(status.generatedAt);
    if (!status.server.online || age < -60000 || age > 30 * 60 * 1000)
      throw new Error('Resume requires an online status exported within the last 30 minutes.');
    // All documents and freshness checked before replacing the local paused state.
    for (const name of FILES) await cp(join(temp, 'data', name), join(repo, 'data', name));
    await writeFile(join(repo, WORKFLOW), workflow.replace('  workflow_dispatch:', SCHEDULE + '  workflow_dispatch:'));
    await rm(join(repo, PAUSE_FILE));
    return {changed: true};
  } finally { await rm(temp, {recursive: true, force: true}); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const command = process.argv[2];
    if (command === 'pause') console.log(await pause(process.cwd(), {confirmed: process.argv.includes('--confirm-server-closed')}));
    else if (command === 'resume') console.log(await resume(process.cwd()));
    else throw new Error('Usage: node scripts/statistics-lifecycle.mjs pause --confirm-server-closed | resume');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
