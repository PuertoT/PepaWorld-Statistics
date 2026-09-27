import {mkdtemp, readFile, writeFile, rename, rm, lstat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {FILES, MAX_BYTES, validate} from './validate-public-data.mjs';

export const BASE_URL = 'https://stats-pepaworld.minecra.fr/';
export async function download(name, fetcher = fetch) {
  if (!FILES.includes(name)) throw new Error('Unsupported document');
  let response;
  let reason = 'network, TLS, timeout or redirect';
  try {
    response = await fetcher(BASE_URL + name, {redirect: 'error', signal: AbortSignal.timeout(20000),
      headers: {Accept: 'application/json', 'Cache-Control': 'no-cache'}});
    if (response.status !== 200) { reason = `HTTP ${response.status}`; throw new Error(); }
    if (!/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') ?? '')) { reason = 'invalid Content-Type'; throw new Error(); }
    const length = response.headers.get('content-length');
    if (length !== null && (!/^\d+$/.test(length) || Number(length) > MAX_BYTES)) { reason = 'Content-Length limit'; throw new Error(); }
    let size = 0;
    const chunks = [];
    if (!response.body) { reason = 'empty response body'; throw new Error(); }
    for await (const chunk of response.body) {
      size += chunk.byteLength;
      if (size > MAX_BYTES) { reason = 'body size limit'; throw new Error(); }
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  } catch {
    try { await response?.body?.cancel(); } catch { /* Body may already be closed. */ }
    throw new Error(`Download failed: ${name} (${reason}). Existing data preserved.`);
  }
}

export async function sync(repo, fetcher = fetch) {
  const staging = await mkdtemp(join(tmpdir(), 'pepaworld-public-'));
  const replacements = [];
  try {
    // Download to temporary files. No writes to data/ until ALL documents pass validation.
    for (const name of FILES) await writeFile(join(staging, name), await download(name, fetcher), {flag: 'wx', mode: 0o600});
    for (const name of FILES) {
      try { validate(name, await readFile(join(staging, name))); }
      catch (error) { throw new Error(`Validation failed: ${name}: ${error.message}. Existing data preserved.`); }
    }
    const data = join(repo, 'data');
    if (!(await lstat(data)).isDirectory() || (await lstat(data)).isSymbolicLink()) throw new Error('Unsafe data directory');
    for (const name of FILES) {
      if (!(await lstat(join(data, name))).isFile()) throw new Error('Unsafe destination');
    }
    // Same-directory staging supports rename across Windows/Linux without cross-volume moves.
    for (const name of FILES) {
      const target = join(data, name + '.sync-tmp');
      await writeFile(target, await readFile(join(staging, name)), {flag: 'wx', mode: 0o600});
      replacements.push(target);
    }
    for (const name of FILES) await rename(join(data, name + '.sync-tmp'), join(data, name));
    // Git commit is the remote all-or-none transaction. A failed local replacement never invokes publish.
    return {validated: FILES.length};
  } finally {
    await Promise.all(replacements.map(path => rm(path, {force: true})));
    await rm(staging, {recursive: true, force: true});
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await sync(process.cwd()); console.log('Validated all 3 public documents; ready for git diff.'); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
