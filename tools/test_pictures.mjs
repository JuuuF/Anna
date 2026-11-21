// How often does the picture frame show which moment?  Run: node tools/test_pictures.mjs
import assert from 'node:assert';
import { pickPicture } from '../js/util.js';

const state = { pool: [] };
for (const [id, imp, n] of [['Hochzeit', 5, 2], ['Reise', 3, 2], ['Konzert', 1, 2], ['Album', 1, 20]]) {
  const item = { id, imp, photos: Array(n).fill('x') };
  for (let k = 0; k < n; k++) state.pool.push({ path: id + k, item });
}
const seen = {}, per = {};
let repeats = 0, last = '';
const N = 40000;
for (let i = 0; i < N; i++) {
  const p = pickPicture(state);
  seen[p.item.id] = (seen[p.item.id] || 0) + 1;
  if (p.path === last) repeats++;
  last = p.path;
}
for (const [id, n] of Object.entries(seen)) per[id] = (n / N * 100).toFixed(1) + ' % of all pictures, each photo ' + (n / N * 100 / state.pool.filter(p => p.item.id === id).length).toFixed(1) + ' %';
console.log(per);
assert.equal(repeats, 0, 'no photo twice in a row');
assert.ok(seen.Hochzeit > seen.Reise && seen.Reise > seen.Konzert, 'more important moments come up more often');
assert.ok(seen.Album < seen.Hochzeit * 2.5, 'a big album does not take over');

// a moment after her last light is shown like a small one, even when it is marked as a life event
const death = 1000, later = { pool: [], death };
for (const [id, imp, t] of [['Hochzeit', 5, 500], ['Trauerfeier', 5, 2000], ['Konzert', 1, 600]]) {
  const item = { id, imp, _t: t, photos: ['x', 'x', 'x'] };
  for (let k = 0; k < 3; k++) later.pool.push({ path: id + k, item });
}
const count = {};
for (let i = 0; i < N; i++) { const p = pickPicture(later); count[p.item.id] = (count[p.item.id] || 0) + 1; }
console.log(Object.fromEntries(Object.entries(count).map(([k, v]) => [k, (v / N * 100).toFixed(1) + ' %'])));
assert.ok(Math.abs(count.Trauerfeier - count.Konzert) / N < 0.03, 'after her passing: as often as a small moment');
assert.ok(count.Hochzeit > count.Trauerfeier * 1.4, 'and clearly less often than an important one from her life');
console.log('ok');
