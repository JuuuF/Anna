// Round-trip test of the data layer against an in-memory stand-in for GitHub.  Run: node tools/test_store.mjs
import assert from 'node:assert';
const files = new Map(), blobs = new Map(); let head = 1, commits = 0;
const mem = new Map(); globalThis.localStorage = { getItem: k => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v), removeItem: k => mem.delete(k) };
const res = (status, body) => ({ ok: status < 300, status, json: async () => body, arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) });
globalThis.fetch = async (url, opt = {}) => {
  const u = String(url), body = opt.body && JSON.parse(opt.body);
  if (!u.startsWith('https://')) { const f = files.get(u.split('?')[0]); return f ? res(200, f) : res(404, new Uint8Array()); }
  assert.equal(opt.headers.Authorization, 'Bearer TOKEN');
  const p = u.replace('https://api.github.com/repos/JuuuF/Annas-Licht', '');
  if (p.startsWith('/contents/')) { const path = p.slice(10).split('?')[0]; return files.has(path) ? res(200, { sha: 'f:' + path }) : res(404, {}); }
  if (p.startsWith('/git/blobs/f:')) return res(200, { content: Buffer.from(files.get(p.slice(13))).toString('base64').replace(/(.{60})/g, '$1\n') });
  if (p === '/git/ref/heads/main') return res(200, { object: { sha: 'c' + head } });
  if (p.startsWith('/git/commits/')) return res(200, { tree: { sha: 't' } });
  if (p === '/git/blobs') { const sha = 'b' + blobs.size; blobs.set(sha, Uint8Array.from(atob(body.content), c => c.charCodeAt(0))); return res(201, { sha }); }
  if (p === '/git/trees') { blobs.set('pending', body.tree); return res(201, { sha: 't' }); }
  if (p === '/git/commits') { assert.equal(body.parents[0], 'c' + head); return res(201, { sha: 'c' + (head + 1) }); }
  if (p === '/git/refs/heads/main') { for (const e of blobs.get('pending')) e.sha ? files.set(e.path, blobs.get(e.sha)) : files.delete(e.path); head++; commits++; return res(200, {}); }
  throw new Error('unexpected ' + p);
};
const te = new TextEncoder(), text = p => new TextDecoder().decode(files.get(p));
files.set('data/public.json', te.encode('{"person":{"name":"Anna","birth":"1970-05-02","death":"2026-09-15"},"items":[]}'));
files.set('data/users.json', te.encode('{"salt":"","users":[]}'));
const store = await import('../js/store.js');

await store.load();
await assert.rejects(store.login('papa', 'x', false), /noch nicht eingerichtet/);
await store.setup('Justin', 'ein langes passwort', 'TOKEN', true);
assert.equal(JSON.parse(text('data/users.json')).users.length, 1);
await store.addUser('Papa', 'sternenlicht', 'editor');
await store.addUser('Gast', 'nur gucken', 'viewer');

const jpg = Uint8Array.from([255, 216, 1, 2, 3, 4]);
const priv = await store.saveItem({ title: 'Geheimer Tag', date: '1998-05-23T14:30', vis: 'private', photos: [] }, [jpg]);
const pub = await store.saveItem({ title: 'Öffentlicher Tag', date: '2004-10-01', vis: 'public', photos: [] }, [jpg]);
assert.ok(priv.photos[0].endsWith('.bin') && pub.photos[0].endsWith('.jpg'));
assert.ok(!text('data/public.json').includes('Geheimer') && text('data/public.json').includes('Öffentlicher'));
assert.ok(!Buffer.from(files.get('data/private.enc')).includes('Geheimer'), 'private data must be ciphertext');
assert.ok(!Buffer.from(files.get(priv.photos[0])).includes(Buffer.from(jpg)), 'private photo must be ciphertext');
assert.ok(!text('data/users.json').includes('TOKEN') && !text('data/users.json').includes('Papa'));

await store.setCats([{ id: 'liebe', name: 'Liebe', color: '#ff0000' }, { id: 'sonst', name: 'Sonstiges', color: '#cccccc' }]);
assert.ok(text('data/public.json').includes('"cats"') && store.state.cats.length === 2);
const many = await store.saveMany([{ item: { title: 'Fotos', date: '2019-08-12', vis: 'private', photos: [] }, newPhotos: [jpg, jpg] },
  { item: { ...pub, title: 'Öffentlicher Tag' }, newPhotos: [jpg] }]);
assert.equal(many[0].photos.length, 2); assert.equal(many[1].photos.length, 2); assert.equal(store.state.items.length, 3);
await store.deleteItem(many[0]);
await store.logout();                                   // visitor without account
assert.deepEqual(store.state.items.map(i => i.title), ['Öffentlicher Tag']);
await assert.rejects(store.login('Papa', 'falsch', false), /stimmen nicht/);
await store.login(' papa ', 'sternenlicht', false);     // name is case-insensitive
assert.equal(store.state.session.role, 'editor');
assert.equal(store.state.items.length, 2);
assert.deepEqual([...await store.photoBytes(priv.photos[0])], [...jpg]);
const mine = await store.saveItem({ title: 'Von Papa', date: '2010-01-01', vis: 'private', photos: [] });
assert.equal(mine.by, 'Papa');
assert.ok(store.canEdit(mine) && !store.canEdit(store.state.items.find(i => i.id === priv.id)));

const moved = await store.saveItem({ ...store.state.items.find(i => i.id === priv.id), vis: 'public' });   // private -> public moves the photo
assert.ok(moved.photos[0].endsWith('.jpg') && !files.has(priv.photos[0]));
assert.deepEqual([...files.get(moved.photos[0])], [...jpg]);
await store.deleteItem(moved);
assert.ok(!files.has(moved.photos[0]) && store.state.items.length === 2);

await store.logout(); await store.login('Gast', 'nur gucken', true);
assert.ok(!store.canWrite() && store.state.items.length === 2);
await assert.rejects(store.saveItem({ title: 'x', date: '2000-01-01', vis: 'private' }), /anmelden/);
await store.logout(); assert.equal(mem.size, 0);
console.log('ok -', commits, 'commits');
