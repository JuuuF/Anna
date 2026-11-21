// Data layer. Everything lives as files in the GitHub repository that also hosts the page:
//
//   data/public.json   person + moments everybody may see (plain)
//   data/private.enc   moments for family & friends (AES-GCM, encrypted with the "content key")
//   data/users.json    one sealed box per account; a box opens only with that account's name + password
//                      and contains the content key and (for people who may write) a GitHub access token
//   media/*.jpg|*.bin  photos, plain (public) or encrypted (private)
//
// Nothing secret is ever part of the page's code. Whoever does not know a name + password pair
// only gets ciphertext. Roles (admin / editor / viewer) are a courtesy of the interface, not a security boundary.
export const REPO = 'JuuuF/Annas-Licht', BRANCH = 'main';
const API = `https://api.github.com/repos/${REPO}`;
const te = new TextEncoder(), td = new TextDecoder();
const rnd = n => crypto.getRandomValues(new Uint8Array(n));
export const newId = () => Array.from(rnd(8), b => b.toString(16).padStart(2, '0')).join('');

export function b64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
export const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));

export const state = {
  person: { name: 'Anna', birth: '1970-05-02', death: '2026-09-15' },
  items: [], accounts: [], users: { salt: '', users: [] }, session: null,
  cats: null,           // the family's own list of themes, or null for the starting set
};
let contentKey = null;
const photoCache = new Map();

