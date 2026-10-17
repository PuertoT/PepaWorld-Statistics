import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, readFile, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pause, resume, PAUSE_FILE, SCHEDULE} from '../scripts/statistics-lifecycle.mjs';
import {sync} from '../scripts/sync-public-data.mjs';
import {publish} from '../scripts/publish-public-data.mjs';
const now = new Date('2026-10-13T19:00:00Z');
const common = {schema: 1, project: 'PepaWorld 3.0', generatedAt: now.toISOString()};
const docs = {
  'status.json': {...common, status: 'online', server: {online: true, playersOnline: 2, maxPlayers: 20}, mod: {name: 'Statistics', version: '0.2.0'}},
  'rankings.json': {...common, rankings: {deaths: [{name: 'QA', value: 7}], zombies: [], playtime: []}},
  'achievements.json': {...common, achievements: []},
};
const workflow = "name: test\non:\n" + SCHEDULE + '  workflow_dispatch:\n';
async function fixture(t) {
  const repo = await mkdtemp(join(tmpdir(), 'pepa-lifecycle-test-'));
  t.after(() => rm(repo, {recursive: true, force: true}));
  await mkdir(join(repo, 'data')); await mkdir(join(repo, '.github/workflows'), {recursive: true});
  await writeFile(join(repo, '.github/workflows/sync-public-data.yml'), workflow);
  for (const [name, value] of Object.entries(docs)) await writeFile(join(repo, 'data', name), JSON.stringify(value));
  return repo;
}
const get = (repo, path) => readFile(join(repo, path), 'utf8');
const source = (status = docs['status.json']) => async url => new Response(JSON.stringify(url.endsWith('status.json') ? status : docs[url.split('/').pop()]), {headers: {'content-type': 'application/json'}});

test('pause requires explicit closure confirmation and preserves live state otherwise', async t => {
  const repo = await fixture(t);
  await assert.rejects(pause(repo), /Confirm/);
  assert.equal(await get(repo, 'data/status.json'), JSON.stringify(docs['status.json']));
  assert.equal(await get(repo, '.github/workflows/sync-public-data.yml'), workflow);
});
test('pause archives exact bytes, retains rankings/catalog, removes cron, and is idempotent', async t => {
  const repo = await fixture(t);
  const result = await pause(repo, {confirmed: true, now});
  for (const name of Object.keys(docs)) assert.equal(await get(repo, `${result.archive}/${name}`), JSON.stringify(docs[name]));
  for (const name of ['rankings.json', 'achievements.json']) assert.equal(await get(repo, `data/${name}`), JSON.stringify(docs[name]));
  const status = JSON.parse(await get(repo, 'data/status.json'));
  assert.equal(status.status, 'offline'); assert.equal(status.server.online, false); assert.equal(status.server.playersOnline, 0);
  assert.ok(!(await get(repo, '.github/workflows/sync-public-data.yml')).includes('schedule:'));
  assert.deepEqual(await pause(repo, {confirmed: true, now}), {changed: false});
});
test('paused state blocks both downloads and independent publisher', async t => {
  const repo = await fixture(t); await pause(repo, {confirmed: true, now});
  await assert.rejects(sync(repo, () => { assert.fail('Must not access network'); }), /paused/);
  assert.throws(() => publish(repo), /paused/);
});
test('resume restores cron only after fresh, online and fully validated data; archive remains', async t => {
  const repo = await fixture(t); const {archive} = await pause(repo, {confirmed: true, now});
  await resume(repo, {fetcher: source(), now});
  assert.equal(await get(repo, '.github/workflows/sync-public-data.yml'), workflow);
  await assert.rejects(get(repo, PAUSE_FILE), {code: 'ENOENT'});
  assert.equal(JSON.parse(await get(repo, 'data/status.json')).status, 'online');
  assert.equal(await get(repo, `${archive}/rankings.json`), JSON.stringify(docs['rankings.json']));
});
for (const [label, fetcher] of [
  ['unreachable', async () => { throw new Error('Offline'); }],
  ['stale', source({...docs['status.json'], generatedAt: '2026-10-10T00:00:00Z'})],
  ['future', source({...docs['status.json'], generatedAt: '2026-10-14T00:00:00Z'})],
  ['offline', source({...docs['status.json'], status: 'offline', server: {online: false, playersOnline: 0, maxPlayers: 20}})],
  ['invalid', async () => new Response('{}', {headers: {'content-type': 'application/json'}})],
]) test(`failed resume (${label}) preserves paused data and cron`, async t => {
  const repo = await fixture(t); await pause(repo, {confirmed: true, now});
  const before = await Promise.all(['data/status.json', 'data/rankings.json', 'data/achievements.json', PAUSE_FILE, '.github/workflows/sync-public-data.yml'].map(p => get(repo, p)));
  await assert.rejects(resume(repo, {fetcher, now}));
  assert.deepEqual(await Promise.all(['data/status.json', 'data/rankings.json', 'data/achievements.json', PAUSE_FILE, '.github/workflows/sync-public-data.yml'].map(p => get(repo, p))), before);
});
