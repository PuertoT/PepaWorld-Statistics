import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {FILES, MAX_BYTES, validate, privacyGuard, validTimestamp} from '../scripts/validate-public-data.mjs';
import {sync, download, BASE_URL} from '../scripts/sync-public-data.mjs';
import {publish} from '../scripts/publish-public-data.mjs';

// Synthetic fixtures stay in isolated temporary repositories; never copied into project data/.
function fixtures() {
  const common = {schema: 1, project: 'PepaWorld 3.0', generatedAt: '2026-09-27T00:00:00.123456789Z'};
  return {
    'status.json': {...common, status: 'online', server: {online: true, playersOnline: 1, maxPlayers: 30}, mod: {name: 'Statistics', version: '0.2.0'}},
    'achievements.json': {...common, achievements: [{id: 'qa_public', name: 'QA', description: 'Synthetic test', hidden: false, reward: {type: 'xp', amount: 2}}]},
    'rankings.json': {...common, rankings: {deaths: [{name: 'TestPlayer', value: 4}], zombies: [], playtime: [{name: 'TestPlayer', value: 152280}]}}
  };
}
const encoded = value => Buffer.from(JSON.stringify(value) + '\n');
function fetcher(values = fixtures()) {
  return async (url, options) => {
    assert.ok(url.startsWith(BASE_URL)); assert.equal(options.redirect, 'error'); assert.ok(options.signal);
    return new Response(encoded(values[url.slice(BASE_URL.length)]), {headers: {'content-type': 'application/json; charset=utf-8'}});
  };
}
const git = (cwd, ...args) => execFileSync('git', args, {cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']}).trim();
async function repository(t) {
  const root = await mkdtemp(join(tmpdir(), 'pepaworld-sync-test-'));
  t.after(() => rm(root, {recursive: true, force: true}));
  const repo = join(root, 'work'), remote = join(root, 'remote.git');
  await mkdir(repo); await mkdir(join(repo, 'data'));
  git(root, 'init', '--bare', '--initial-branch=main', remote);
  git(repo, 'init', '--initial-branch=main');
  git(repo, 'config', 'user.name', 'Local QA'); git(repo, 'config', 'user.email', 'qa@example.invalid');
  for (const name of FILES) await writeFile(join(repo, 'data', name), encoded(fixtures()[name]));
  git(repo, 'add', 'data'); git(repo, 'commit', '-m', 'Local fixtures'); git(repo, 'remote', 'add', 'origin', remote); git(repo, 'push', '-u', 'origin', 'main');
  const before = git(remote, 'rev-parse', 'main');
  return {repo, remote, before};
}
async function unchanged({repo, remote, before}) {
  assert.equal(git(remote, 'rev-parse', 'main'), before);
  assert.equal(git(repo, 'status', '--porcelain'), '');
}

test('G: complete valid snapshot updates and pushes only three data files', async t => {
  const r = await repository(t), docs = fixtures();
  for (const value of Object.values(docs)) value.generatedAt = '2026-09-27T00:05:00Z';
  await sync(r.repo, fetcher(docs)); assert.deepEqual(publish(r.repo), {committed: true});
  assert.notEqual(git(r.remote, 'rev-parse', 'main'), r.before);
  assert.deepEqual(git(r.remote, 'diff', '--name-only', r.before, 'main').split('\n').sort(), FILES.map(f => 'data/' + f).sort());
});
test('H: unchanged snapshot creates no empty commit', async t => {
  const r = await repository(t); await sync(r.repo, fetcher()); assert.equal(publish(r.repo).committed, false); await unchanged(r);
});
for (const [label, mutate] of [
  ['J: incorrect schema', d => d['status.json'].schema = 2],
  ['K: incorrect project', d => d['rankings.json'].project = 'Other'],
  ['L: nested private field', d => d['achievements.json'].achievements[0].reward.inventory = []],
  ['missing generatedAt', d => delete d['rankings.json'].generatedAt],
  ['invalid calendar date', d => d['status.json'].generatedAt = '2026-02-30T00:00:00Z'],
  ['hidden achievement', d => d['achievements.json'].achievements[0].hidden = true],
  ['unknown fields', d => d['rankings.json'].rankings.playtime[0].metadata = {}],
  ['wrong array type', d => d['rankings.json'].rankings.deaths = {}],
  ['unsafe counter', d => d['rankings.json'].rankings.deaths[0].value = 9007199254740992],
]) {
  test(`${label}: all previous files and remote commit preserved`, async t => {
    const r = await repository(t), docs = fixtures(); mutate(docs);
    await assert.rejects(sync(r.repo, fetcher(docs))); await unchanged(r);
  });
}
test('I/N: first valid, second corrupt: no partial update or commit', async t => {
  const r = await repository(t), source = fetcher();
  await assert.rejects(sync(r.repo, async (url, options) => url.endsWith('achievements.json')
    ? new Response('{BROKEN', {headers: {'content-type': 'application/json'}}) : source(url, options)));
  await unchanged(r);
});
test('M: connection failure preserves complete previous snapshot', async t => {
  const r = await repository(t); await assert.rejects(sync(r.repo, async () => {throw new TypeError('Connection refused');})); await unchanged(r);
});
test('offline is valid and is never inferred from a failed download', () => {
  const doc = fixtures()['status.json']; doc.status = 'offline'; doc.server.online = false; doc.server.playersOnline = 0;
  assert.equal(validate('status.json', encoded(doc)).status, 'offline');
});
test('privacy guard checks recursively and normalizes key case/separators', () => {
  for (const key of ['inventory', 'enderChest', 'ender_chest', 'curios', 'coordinates', 'position', 'ip', 'address',
    'launcher', 'password', 'secret', 'token', 'logs', 'snapshot', 'securitycraft', 'UUID', 'INVENTORY']) {
    assert.throws(() => privacyGuard({nested: [{[key]: 'private sentinel'}]}), /Privacy guard/);
  }
});
test('ISO UTC supports Java nanoseconds, leap dates and old snapshots', () => {
  for (const date of ['2000-02-29T23:59:59Z', '2026-09-27T00:00:00.123456789Z', '2020-01-01T00:00:00Z']) validTimestamp(date);
  for (const date of [null, '2026-02-29T00:00:00Z', '2026-13-01T00:00:00Z', '2026-01-01T24:00:00Z', 'yesterday', '2026-01-01']) assert.throws(() => validTimestamp(date));
});
for (const status of [301, 302, 404, 500, 503]) {
  test(`HTTP ${status}: no public snapshot replacement`, async t => {
    const r = await repository(t); await assert.rejects(sync(r.repo, async () => new Response('error', {status}))); await unchanged(r);
  });
}
test('HTML, oversized body and invalid UTF-8 rejected without logging content', async () => {
  await assert.rejects(download('status.json', async () => new Response('<secret>', {headers: {'content-type': 'text/html'}})));
  await assert.rejects(download('status.json', async () => new Response(Buffer.alloc(MAX_BYTES + 1), {headers: {'content-type': 'application/json'}})));
  assert.throws(() => validate('status.json', Buffer.from([0xff])), /^Error: Invalid UTF-8 or JSON$/);
  assert.throws(() => validate('status.json', Buffer.from('{"secret-sentinel"')), error => !error.message.includes('sentinel'));
});
test('publishing refuses unrelated changes or staged files', async t => {
  const r = await repository(t); await writeFile(join(r.repo, 'unrelated.txt'), 'never publish'); git(r.repo, 'add', 'unrelated.txt');
  assert.throws(() => publish(r.repo), /Unexpected staged/); assert.equal(git(r.remote, 'rev-parse', 'main'), r.before);
});
test('workflow has manual and scheduled runs; only minimal token permissions', async () => {
  const yaml = await readFile(new URL('../.github/workflows/sync-public-data.yml', import.meta.url), 'utf8');
  for (const text of ['workflow_dispatch:', "cron: '*/5 * * * *'", 'contents: write', 'cancel-in-progress: false', 'timeout-minutes: 5']) assert.ok(yaml.includes(text));
  assert.ok(!/secrets\.|force|pull_request_target/.test(yaml));
});
