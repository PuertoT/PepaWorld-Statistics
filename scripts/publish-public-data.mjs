import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {readFileSync} from 'node:fs';
import {FILES, validate} from './validate-public-data.mjs';

export function publish(repo) {
  const git = (...args) => execFileSync('git', args, {cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']});
  const paths = FILES.map(name => `data/${name}`);
  // Revalidate even if this script is invoked independently.
  for (const name of FILES) validate(name, readFileSync(resolve(repo, 'data', name)));
  if (git('diff', '--cached', '--name-only').trim()) throw new Error('Unexpected staged changes; publication stopped');
  const changed = git('diff', '--name-only').trim().split('\n').filter(Boolean);
  if (changed.some(path => !paths.includes(path))) throw new Error('Changes outside public data; publication stopped');
  if (!changed.length) return {committed: false};
  git('add', '--', ...paths);
  git('-c', 'user.name=PepaWorld Bot', '-c', 'user.email=pepaworld-bot@users.noreply.github.com',
    'commit', '-m', 'chore: update public PepaWorld data', '--', ...paths);
  git('push', 'origin', 'HEAD:main'); // No force, rebase or credentials outside checkout's ephemeral token.
  return {committed: true};
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(publish(process.cwd()).committed ? 'Public snapshot committed and pushed.' : 'No changes; no commit.'); }
  catch { console.error('Publication stopped: validation or git failed. No force push attempted.'); process.exitCode = 1; }
}
