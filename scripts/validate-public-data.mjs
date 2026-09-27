// Dependency-free, closed public schema. Never log source values or parser excerpts.
export const FILES = Object.freeze(['status.json', 'achievements.json', 'rankings.json']);
export const MAX_BYTES = 2 * 1024 * 1024;
const forbidden = new Set(['inventory', 'inventories', 'enderchest', 'curios', 'coordinates',
  'position', 'ip', 'address', 'launcher', 'password', 'secret', 'secrets', 'token', 'tokens',
  'logs', 'snapshot', 'snapshots', 'securitycraft', 'uuid', 'playerdata', 'commands', 'credentials']);
const fail = message => { throw new Error(message); };
const check = (condition, message = 'Invalid public schema') => { if (!condition) fail(message); };
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function keys(value, required, optional = []) {
  check(object(value));
  check(required.every(key => Object.hasOwn(value, key)));
  check(Object.keys(value).every(key => [...required, ...optional].includes(key)), 'Unexpected public field');
}
function text(value, max) {
  check(typeof value === 'string' && value.length <= max && !/[\x00-\x1f\x7f]/.test(value));
}
const integer = (n, min = 0, max = Number.MAX_SAFE_INTEGER) => check(Number.isSafeInteger(n) && n >= min && n <= max);

export function privacyGuard(value) {
  const pending = [[value, 0]];
  let visited = 0;
  while (pending.length) {
    const [item, depth] = pending.pop();
    check(depth <= 16 && ++visited <= 100000, 'Public JSON complexity limit');
    if (item && typeof item === 'object') {
      for (const [key, child] of Object.entries(item)) {
        check(!forbidden.has(key.replace(/[^a-z0-9]/gi, '').toLowerCase()), 'Privacy guard rejected a field');
        pending.push([child, depth + 1]);
      }
    }
  }
}

export function validTimestamp(value) {
  // ISO 8601 UTC, matching Java Instant (including nanoseconds). Reject normalized invalid dates.
  check(typeof value === 'string', 'Invalid generatedAt');
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?Z$/.exec(value);
  check(m !== null, 'Invalid generatedAt');
  const [year, month, day, hour, minute, second] = m.slice(1).map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  check(year >= 1 && month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1]
    && hour <= 23 && minute <= 59 && second <= 59 && Number.isFinite(Date.parse(value)), 'Invalid generatedAt');
}

export function validate(name, bytes) {
  check(FILES.includes(name), 'Unsupported document');
  check(bytes.byteLength <= MAX_BYTES, 'Public document size limit');
  let value;
  try { value = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes)); }
  catch { fail('Invalid UTF-8 or JSON'); }
  privacyGuard(value);
  const common = ['schema', 'project', 'generatedAt'];
  const extra = name === 'status.json' ? ['status', 'server', 'mod'] : [name.slice(0, -5)];
  keys(value, [...common, ...extra]);
  check(value.schema === 1, 'Unsupported schema');
  check(value.project === 'PepaWorld 3.0', 'Incorrect project');
  validTimestamp(value.generatedAt);
  if (name === 'status.json') {
    check(['online', 'offline'].includes(value.status));
    keys(value.server, ['online', 'playersOnline', 'maxPlayers']);
    check(typeof value.server.online === 'boolean' && value.server.online === (value.status === 'online'));
    integer(value.server.playersOnline, 0, 2147483647); integer(value.server.maxPlayers, 0, 2147483647);
    check(value.server.online || value.server.playersOnline === 0);
    keys(value.mod, ['name', 'version']); check(value.mod.name === 'Statistics');
    text(value.mod.version, 64); check(/^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.+-]+)?$/.test(value.mod.version));
  } else if (name === 'achievements.json') {
    check(Array.isArray(value.achievements) && value.achievements.length <= 10000);
    const ids = new Set();
    for (const entry of value.achievements) {
      keys(entry, ['id', 'name', 'description', 'hidden'], ['category', 'icon', 'reward']);
      check(typeof entry.id === 'string' && /^[a-z0-9_]{1,64}$/.test(entry.id) && !ids.has(entry.id)); ids.add(entry.id);
      text(entry.name, 128); text(entry.description, 1024);
      check(entry.hidden === false, 'Hidden achievement cannot be public');
      if (entry.category != null) check(typeof entry.category === 'string' && /^[a-z0-9_-]{1,48}$/.test(entry.category));
      if (entry.icon != null) check(typeof entry.icon === 'string' && /^[a-z0-9_.-]+:[a-z0-9_./-]{1,128}$/.test(entry.icon));
      if (entry.reward != null) {
        keys(entry.reward, ['type', 'amount']);
        check(['hoyo_coin', 'xp', 'item', 'trophy', 'other'].includes(entry.reward.type));
        integer(entry.reward.amount, 1, 1000000000);
      }
    }
  } else {
    keys(value.rankings, ['deaths', 'zombies', 'playtime']);
    for (const rows of Object.values(value.rankings)) {
      check(Array.isArray(rows) && rows.length <= 100);
      for (const entry of rows) {
        keys(entry, ['name', 'value']);
        check(typeof entry.name === 'string' && /^[A-Za-z0-9_]{1,16}$/.test(entry.name)); integer(entry.value);
      }
    }
  }
  return value;
}