// ---------- crypto ----------
const aesKey = raw => crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
async function seal(key, bytes) {
  const iv = rnd(12), ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes));
  const out = new Uint8Array(12 + ct.length); out.set(iv); out.set(ct, 12);
  return out;
}
const unseal = async (key, bytes) => new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.subarray(0, 12) }, key, bytes.subarray(12)));
async function passKey(name, pass, salt) {
  const base = await crypto.subtle.importKey('raw', te.encode(name.trim().toLowerCase() + '\n' + pass), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 600000 }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

// ---------- GitHub ----------
async function gh(path, opt = {}) {
  const r = await fetch(API + path, {
    method: opt.method || 'GET', body: opt.body ? JSON.stringify(opt.body) : undefined, cache: 'no-store',
    headers: {
      Authorization: `Bearer ${state.session.token}`, 'X-GitHub-Api-Version': '2022-11-28',
      Accept: opt.raw ? 'application/vnd.github.raw+json' : 'application/vnd.github+json',
    },
  });
  if (!r.ok) {
    const e = new Error(r.status === 401 ? 'Der GitHub-Zugang, mit dem diese Seite speichert, ist abgelaufen oder ungültig. Ansehen geht weiter; zum Speichern muss in der Verwaltung ein neuer Token eingetragen werden.'
      : r.status === 403 || r.status === 429 ? 'GitHub nimmt gerade nichts an (zu viele Anfragen oder fehlende Berechtigung). Bitte in ein paar Minuten noch einmal versuchen.'
        : `GitHub antwortet mit Fehler ${r.status}`);
    e.status = r.status; throw e;
  }
  return opt.raw ? new Uint8Array(await r.arrayBuffer()) : r.json();
}
// Exact bytes of a file. The "contents" endpoint re-encodes files it takes for text (it corrupted our ciphertext),
// so it is only asked for the blob id; the blob endpoint returns the bytes untouched.
async function fromRepo(path) {
  try {
    const meta = await gh(`/contents/${path}?ref=${BRANCH}`);
    return unb64((await gh(`/git/blobs/${meta.sha}`)).content.replace(/\s/g, ''));
  } catch (e) { if (e.status === 404) return null; throw e; }
}

// fresh = read straight from the repository (needs a token), otherwise from the published page.
// Looking at the page must never depend on the token: if the repository cannot be asked (token expired, GitHub unreachable),
// the published page is read instead. Only saving (strict) insists on the freshest state and fails otherwise.
async function readBytes(path, fresh, strict = false) {
  const token = state.session?.token;
  if (fresh && token) {
    try { return await fromRepo(path); } catch (e) { if (strict) throw e; }
  }
  const r = await fetch(`${path}?v=${Date.now()}`, { cache: 'no-store' }).catch(() => null);
  if (r?.ok) return new Uint8Array(await r.arrayBuffer());
  return token && !fresh ? fromRepo(path).catch(() => null) : null;
}
const readJson = async (path, fresh, strict) => { const b = await readBytes(path, fresh, strict); return b && JSON.parse(td.decode(b)); };

// one commit for any number of files; bytes === null deletes a file
async function commit(files) {
  const ref = await gh(`/git/ref/heads/${BRANCH}`);
  const base = await gh(`/git/commits/${ref.object.sha}`);
  const tree = [];
  // GitHub refuses a commit that deletes a file which is not there (a photo already removed elsewhere): only delete what exists
  const there = files.some(f => !f.bytes) ? new Set((await gh(`/git/trees/${base.tree.sha}?recursive=1`)).tree.map(t => t.path)) : null;
  for (const f of files) {
    if (!f.bytes) { if (there.has(f.path)) tree.push({ path: f.path, mode: '100644', type: 'blob', sha: null }); continue; }
    const sha = (await gh('/git/blobs', { method: 'POST', body: { content: b64(f.bytes), encoding: 'base64' } })).sha;
    tree.push({ path: f.path, mode: '100644', type: 'blob', sha });
  }
  const t = await gh('/git/trees', { method: 'POST', body: { base_tree: base.tree.sha, tree } });
  const c = await gh('/git/commits', { method: 'POST', body: { message: 'Erinnerungen aktualisiert', tree: t.sha, parents: [ref.object.sha] } });
  await gh(`/git/refs/heads/${BRANCH}`, { method: 'PATCH', body: { sha: c.sha } });
}

// ---------- loading ----------
export async function load(fresh = false, strict = false) {
  const pub = await readJson('data/public.json', fresh, strict);
  const users = await readJson('data/users.json', fresh, strict);
  // before saving: never continue with a state that could not be read completely, it would be written back as "empty"
  if (strict && (!pub || !users)) throw new Error('Der aktuelle Stand konnte nicht vollständig gelesen werden. Es wurde nichts gespeichert.');
  if (users) state.users = users;
  await adoptToken();
  if (pub?.person) state.person = pub.person;
  if (pub) state.cats = pub.cats || null;
  let items = (pub?.items || []).map(i => ({ ...i, vis: 'public' }));
  state.accounts = [];
  if (contentKey) {
    const raw = await readBytes('data/private.enc', fresh, strict);
    if (strict && !raw && state.users.users.length) throw new Error('Die geschützten Erinnerungen konnten nicht gelesen werden. Es wurde nichts gespeichert.');
    if (raw) {
      const doc = JSON.parse(td.decode(await unseal(contentKey, raw)));
      items = items.concat(doc.items.map(i => ({ ...i, vis: 'private' })));
      state.accounts = doc.accounts || [];
    }
  }
  state.items = items;
}

// reload the newest state, apply a change, write everything back (retry if someone else saved in between)
async function persist(mutate, files = [], withUsers = false) {
  if (!state.session?.token) throw new Error('Zum Speichern bitte anmelden.');
  const strip = vis => state.items.filter(i => i.vis === vis).map(({ vis: _, ...i }) => i);
  for (let n = 0; ; n++) {
    await load(true, true);
    mutate();
    const out = [...files,
      { path: 'data/public.json', bytes: te.encode(JSON.stringify({ person: state.person, ...(state.cats ? { cats: state.cats } : {}), items: strip('public') }, null, 1)) },
      { path: 'data/private.enc', bytes: await seal(contentKey, te.encode(JSON.stringify({ items: strip('private'), accounts: state.accounts }))) }];
    if (withUsers) out.push({ path: 'data/users.json', bytes: te.encode(JSON.stringify(state.users)) });
    try { return await commit(out); } catch (e) { if (n >= 2 || e.status !== 422) throw e; }
  }
}

// ---------- accounts ----------
const KEEP = 'annas-licht-session';
const local = () => { try { return globalThis.localStorage; } catch { return null; } };

async function start(session, remember) {
  state.session = session;
  contentKey = await aesKey(unb64(session.key));
  await adoptToken();
  if (remember) local()?.setItem(KEEP, JSON.stringify(session));
}
// The GitHub token expires sooner or later. A replacement is kept in data/users.json, sealed with the content key,
// and takes the place of the token inside each account's box - otherwise every account would have to be created anew.
let adopting = true;
async function adoptToken() {
  const s = state.session;
  if (!adopting || !s || !contentKey || s.role === 'viewer' || !state.users.token) return;
  try { const t = td.decode(await unseal(contentKey, unb64(state.users.token))); if (t) s.token = t; } catch { /* not ours to read */ }
}
export async function setToken(token) {
  const old = state.session.token, fresh = token.trim();
  adopting = false; state.session.token = fresh;
  try {
    const sealed = b64(await seal(contentKey, te.encode(fresh)));
    await persist(() => { state.users.token = sealed; }, [], true);
    if (local()?.getItem(KEEP)) local().setItem(KEEP, JSON.stringify(state.session));
  } catch (e) { state.session.token = old; throw e; } finally { adopting = true; }
}
export async function restore() {
  const saved = local()?.getItem(KEEP);
  if (saved) await start(JSON.parse(saved), false);
}
export async function login(name, pass, remember) {
  if (!state.users.users.length) throw new Error('Die Seite ist noch nicht eingerichtet.');
  const key = await passKey(name, pass, unb64(state.users.salt));
  for (const u of state.users.users) {
    let box;
    try { box = JSON.parse(td.decode(await unseal(key, unb64(u.box)))); } catch { continue; }
    await start({ ...box, id: u.id }, remember);
    return load(true);
  }
  throw new Error('Name oder Passwort stimmen nicht.');
}
export function logout() {
  state.session = null; contentKey = null; photoCache.clear();
  local()?.removeItem(KEEP);
  return load();
}
const makeBox = async (salt, name, pass, role) => b64(await seal(await passKey(name, pass, salt), te.encode(JSON.stringify({
  name: name.trim(), role, key: state.session.key, token: role === 'viewer' ? null : state.session.token,
}))));

// first run: creates the content key and the first (admin) account
export async function setup(name, pass, token, remember) {
  if (state.users.users.length) throw new Error('Die Seite ist bereits eingerichtet.');
  const salt = rnd(16), id = newId();
  await start({ id, name: name.trim(), role: 'admin', key: b64(rnd(32)), token: token.trim() }, false);
  try {
    const box = await makeBox(salt, name, pass, 'admin');
    await persist(() => {
      state.users = { salt: b64(salt), users: [{ id, box }] };
      state.accounts = [{ id, name: name.trim(), role: 'admin' }];
    }, [], true);
  } catch (e) { state.session = null; contentKey = null; throw e; }
  if (remember) local()?.setItem(KEEP, JSON.stringify(state.session));
}
export async function addUser(name, pass, role) {
  const id = newId(), box = await makeBox(unb64(state.users.salt), name, pass, role);
  await persist(() => {
    state.users.users.push({ id, box });
    state.accounts.push({ id, name: name.trim(), role });
  }, [], true);
}
export const removeUser = id => persist(() => {
  state.users.users = state.users.users.filter(u => u.id !== id);
  state.accounts = state.accounts.filter(a => a.id !== id);
}, [], true);
export const setPerson = person => persist(() => { state.person = person; });
export const setCats = cats => persist(() => { state.cats = cats; });

// ---------- moments ----------
export const canWrite = () => !!state.session?.token;
export const canEdit = item => canWrite() && !item.fixed && (state.session.role === 'admin' || item.by === state.session.name);

// decrypted JPEG bytes of a photo
export function photoBytes(path) {
  if (!photoCache.has(path)) {
    photoCache.set(path, readBytes(path, false).then(b => {
      if (!b) throw new Error('Foto nicht gefunden');
      return path.endsWith('.bin') ? unseal(contentKey, b) : b;
    }));
  }
  return photoCache.get(path);
}
async function storePhoto(bytes, priv, files) {
  const path = `media/${newId()}.${priv ? 'bin' : 'jpg'}`;
  files.push({ path, bytes: priv ? await seal(contentKey, bytes) : bytes });
  photoCache.set(path, Promise.resolve(bytes));
  return path;
}
// item.photos: paths to keep; newPhotos: JPEG bytes to add; removed: paths to delete
// prepares one moment for saving: stores its photos the right way and collects the files to write
async function stage(item, newPhotos, removed, files) {
  const priv = item.vis === 'private', photos = [];
  files.push(...removed.map(path => ({ path, bytes: null })));
  for (const p of item.photos || []) {
    if (p.endsWith('.bin') === priv) { photos.push(p); continue; }
    photos.push(await storePhoto(await photoBytes(p), priv, files));     // visibility changed: store it the other way
    files.push({ path: p, bytes: null });
  }
  for (const bytes of newPhotos) photos.push(await storePhoto(bytes, priv, files));
  return { ...item, photos, id: item.id || newId(), by: item.by || state.session.name, updated: new Date().toISOString() };
}
// several moments in one go (one commit): entries = [{ item, newPhotos, removed }]
export async function saveMany(entries) {
  const files = [], clean = [];
  for (const e of entries) clean.push(await stage(e.item, e.newPhotos || [], e.removed || [], files));
  const ids = new Set(clean.map(c => c.id));
  await persist(() => { state.items = state.items.filter(i => !ids.has(i.id)).concat(clean); }, files);
  return clean;
}
export const saveItem = async (item, newPhotos = [], removed = []) => (await saveMany([{ item, newPhotos, removed }]))[0];
export const deleteItem = item => persist(
  () => { state.items = state.items.filter(i => i.id !== item.id); },
  (item.photos || []).map(path => ({ path, bytes: null })));
