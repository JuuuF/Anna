// Interface: canvas interaction, floating panels, moments, accounts.
import { YEAR, AU, LS, CATS, catColor, parseWhen, esc, num, fmtDate, fmtWhen, dur, fmtDist, readDate, readTime, dateInput, timeInput } from './util.js';
import { vec, bodies, updateBodies, sunAltitude } from './astro.js';
import * as store from './store.js';
import { drawSpace, cam, fit, clampScale, panBy, atHome } from './space.js';
import { createLife } from './life.js';
import { drawSky, skyCam, lookAt, starAltAz, weather, loadWeather, weatherAt } from './sky.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const S = { calm: matchMedia('(prefers-reduced-motion: reduce)').matches, t: Date.now(), offset: 0, view: 'space', sel: null, hover: null, stars: [], sky: null, items: [], birth: 0, death: 0, skyT: null };
const cv = $('#view'), ctx = cv.getContext('2d');
let W = 0, H = 0, hits = [], ticks = 0;

// ---------- model ----------
function rebuild() {
  const p = store.state.person;
  S.birth = parseWhen(p.birth); S.death = parseWhen(p.death);
  const fixed = [
    { id: 'birth', title: 'Geburt', date: p.birth, cat: 'freude', text: 'Ihr erstes Licht.', fixed: true, vis: 'public' },
    { id: 'death', title: 'Letztes Licht', date: p.death, cat: 'sonst', text: 'Der letzte Augenblick ihres Lebens. Auch dieses Licht reist weiter – hinter ihm folgt alles, was von ihr bleibt.', fixed: true, vis: 'public' },
  ];
  const selId = S.sel?.id;
  S.items = [...fixed, ...store.state.items].map(i => ({
    ...i, _t: parseWhen(i.date), _e: i.period ? (i.end ? parseWhen(i.end.length <= 10 ? i.end + 'T23:59' : i.end) : S.death) : null,
  })).sort((a, b) => a._t - b._t);
  if (selId) S.sel = S.items.find(i => i.id === selId) || null;
  renderAll();
}
const litStars = () => { const a = (S.t - S.death) / YEAR, b = (S.t - S.birth) / YEAR; return S.stars.filter(s => s.d >= a && s.d <= b); };
function ageYears(at) {
  const b = new Date(S.birth), a = new Date(at);
  let y = a.getFullYear() - b.getFullYear();
  if (a.getMonth() < b.getMonth() || (a.getMonth() === b.getMonth() && a.getDate() < b.getDate())) y--;
  return y;
}
function age(at, verb = 'ist') {
  const y = ageYears(at);
  if (y >= 1) return `Anna ${verb} ${y} ${y === 1 ? 'Jahr' : 'Jahre'} alt.`;
  const m = Math.floor((at - S.birth) / YEAR * 12);
  return m < 1 ? `Anna ${verb} gerade erst geboren.` : `Anna ${verb} ${m} ${m === 1 ? 'Monat' : 'Monate'} alt.`;
}
const inLife = at => at >= S.birth && at <= S.death;
function spanWhere(i, at) {
  const into = at - i._t, total = i._e - i._t;
  const part = total > 1.5 * YEAR ? `das ${Math.floor(into / YEAR) + 1}. Jahr` : into < total / 3 ? 'gerade erst begonnen' : into > total * 2 / 3 ? 'schon fast vorbei' : 'mittendrin';
  return part + (i.end ? `, zu Ende in ${dur(i._e - at)}` : '');
}

// ---------- canvas ----------
function frame() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  if (cv.width !== Math.round(cv.clientWidth * dpr) || cv.height !== Math.round(cv.clientHeight * dpr)) {
    cv.width = Math.round(cv.clientWidth * dpr); cv.height = Math.round(cv.clientHeight * dpr);
  }
  W = cv.clientWidth; H = cv.clientHeight;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  S.t = Date.now() + S.offset * YEAR;
  // on phones an open sheet covers the lower part: keep the middle of the map in the part that stays visible
  // keep the middle of the map in the part of the screen that is not covered by a sheet or a card
  const small = innerWidth <= 760, sheet = small && $$('.panel').find(p => !p.hidden), card = $$('#yearcard, #journey').find(c => !c.hidden);
  const top = small ? 176 : 30, bottom = sheet ? sheet.offsetHeight : card ? H - card.getBoundingClientRect().top : 122;
  const want = top + Math.max(120, H - top - bottom) / 2;
  S.cy = (S.cy ?? want) + (want - (S.cy ?? want)) * 0.15;
  updateBodies(S.t);
  hits = (S.view === 'space' ? drawSpace : drawSky)(ctx, W, H, S);
  $('#homeBtn').hidden = atHome();
  if (S.view === 'space') { $('#thumb').style.top = scaleY(Math.min(W, H) * 0.4 / cam.scale) + 'px'; if (++ticks % 90 === 1) layoutScale(); }
  requestAnimationFrame(frame);
}
function pick(x, y, reach = 20) {
  let best = null;
  for (const h of hits) { const d = Math.hypot(h.x - x, h.y - y); if (d < reach) { reach = d; best = h.o; } }
  return best;
}
// fly to something and look at it up close; the camera then turns and zooms around it instead of the Earth
function flyTo(o) {
  if (!o) return;
  const room = o.kind === 'body' ? Math.max(o.d * 0.6, 4 * LS) : o._e ? Math.max(4, (Math.min(o._e, S.t) - o._t) / YEAR * 0.75) : o.kind === 'star' ? 6 : 4;
  cam.focus = o; cam.target = clampScale(fit(room, W, H)); cam.touched = performance.now();
}
function goHome() { cam.focus = null; cam.tc = [0, 0, 0]; cam.touched = performance.now(); }
const pointers = new Map();
let moved = 0, pinch = 0, mid = null;
cv.addEventListener('contextmenu', e => e.preventDefault());
cv.addEventListener('pointerdown', e => { if (J.on && !J.paused && !J.list[J.i].end) { J.paused = true; showStation(); }   // touching the map pauses the journey
  cv.setPointerCapture(e.pointerId); pointers.set(e.pointerId, [e.clientX, e.clientY]); moved = 0; pinch = 0; mid = null; cam.touched = performance.now(); });
cv.addEventListener('pointermove', e => {
  const prev = pointers.get(e.pointerId);
  if (!prev) { S.hover = pick(e.clientX, e.clientY); cv.classList.toggle('point', !!S.hover); return; }
  const dx = e.clientX - prev[0], dy = e.clientY - prev[1];
  pointers.set(e.pointerId, [e.clientX, e.clientY]);
  moved += Math.abs(dx) + Math.abs(dy); cam.touched = performance.now();
  const sky = S.view === 'sky';
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()], dist = Math.hypot(a[0] - b[0], a[1] - b[1]), m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    if (pinch && sky) skyCam.zoom = skyCam.tzoom = skyCam.tzoom * dist / pinch;
    else if (pinch) { cam.scale = cam.target = clampScale(cam.target * dist / pinch); panBy(m[0] - mid[0], m[1] - mid[1]); }   // two fingers: zoom and move
    pinch = dist; mid = m;
  } else if (!sky && (e.shiftKey || e.buttons & 6)) {    // shift or right mouse button: move sideways
    panBy(dx, dy);
  } else if (sky) {                                  // grab the sky and pull it
    const k = 57.3 / skyCam.S;
    skyCam.az = skyCam.taz = (skyCam.taz - dx * k / Math.max(0.25, Math.cos(skyCam.alt * Math.PI / 180)) + 360) % 360;
    skyCam.alt = skyCam.talt = Math.min(89.9, Math.max(skyCam.min, skyCam.talt + dy * k));
  } else {
    cam.yaw += dx * 0.006;
    cam.pitch = Math.max(-1.5, Math.min(1.5, cam.pitch + dy * 0.006));
  }
});
const release = e => {
  if (pointers.delete(e.pointerId) && moved < 8 && e.type === 'pointerup') {
    const o = pick(e.clientX, e.clientY, e.pointerType === 'mouse' ? 20 : 30);
    if (o) select(o);
  }
  pinch = 0; mid = null;
};
cv.addEventListener('pointerup', release); cv.addEventListener('pointercancel', release);
cv.addEventListener('pointerleave', () => { S.hover = null; });
cv.addEventListener('wheel', e => {
  e.preventDefault(); cam.ease = 0.12;
  if (S.view === 'space') { cam.target = clampScale(cam.target * Math.exp(-e.deltaY * 0.0016)); cam.touched = performance.now(); }
  else skyCam.tzoom *= Math.exp(-e.deltaY * 0.0012);
}, { passive: false });
cv.addEventListener('dblclick', e => { if (S.view === 'space') flyTo(pick(e.clientX, e.clientY)); });

// ---- the ruler of distances: the named views sit where they belong, from the Moon up to her whole life ----
const VMAX = Math.log10(150), VMIN = Math.log10(1.3 * LS), scaleEl = $('#scale');
function viewRadius(z) {                               // how many light-years fit between the middle and the edge of the picture
  const dOut = (S.t - S.birth) / YEAR, dIn = Math.max((S.t - S.death) / YEAR, 2e-4);
  return z === 'life' ? Math.max(dOut, 20) * 1.08 : z === 'near' ? 13 : z === 'last' ? dIn * 1.5 : z === 'solar' ? 33 * AU : 2.4 * LS;
}
const scaleY = r => Math.min(1, Math.max(0, (VMAX - Math.log10(r)) / (VMAX - VMIN))) * scaleEl.clientHeight;
function layoutScale() { for (const b of $$('button', scaleEl)) b.style.top = scaleY(viewRadius(b.dataset.zoom)) + 'px'; }
$$('#zoom [data-zoom]').forEach(b => b.onclick = () => {
  cam.touched = performance.now(); cam.ease = 0.12; goHome();
  if (b.dataset.zoom !== 'home') cam.target = clampScale(fit(viewRadius(b.dataset.zoom), W, H));
});
function scaleDrag(e) {
  const r = scaleEl.getBoundingClientRect(), y = Math.min(r.height, Math.max(0, e.clientY - r.top));
  cam.target = clampScale(fit(10 ** (VMAX - y / r.height * (VMAX - VMIN)), W, H)); cam.ease = 0.2; cam.touched = performance.now();
}
scaleEl.addEventListener('pointerdown', e => { if (e.target.closest('button')) return; scaleEl.setPointerCapture(e.pointerId); scaleDrag(e); });
scaleEl.addEventListener('pointermove', e => { if (scaleEl.hasPointerCapture(e.pointerId)) scaleDrag(e); });
addEventListener('resize', layoutScale);

// the slow turning of the map can be switched off, to look at one arrangement in peace
try { S.still = localStorage.getItem('annas-licht-drehung') === 'aus'; } catch { /* ignore */ }
const spinText = () => { $('#spin').textContent = S.still ? 'Drehung starten' : 'Drehung anhalten'; };
$('#spin').onclick = () => { S.still = !S.still; cam.touched = 0; try { localStorage.setItem('annas-licht-drehung', S.still ? 'aus' : 'an'); } catch { /* ignore */ } spinText(); };
spinText();

function setView(v) {
  S.view = v; S.hover = null;
  document.body.classList.toggle('sky', v === 'sky');
  $$('#views [data-view]').forEach(b => b.classList.toggle('on', b.dataset.view === v));
  $('#zoom').hidden = v !== 'space'; $('#skybar').hidden = v !== 'sky';
  if (v !== 'space' && J.on) stopJourney();
  $('#hint').textContent = v === 'space' ? 'Ziehen dreht · Mausrad oder zwei Finger zoomen · Doppelklick fliegt hin · Umschalt-Taste oder zwei Finger verschieben'
    : 'Ziehen, um dich umzuschauen · Golden leuchten die Sterne, die Anna in diesem Moment sehen – mit dem Jahr, das dort gerade zu sehen ist.';
  if (v === 'sky' && S.sel?.kind === 'star') lookAt(S.sel, S.skyT ?? Date.now());
  $('#hint').style.opacity = 1; setTimeout(() => { $('#hint').style.opacity = 0; }, 9000);
}
$$('#views [data-view]').forEach(b => b.onclick = () => setView(b.dataset.view));

// night sky clock: minutes after noon of the "current" evening
const noon = () => { const d = new Date(); if (d.getHours() < 9) d.setDate(d.getDate() - 1); d.setHours(12, 0, 0, 0); return d.getTime(); };
function setSkyTime(min) {
  S.skyT = min == null ? null : noon() + min * 6e4;
  const d = new Date(S.skyT ?? Date.now());
  $('#skytime').value = Math.round((d - noon()) / 6e4);
  $('#skywhen').textContent = d.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' }) + ' · '
    + d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) + ' Uhr';
  cloudInfo();
}
function cloudInfo() {
  const w = weatherAt(S.skyT ?? Date.now());
  $('#clouds').classList.toggle('on', weather.on);
  $('#cloudinfo').textContent = weather.failed ? 'Die Wetterdaten sind gerade nicht erreichbar.'
    : !weather.hours ? '' : !w ? 'Für diese Uhrzeit gibt es keine Wettervorhersage.'
    : `Bewölkung über Neumünster: ${Math.round(w.all)} %${weather.on ? ' · Wolkenformen sind nachempfunden' : ''} · Wetterdaten: Open-Meteo`;
}
$('#clouds').onclick = () => { weather.on = !weather.on; try { localStorage.setItem('annas-licht-clouds', weather.on ? 'an' : 'aus'); } catch { /* ignore */ } cloudInfo(); };
// the sky box folds away; on phones it starts folded so it is not in the way
const foldSky = closed => { $('#skybar').classList.toggle('closed', closed); $('#skytoggle').setAttribute('aria-expanded', String(!closed)); };
$('#skytoggle').onclick = () => foldSky(!$('#skybar').classList.contains('closed'));
foldSky(innerWidth <= 1100);

$('#skytime').oninput = e => setSkyTime(+e.target.value);
$('#skynow').onclick = () => setSkyTime(null);

// ---------- panels ----------
const panel = id => $('#p-' + id);
function openPanel(id) {
  const p = panel(id), small = innerWidth <= 760;
  for (const other of $$('.panel')) if (other !== p && (small || (p.classList.contains('left') && other.classList.contains('left')))) other.hidden = true;
  p.hidden = false; syncDock();
}
const closePanel = id => { panel(id).hidden = true; syncDock(); };
const syncDock = () => $$('#dock [data-panel]').forEach(b => b.classList.toggle('on', !panel(b.dataset.panel).hidden));
$$('#dock [data-panel]').forEach(b => b.onclick = () => (panel(b.dataset.panel).hidden ? openPanel(b.dataset.panel) : closePanel(b.dataset.panel)));
for (const p of $$('.panel')) {
  $('.x', p).onclick = () => closePanel(p.id.slice(2));
  const head = $('header', p);
  head.addEventListener('pointerdown', e => {                      // drag panels around on large screens
    if (innerWidth <= 760 || e.target.closest('button')) return;
    const r = p.getBoundingClientRect(), ox = e.clientX - r.left, oy = e.clientY - r.top;
    head.setPointerCapture(e.pointerId);
    const move = m => Object.assign(p.style, { left: Math.max(0, Math.min(innerWidth - 80, m.clientX - ox)) + 'px', top: Math.max(0, Math.min(innerHeight - 50, m.clientY - oy)) + 'px', right: 'auto', bottom: 'auto', transform: 'none' });
    head.addEventListener('pointermove', move);
    head.addEventListener('pointerup', () => head.removeEventListener('pointermove', move), { once: true });
  });
}
function select(o) { if (J.on) stopJourney(); $('#yearcard').hidden = true; S.sel = o; shareHash(); if (S.view === 'sky' && o?.kind === 'star') lookAt(o, S.skyT ?? Date.now()); renderDetail(); openPanel('detail'); }

// the address bar always names what is selected, so a link to a star or a moment can be passed on
function shareHash() {
  const o = S.sel, part = !o ? '' : o.kind === 'star' || o.kind === 'body' ? 'sel=' + encodeURIComponent(o.n || o.name) : o.id ? 'm=' + o.id : '';
  history.replaceState(null, '', location.pathname + location.search + (part ? '#' + (S.view === 'sky' ? 'himmel&' : '') + part : ''));
}
async function shareLink(title) {
  const url = location.href, text = `Annas Licht – ${title}`;
  try { if (navigator.share) await navigator.share({ title: 'Annas Licht', text, url }); else { await navigator.clipboard.writeText(url); return 'Link kopiert'; } } catch { /* cancelled */ }
  return null;
}

// ---------- a chosen time on the lifeline strip ----------
const monthYear = t => new Date(t).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
const life = createLife($('#life canvas'), S, {
  onYear: selectYear,
  onItem: i => { select(i); if (S.view === 'space') flyTo(i); },
  label: t => `${new Date(t).getFullYear()} · ${ageYears(t)} ${ageYears(t) === 1 ? 'Jahr' : 'Jahre'}`,
});
function selectYear(time) {
  if (J.on) stopJourney();
  const y = { kind: 'year', _t: time, cat: 'freude', title: monthYear(time) };
  if (S.view === 'space') {                          // travel along the lifeline to that time, like the guided journey does
    cam.focus = y; cam.touched = performance.now();
    const close = fit(8, W, H);
    if (cam.target < close * 0.6 || cam.target > close * 6) cam.target = clampScale(close);
  }
  S.sel = y; closePanel('detail'); renderYear();
}
function renderYear() {
  const y = S.sel, el = $('#yearcard');
  if (y?.kind !== 'year') { el.hidden = true; return; }
  const d = (S.t - y._t) / YEAR;
  const seen = S.stars.map(s => [Math.abs(s.d - d), s]).sort((a, b) => a[0] - b[0]);
  const close = seen.filter(x => x[0] < 0.75).slice(0, 4), star = s => `<a data-star="${esc(s.n)}">${esc(s.n)}</a>`;
  const spans = S.items.filter(i => i._e && i._t <= y._t && y._t <= i._e);
  const near = S.items.filter(i => !i._e && Math.abs(i._t - y._t) < YEAR).sort((a, b) => Math.abs(a._t - y._t) - Math.abs(b._t - y._t)).slice(0, 2);
  el.innerHTML = `<button class="x" aria-label="Schließen">×</button><h3>${monthYear(y._t)}</h3>
    <p>${age(y._t, 'ist')} Das Licht dieser Tage ist jetzt <b>${fmtDist(d)}</b> entfernt.</p>
    <p>${close.length ? `Gerade zu sehen von ${close.map(x => star(x[1])).join(', ')}.`
      : `Kein Stern dieser Karte sieht gerade genau diese Wochen – am nächsten ist ${star(seen[0][1])}.`}</p>
    ${spans.length || near.length ? `<p class="muted">${[...spans.map(i => `${esc(i.title)} (${spanWhere(i, y._t)})`), ...near.map(i => `<a data-item="${i.id}">${esc(i.title)}</a> (${dur(i._t - y._t)} ${i._t < y._t ? 'davor' : 'danach'})`)].join(' · ')}</p>` : ''}
    ${S.view === 'space' ? '<div class="row"><button id="yfly">Näher heran</button><button id="yhome">Ganzes Leben zeigen</button></div>' : ''}`;
  el.hidden = false;
  $('.x', el).onclick = () => { S.sel = null; el.hidden = true; life.draw(); };
  $$('[data-star]', el).forEach(a => a.onclick = () => select(S.stars.find(s => s.n === a.dataset.star)));
  $$('[data-item]', el).forEach(a => a.onclick = () => select(S.items.find(i => i.id === a.dataset.item)));
  if ($('#yfly')) $('#yfly').onclick = () => flyTo(y);
  if ($('#yhome')) $('#yhome').onclick = () => $('#zoom [data-zoom=life]').click();
}

// ---------- the guided journey through her life ----------
const J = { on: false, list: [], i: 0, paused: false, timer: 0 };
function stations() {
  const list = S.items.filter(i => i._t <= S.t);
  if (list.length < 8) {                       // few moments so far: her round birthdays give the journey its rhythm
    for (let n = 10; n <= 50; n += 10) {
      const b = new Date(S.birth), d = new Date(b.getFullYear() + n, b.getMonth(), b.getDate(), 12).getTime();
      if (d < S.death && !list.some(i => Math.abs(i._t - d) < YEAR / 2)) list.push({ id: 'auto' + n, auto: true, title: `${n}. Geburtstag`, date: new Date(d).toISOString().slice(0, 10), _t: d, cat: 'freude' });
    }
    list.sort((a, b) => a._t - b._t);
  }
  return [...list, { end: true }];
}
function startJourney(from = 0) {
  if (S.view !== 'space') setView('space');
  $$('.panel').forEach(p => { p.hidden = true; }); syncDock();
  Object.assign(J, { on: true, list: stations(), i: from, paused: false });
  document.body.classList.add('journey'); $('#play').textContent = 'Reise beenden';
  showStation();
}
function stopJourney() {
  clearTimeout(J.timer); J.on = false;
  document.body.classList.remove('journey'); $('#journey').hidden = true; $('#play').textContent = 'Ihr Leben erleben';
}
function showStation() {
  clearTimeout(J.timer);
  const o = J.list[J.i], el = $('#journey'), n = J.list.length;
  let h, secs;
  if (o.end) {
    goHome(); S.sel = null;
    cam.target = clampScale(fit(Math.max((S.t - S.birth) / YEAR, 20) * 1.08, W, H));
    h = `<div class="jbody"><div><p class="meta">In diesem Augenblick</p><h3>Ihr Licht reist weiter</h3>
      <p>Jeder dieser Momente ist noch unterwegs. Gerade jetzt sehen ${litStars().length} Sterne dieser Karte Anna – jeder an einem anderen Tag ihres Lebens –, und mit jeder Sekunde kommen 299.792 Kilometer hinzu.</p>
      <p class="muted">Nichts davon geht verloren.</p></div></div>`;
    secs = 0;
  } else {
    S.sel = o; cam.focus = o; cam.touched = performance.now();
    cam.target = clampScale(fit(o._e ? Math.max(8, (Math.min(o._e, S.t) - o._t) / YEAR * 0.8) : 8, W, H));
    const d = (S.t - o._t) / YEAR, by = S.stars.map(s => [Math.abs(s.d - d), s]).sort((a, b) => a[0] - b[0])[0], next = S.stars.find(s => s.d > d);
    const where = o._e ? `Das Licht dieser Zeit füllt den Raum zwischen <b>${fmtDist(Math.max(0, (S.t - o._e) / YEAR))}</b> und <b>${fmtDist(d)}</b> Entfernung.`
      : by && by[0] < 0.75 ? `Dieses Licht ist jetzt <b>${fmtDist(d)}</b> entfernt – gerade bei <b>${esc(by[1].n)}</b>.`
        : `Dieses Licht ist jetzt <b>${fmtDist(d)}</b> entfernt${next ? ` und erreicht in ${dur((next.d - d) * YEAR)} <b>${esc(next.n)}</b>` : ''}.`;
    const ph = o.photos || [];
    h = `<div class="jbody">${ph.length ? `<figure><img data-photo="${esc(ph[0])}" alt="">${ph.length > 1 ? `<small>${ph.length} Fotos</small>` : ''}</figure>` : ''}
      <div><p class="meta">${J.i + 1} von ${n - 1} · ${o._e ? range(o) : fmtWhen(o.date)}${inLife(o._t) && o.id !== 'birth' ? ` · ${age(o._t, 'war').replace(/^Anna war /, '').replace(/ alt\.$/, '')}` : ''}</p>
      <h3>${esc(o.title)}</h3>${o.text ? `<p class="jtext">${esc(o.text)}</p>` : ''}<p>${where}</p></div></div>`;
    secs = Math.min(24, 8 + (o.text || '').length / 28 + ph.length * 3);
  }
  el.innerHTML = `<div class="bar">${secs ? `<i style="animation-duration:${secs}s"></i>` : ''}</div>${h}
    <div class="row"><button data-j="prev" ${J.i ? '' : 'disabled'}>Zurück</button>
      ${o.end ? '<button data-j="again">Noch einmal</button>' : `<button data-j="pause">${J.paused ? 'Abspielen' : 'Pause'}</button><button data-j="next" class="primary">Weiter</button>`}
      ${o.end || o.auto ? '' : '<button data-j="more">Ganz ansehen</button>'}<button class="x" aria-label="Reise beenden">×</button></div>`;
  el.classList.toggle('paused', J.paused); el.hidden = false; hydrate(el); life.draw();
  $('.x', el).onclick = stopJourney;
  $$('[data-j]', el).forEach(b => b.onclick = () => {
    const a = b.dataset.j;
    if (a === 'prev') { J.i--; showStation(); }
    else if (a === 'next') { J.i++; showStation(); }
    else if (a === 'again') { J.i = 0; J.paused = false; showStation(); }
    else if (a === 'pause') { J.paused = !J.paused; showStation(); }
    else if (a === 'more') { stopJourney(); select(o); }
  });
  if (secs && !J.paused) J.timer = setTimeout(() => { J.i++; showStation(); }, secs * 1000);
}
$('#play').onclick = () => (J.on ? stopJourney() : startJourney());
addEventListener('keydown', e => {
  if (e.target.closest('input, textarea, select')) return;
  if (e.key === 'Escape') { if (!$('#lightbox').hidden) $('#lightbox').hidden = true; else if (J.on) stopJourney(); else { $$('.panel').forEach(p => { p.hidden = true; }); syncDock(); } }
  if (!J.on) return;
  if (e.key === 'ArrowRight' && J.i < J.list.length - 1) { J.i++; showStation(); }
  if (e.key === 'ArrowLeft' && J.i > 0) { J.i--; showStation(); }
  if (e.key === ' ') { e.preventDefault(); J.paused = !J.paused; showStation(); }
});

// photos are fetched (and decrypted) on demand
const urls = new Map();
function hydrate(root) {
  for (const img of $$('img[data-photo]', root)) {
    const path = img.dataset.photo;
    (urls.get(path) || urls.set(path, store.photoBytes(path).then(b => URL.createObjectURL(new Blob([b], { type: 'image/jpeg' })))).get(path))
      .then(u => { img.src = u; }, () => { img.alt = 'Das Foto wird gerade noch veröffentlicht.'; });
    img.onclick = () => { if (img.src) { $('#lightbox img').src = img.src; $('#lightbox').hidden = false; } };
  }
}
$('#lightbox').onclick = () => { $('#lightbox').hidden = true; };
$('#savePic').onclick = () => cv.toBlob(b => Object.assign(document.createElement('a'), { href: URL.createObjectURL(b), download: `annas-licht-${new Date().toISOString().slice(0, 10)}.png` }).click());
const lock = i => (i.vis === 'private' ? '<span class="tag">nur Familie &amp; Freunde</span>' : '');
const range = i => (i._e ? `${fmtWhen(i.date)} – ${i.end ? fmtWhen(i.end) : 'zuletzt'}` : fmtWhen(i.date));

// ---------- detail ----------
function renderDetail() {
  const o = S.sel, el = $('#p-detail .body'), t = S.t;
  life.draw();
  if (o?.kind === 'year') return renderYear();
  if (!o) { $('#p-detail h2').textContent = 'Auswahl'; el.innerHTML = '<p class="muted">Tippe auf einen Stern oder einen Moment.</p>'; return; }
  $('#p-detail h2').textContent = o.n || o.name || o.title;
  let h = '';
  if (o._t) {                                                         // a moment or a span of time
    const d = (t - o._t) / YEAR, dEnd = o._e ? Math.max(0, (t - o._e) / YEAR) : d;
    h += `<p><span class="tag">${esc((CATS[o.cat] || CATS.sonst)[0])}</span>${lock(o)}</p><p>${range(o)}</p>`;
    if (store.canEdit(o)) h += '<p><button id="editSel" class="primary">Diesen Moment bearbeiten</button></p>';
    else if (o.fixed && store.state.session?.role === 'admin') h += '<p><button id="editBase">Datum ändern</button></p>';
    if (inLife(o._t)) h += `<p>${age(o._t, 'war')}</p>`;
    if (o.text) h += `<p>${esc(o.text).replace(/\n/g, '<br>')}</p>`;
    if (o.photos?.length) h += `<div class="photos big">${o.photos.map(p => `<figure><img data-photo="${esc(p)}" alt=""></figure>`).join('')}</div>`;
    if (d <= 0) h += '<p class="muted">Dieser Moment liegt von hier aus gesehen noch in der Zukunft.</p>';
    else if (o._e) {
      const seen = S.stars.filter(s => s.d <= d && s.d >= dEnd);
      h += `<p>Das Licht dieser Zeit füllt gerade die Kugelschale zwischen <b>${fmtDist(dEnd)}</b> und <b>${fmtDist(d)}</b> Entfernung.</p>`;
      if (seen.length) h += `<p>Diese Zeit ist jetzt zu sehen von: ${seen.slice(0, 12).map(s => esc(s.n)).join(', ')}${seen.length > 12 ? ' und weiteren' : ''}.</p>`;
    } else {
      h += `<p>Das Licht dieses Augenblicks ist jetzt <b>${fmtDist(d)}</b> von der Erde entfernt.</p>`;
      const past = S.stars.filter(s => s.d <= d).pop(), next = S.stars.find(s => s.d > d);
      if (past) h += `<p>Zuletzt erreichte es <b>${esc(past.n)}</b> – vor ${dur((d - past.d) * YEAR)}.</p>`;
      if (next) h += `<p>Als Nächstes kommt es bei <b>${esc(next.n)}</b> an – in ${dur((next.d - d) * YEAR)}.</p>`;
    }
    if (d > 0 && S.view === 'space') h += '<p><button id="fly">Näher ansehen</button></p>';
    if (o.by) h += `<p class="muted">Hinzugefügt von ${esc(o.by)}</p>`;
    if (o.vis === 'public') h += '<p><button id="share">Link teilen</button></p>';
  } else {                                                            // a star, a planet, a probe
    const d = o.d, seen = t - d * YEAR, star = o.kind === 'star';
    h += `<p class="muted">${star && o.con ? `Sternbild ${esc(o.con)} · ` : ''}${fmtDist(d)} entfernt</p>`;
    if (o.hz) h += `<p>Um diesen Stern kreist ${o.hz.length > 1 ? `mehr als ein Planet` : 'ein Planet'} in der lebensfreundlichen Zone (${esc(o.hz.join(', '))})${o.pl > o.hz.length ? ` – insgesamt kennt man dort ${o.pl} Planeten` : ''}.</p>`;
    else if (o.pl) h += `<p>Um diesen Stern ${o.pl === 1 ? 'kreist ein bekannter Planet' : `kreisen ${o.pl} bekannte Planeten`}.</p>`;
    if (seen < S.birth) {
      h += `<p>Annas erstes Licht ist noch auf dem Weg hierher. Es kommt in <b>${dur(S.birth - seen)}</b> an – am ${fmtDate(S.birth + d * YEAR)}.</p>`;
    } else if (seen > S.death) {
      h += `<p>Annas Licht ist hier schon vorbeigezogen – ihr letztes Licht kam am ${fmtDate(S.death + d * YEAR)} an. Es reist weiter hinaus zu den Sternen.</p>`;
    } else {
      h += `<p>Von hier aus gesehen ist auf der Erde jetzt der <b>${fmtDate(seen)}</b>. ${age(seen)}</p>`;
      const spans = S.items.filter(i => i._e && i._t <= seen && seen <= i._e);
      for (const i of spans) h += `<p>Dort läuft gerade <b>${esc(i.title)}</b>: ${spanWhere(i, seen)}.</p>`;
      const soon = S.items.find(i => i._e && i._t > seen);
      if (soon) h += `<p>Demnächst beginnt dort <b>${esc(soon.title)}</b> – in ${dur(soon._t - seen)}.</p>`;
      const ev = S.items.filter(i => !i._e), prev = ev.filter(i => i._t <= seen).pop(), next = ev.find(i => i._t > seen);
      if (prev) h += `<p>Zuletzt hier angekommen: ${esc(prev.title)} – vor ${dur(seen - prev._t)}.</p>`;
      if (next) h += `<p>Als Nächstes zu sehen: <b>${esc(next.title)}</b> – in ${dur(next._t - seen)}.</p>`;
      if (star) h += `<p class="muted">Und das Licht, das heute Nacht von ${esc(o.n)} bei uns ankommt, ist an genau diesem Tag dort aufgebrochen.</p>`;
    }
    if (star && S.view === 'sky') {
      const [alt, az] = starAltAz(o, S.skyT ?? Date.now());
      h += alt > 2 ? `<p>Steht gerade ${Math.round(alt)}° hoch im ${['Norden', 'Nordosten', 'Osten', 'Südosten', 'Süden', 'Südwesten', 'Westen', 'Nordwesten'][Math.round(az / 45) % 8]}.</p>`
        : '<p class="muted">Steht zu dieser Uhrzeit unter dem Horizont.</p>';
    }
    if (S.view === 'space') h += '<p><button id="fly">Näher ansehen</button></p>';
    if (star) h += o.mag <= 6
      ? `<p><button id="toSky">${S.view === 'sky' ? 'Im Weltraum zeigen' : 'Am Nachthimmel zeigen'}</button> <span class="muted">mit bloßem Auge sichtbar</span></p>`
      : '<p class="muted">Zu lichtschwach für das bloße Auge.</p>';
    h += '<p><button id="share">Link teilen</button></p>';
  }
  el.innerHTML = h; hydrate(el);
  if ($('#toSky')) $('#toSky').onclick = () => { setView(S.view === 'sky' ? 'space' : 'sky'); renderDetail(); };
  if ($('#editSel')) $('#editSel').onclick = () => editItem(o);
  if ($('#editBase')) $('#editBase').onclick = () => { openPanel('login'); $('#person')?.scrollIntoView(); };
  if ($('#fly')) $('#fly').onclick = () => flyTo(o);
  if ($('#share')) $('#share').onclick = async e => { const done = await shareLink(o.n || o.name || o.title); if (done) e.target.textContent = done; };
}

// ---------- arrivals ----------
function arrivals() {
  const out = [];
  for (const i of S.items) for (const s of S.stars) out.push({ i, s, at: i._t + s.d * YEAR, text: `${i._e ? 'Beginn: ' : ''}${i.title} erreicht ${s.n}` });
  return out;
}
function renderSoon() {
  const t = S.t, all = arrivals(), el = $('#p-soon .body');
  const row = (a, w) => `<li data-star="${esc(a.s.n)}"><span class="swatch" style="background:${catColor(a.i.cat)}"></span><div><span class="when">${w} ${dur(a.at - t)}</span><br>${esc(a.text)}</div></li>`;
  const next = all.filter(a => a.at > t).sort((a, b) => a.at - b.at).slice(0, 8);
  const last = all.filter(a => a.at <= t).sort((a, b) => b.at - a.at).slice(0, 4);
  // tonight: the three highest naked-eye stars that are watching her right now
  const night = S.skyT ?? Date.now();
  const up = litStars().filter(s => s.mag <= 4.5).map(s => [starAltAz(s, night)[0], s]).filter(x => x[0] > 15).sort((a, b) => b[0] - a[0]).slice(0, 3);
  const tonight = up.map(([, s]) => `<li data-sky="${esc(s.n)}"><span class="dot lit"></span><div>${esc(s.n)}<small>sieht gerade den ${fmtDate(t - s.d * YEAR)} – ${age(t - s.d * YEAR).replace(/\.$/, '')}</small></div></li>`).join('');
  // anniversaries within the next 30 days
  const today = new Date(); today.setHours(12, 0, 0, 0);
  const days = S.items.filter(i => !i._e && i._t < today.getTime()).map(i => {
    const d = new Date(i._t), next = new Date(today.getFullYear(), d.getMonth(), d.getDate(), 12);
    if (next < today) next.setFullYear(next.getFullYear() + 1);
    return { i, inDays: Math.round((next - today) / 864e5), years: next.getFullYear() - d.getFullYear() };
  }).filter(a => a.inDays <= 30 && a.years >= 1).sort((a, b) => a.inDays - b.inDays);
  const annRow = a => `<li data-id="${a.i.id}"><span class="swatch" style="background:${catColor(a.i.cat)}"></span><div><span class="when">${a.inDays === 0 ? 'Heute' : a.inDays === 1 ? 'Morgen' : `In ${a.inDays} Tagen`}</span><br>
    ${a.i.id === 'birth' ? `Annas ${a.years}. Geburtstag` : `${esc(a.i.title)} – ${a.inDays === 0 ? 'heute' : 'dann'} vor ${a.years} ${a.years === 1 ? 'Jahr' : 'Jahren'}`}</div></li>`;
  $('#dock [data-panel=soon]').classList.toggle('dot', days.some(a => a.inDays === 0) || next.some(a => a.at - t < 864e5));
  el.innerHTML = `${tonight ? `<h3 style="margin-top:0">Heute Nacht am Himmel</h3><ul class="list">${tonight}</ul>` : ''}
    ${days.length ? `<h3>Jahrestage</h3><ul class="list">${days.map(annRow).join('')}</ul>` : ''}
    <h3>Wo ihr Licht demnächst ankommt</h3><ul class="list">${next.map(a => row(a, 'in')).join('')}</ul>
    <h3>Gerade angekommen</h3><ul class="list">${last.map(a => row(a, 'vor')).join('') || '<li class="muted">Noch nichts.</li>'}</ul>
    <p><button id="ics">Als Kalender speichern</button></p>
    <p class="fine">Lädt die Ankünfte der nächsten zwei Jahre als Kalender-Datei herunter – zum Öffnen im Handy- oder Computer-Kalender.</p>`;
  $$('li[data-star]', el).forEach(li => li.onclick = () => select(S.stars.find(s => s.n === li.dataset.star)));
  $$('li[data-sky]', el).forEach(li => li.onclick = () => { setView('sky'); select(S.stars.find(s => s.n === li.dataset.sky)); });
  $$('li[data-id]', el).forEach(li => li.onclick = () => select(S.items.find(i => i.id === li.dataset.id)));
  $('#ics').onclick = () => {
    const now = Date.now(), z = n => String(n).padStart(2, '0'), day = d => `${d.getFullYear()}${z(d.getMonth() + 1)}${z(d.getDate())}`;
    const ev = arrivals().filter(a => a.at > now && a.at < now + 2 * YEAR).sort((a, b) => a.at - b.at).map(a => {
      const d = new Date(a.at), e = new Date(a.at + 864e5);
      return `BEGIN:VEVENT\r\nUID:${a.i.id}-${a.s.n.replace(/\W/g, '')}@annas-licht\r\nDTSTAMP:${new Date().toISOString().replace(/[-:]|\.\d+/g, '')}\r\nDTSTART;VALUE=DATE:${day(d)}\r\nDTEND;VALUE=DATE:${day(e)}\r\nSUMMARY:Annas Licht: ${a.text.replace(/[,;]/g, ' ')}\r\nEND:VEVENT\r\n`;
    });
    const blob = new Blob([`BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Annas Licht//DE\r\n${ev.join('')}END:VCALENDAR\r\n`], { type: 'text/calendar' });
    Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'annas-licht.ics' }).click();
  };
}

// ---------- moments: list + form ----------
let momentsTab = 'list', momentsFind = '';
function renderMoments() {
  const el = $('#p-moments .body'), can = store.canWrite();
  const withPhotos = S.items.filter(i => i.photos?.length), find = momentsFind.trim().toLowerCase();
  const shown = S.items.filter(i => !find || (i.title + ' ' + (i.text || '') + ' ' + i.date.slice(0, 4)).toLowerCase().includes(find));
  const tools = `${withPhotos.length ? `<div class="tabs"><button data-tab="list" class="${momentsTab === 'list' ? 'on' : ''}">Alle Momente</button><button data-tab="wall" class="${momentsTab === 'wall' ? 'on' : ''}">Fotos (${withPhotos.reduce((n, i) => n + i.photos.length, 0)})</button></div>` : ''}
    ${S.items.length > 6 && momentsTab === 'list' ? `<input type="text" id="find" placeholder="Suchen – z. B. Hochzeit oder 1998" value="${esc(momentsFind)}" style="margin-bottom:8px">` : ''}`;
  if (momentsTab === 'wall' && withPhotos.length) {
    el.innerHTML = tools + `<div class="photos wall">${withPhotos.flatMap(i => i.photos.map(p => `<figure data-id="${i.id}"><img data-photo="${esc(p)}" alt="" loading="lazy"><figcaption>${i.date.slice(0, 4)} · ${esc(i.title)}</figcaption></figure>`)).join('')}</div>`;
    hydrate(el);
    $$('figure[data-id]', el).forEach(f => { $('img', f).onclick = () => select(S.items.find(i => i.id === f.dataset.id)); });
    $$('[data-tab]', el).forEach(b => b.onclick = () => { momentsTab = b.dataset.tab; renderMoments(); });
    return;
  }
  momentsTab = 'list';
  el.innerHTML = (can ? '<p><button class="primary" id="add">+ Einen Moment hinzufügen</button></p>'
    : '<p class="muted">Wer Anna kannte, kann hier eigene Erinnerungen hinzufügen – dafür bitte unten auf „Anmelden“ tippen.</p>')
    + tools + `<ul class="list">${shown.map(i => `<li data-id="${i.id}"><span class="swatch ${i._e ? 'span' : ''}" style="background:${catColor(i.cat)}"></span>
      <div style="flex:1">${esc(i.title)} ${lock(i)}<small>${range(i)}${i.photos?.length ? ` · ${i.photos.length} Foto${i.photos.length > 1 ? 's' : ''}` : ''}</small></div>
      ${store.canEdit(i) ? `<button data-edit="${i.id}" style="padding:4px 10px;font-size:13px">Bearbeiten</button>` : ''}</li>`).join('')}</ul>`;
  $$('li[data-id]', el).forEach(li => li.onclick = () => select(S.items.find(i => i.id === li.dataset.id)));
  $$('[data-tab]', el).forEach(b => b.onclick = () => { momentsTab = b.dataset.tab; renderMoments(); });
  $$('[data-edit]', el).forEach(b => b.onclick = e => { e.stopPropagation(); editItem(S.items.find(i => i.id === b.dataset.edit)); });
  if ($('#find')) $('#find').oninput = e => { momentsFind = e.target.value; renderMoments(); const f = $('#find'); f.focus(); f.setSelectionRange(f.value.length, f.value.length); };
  if (can) $('#add').onclick = () => editItem(null);
}

async function prepPhoto(file) {
  const bmp = await createImageBitmap(file), k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const c = Object.assign(document.createElement('canvas'), { width: Math.round(bmp.width * k), height: Math.round(bmp.height * k) });
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.85));
  return new Uint8Array(await blob.arrayBuffer());
}

function editItem(item) {
  openPanel('moments');
  const el = $('#p-moments .body'), i = item || { vis: 'private', cat: 'freude', photos: [] };
  let keep = [...(i.photos || [])];
  const removed = [];
  const [d0, t0] = (i.date || '').split('T'), [d1, t1] = (i.end || '').split('T');
  el.innerHTML = `<form>
    <label>Was ist passiert?<input type="text" name="title" required maxlength="80" value="${esc(i.title)}" placeholder="z. B. Unsere Hochzeit"></label>
    <div class="choice">
      <label><input type="radio" name="period" value="" ${i.period ? '' : 'checked'}><span>Ein Moment<small>ein bestimmter Tag</small></span></label>
      <label><input type="radio" name="period" value="1" ${i.period ? 'checked' : ''}><span>Ein Zeitraum<small>z. B. Schulzeit, ein Beruf, eine Reise</small></span></label>
    </div>
    <div class="two"><label><span data-l="from">Wann?</span>${dateInput('date', d0, true)}</label>
      <label>Uhrzeit (wenn bekannt)${timeInput('time', t0)}</label></div>
    <div class="two" data-end><label>Bis wann?${dateInput('end', d1)}</label>
      <label>Uhrzeit (wenn bekannt)${timeInput('endtime', t1)}</label></div>
    <p class="muted" data-end style="margin:-6px 0 0">„Bis wann“ leer lassen, wenn der Zeitraum bis zuletzt andauerte.</p>
    <label>Thema<select name="cat">${Object.entries(CATS).map(([k, [n]]) => `<option value="${k}" ${k === i.cat ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
    <label>Ein paar Worte dazu<textarea name="text" maxlength="4000" placeholder="Was möchtest du erzählen?">${esc(i.text)}</textarea></label>
    <label>Fotos<input type="file" name="photos" accept="image/*" multiple></label>
    <div class="photos" id="thumbs"></div>
    <div class="choice">
      <label><input type="radio" name="vis" value="private" ${i.vis !== 'public' ? 'checked' : ''}><span>Nur für Familie &amp; Freunde<small>verschlüsselt, nur mit Anmeldung sichtbar</small></span></label>
      <label><input type="radio" name="vis" value="public" ${i.vis === 'public' ? 'checked' : ''}><span>Für alle Besucher<small>öffentlich im Internet sichtbar</small></span></label>
    </div>
    <p class="status"></p>
    <div class="row"><button class="primary">Speichern</button><button type="button" id="cancel">Abbrechen</button>
      ${item ? '<button type="button" class="danger" id="del">Löschen</button>' : ''}</div>
  </form>`;
  const form = $('form', el), status = $('.status', el);
  const thumbs = () => {
    $('#thumbs').innerHTML = keep.map(p => `<figure><img data-photo="${esc(p)}" alt=""><button type="button" data-rm="${esc(p)}" aria-label="Foto entfernen">×</button></figure>`).join('');
    hydrate($('#thumbs'));
    $$('[data-rm]', el).forEach(b => b.onclick = () => { removed.push(b.dataset.rm); keep = keep.filter(p => p !== b.dataset.rm); thumbs(); });
  };
  const toggle = () => $$('[data-end]', el).forEach(n => { n.hidden = !form.period.value; $('[data-l=from]', el).textContent = form.period.value ? 'Von wann?' : 'Wann?'; });
  $$('[name=period]', el).forEach(r => r.onchange = toggle);
  thumbs(); toggle();
  const busy = on => $$('button', form).forEach(b => { b.disabled = on; });
  const fail = e => { busy(false); status.className = 'status err'; status.textContent = 'Das hat leider nicht geklappt: ' + (e.message || e.name || 'unbekannter Fehler'); console.error(e); };
  $('#cancel').onclick = renderMoments;
  if (item) $('#del').onclick = async () => {
    if (!confirm(`„${item.title}“ wirklich löschen?`)) return;
    busy(true); status.textContent = 'Wird gelöscht …';
    try { await store.deleteItem(item); S.sel = null; rebuild(); } catch (e) { fail(e); }
  };
  form.onsubmit = async e => {
    e.preventDefault();
    const f = form, withTime = (d, t) => (d && t ? `${d}T${t}` : d), bad = m => { status.className = 'status err'; status.textContent = m; };
    const date = readDate(f.date.value), time = readTime(f.time.value);
    const end = f.period.value ? readDate(f.end.value) : '', endtime = f.period.value ? readTime(f.endtime.value) : '';
    if (!date || end === null) return bad('Bitte das Datum als Tag.Monat.Jahr eingeben, zum Beispiel 23.05.1998.');
    if (time === null || endtime === null) return bad('Bitte die Uhrzeit mit 24 Stunden eingeben, zum Beispiel 14:30.');
    if (end && end < date) return bad('Das Ende liegt vor dem Anfang.');
    busy(true); status.className = 'status'; status.textContent = 'Wird gespeichert … das dauert einen Augenblick.';
    try {
      const photos = [];
      for (const file of f.photos.files) photos.push(await prepPhoto(file));
      const { _t, _e, ...base } = i;
      const saved = await store.saveItem({
        ...base, title: f.title.value.trim(), date: withTime(date, time), period: !!f.period.value,
        end: withTime(end, endtime), cat: f.cat.value, text: f.text.value.trim(), vis: f.vis.value, photos: keep,
      }, photos, removed);
      rebuild(); select(S.items.find(x => x.id === saved.id));
    } catch (err) { fail(err); }
  };
}

// ---------- accounts ----------
const ROLES = { admin: 'Verwaltung', editor: 'Mitgestalten', viewer: 'Nur ansehen' };
function renderLogin() {
  const el = $('#p-login .body'), s = store.state.session, st = store.state;
  $('#loginBtn').textContent = s ? s.name : 'Anmelden';
  const act = async (statusEl, text, fn) => {
    statusEl.className = 'status'; statusEl.textContent = text;
    $$('button', el).forEach(b => { b.disabled = true; });
    try { await fn(); rebuild(); } catch (e) { $$('button', el).forEach(b => { b.disabled = false; }); statusEl.className = 'status err'; statusEl.textContent = e.message || e.name || 'Das hat leider nicht geklappt.'; console.error(e); }
  };
  if (!s && !st.users.users.length) {
    el.innerHTML = `<p>Diese Seite ist noch nicht eingerichtet. Mit dem ersten Zugang wird der Schlüssel erzeugt, der alle privaten Erinnerungen schützt.</p>
      <form><label>Dein Name<input type="text" name="name" required autocomplete="username"></label>
      <label>Passwort (am besten ein ganzer Satz)<input type="password" name="pass" required minlength="10" autocomplete="new-password"></label>
      <label>GitHub-Zugriffstoken (nur „Contents: Read and write“ für dieses Repository)<input type="password" name="token" required autocomplete="off"></label>
      <p class="status"></p><button class="primary">Einrichten</button></form>`;
    $('form', el).onsubmit = e => { e.preventDefault(); const f = e.target; act($('.status', el), 'Wird eingerichtet …', () => store.setup(f.name.value, f.pass.value, f.token.value, true)); };
    return;
  }
  if (!s) {
    el.innerHTML = `<p>Mit einem Zugang siehst du alle Erinnerungen und Fotos und kannst eigene hinzufügen.</p>
      <form><label>Name<input type="text" name="name" required autocomplete="username"></label>
      <label>Passwort<input type="password" name="pass" required autocomplete="current-password"></label>
      <label class="row" style="display:flex;color:var(--text)"><input type="checkbox" name="keep" checked> Auf diesem Gerät angemeldet bleiben</label>
      <p class="status"></p><button class="primary">Anmelden</button></form>
      <p class="fine">Du hast keinen Zugang? Wende dich bitte an die Familie.</p>`;
    $('form', el).onsubmit = e => { e.preventDefault(); const f = e.target; act($('.status', el), 'Einen Moment …', () => store.login(f.name.value, f.pass.value, f.keep.checked)); };
    return;
  }
  let h = `<p>Angemeldet als <b>${esc(s.name)}</b> <span class="tag">${ROLES[s.role]}</span></p><p><button id="out">Abmelden</button></p>`;
  if (s.role === 'admin') {
    const p = st.person, [bd, bt] = p.birth.split('T'), [dd, dt] = p.death.split('T');
    h += `<h3>Zugänge</h3><ul class="list">${st.accounts.map(a => `<li style="cursor:default"><div style="flex:1">${esc(a.name)}<small>${ROLES[a.role]}</small></div>
        ${a.id === s.id ? '' : `<button class="danger" data-rm="${a.id}">Entfernen</button>`}</li>`).join('')}</ul>
      <form id="newUser"><h3>Neuen Zugang anlegen</h3>
        <label>Name<input type="text" name="name" required autocomplete="off"></label>
        <label>Passwort<input type="text" name="pass" required minlength="8" autocomplete="off"></label>
        <label>Darf …<select name="role"><option value="editor">Erinnerungen ansehen und hinzufügen</option><option value="viewer">Erinnerungen nur ansehen</option><option value="admin">alles verwalten</option></select></label>
        <p class="status"></p><button class="primary">Zugang anlegen</button></form>
      <form id="person"><h3>Grunddaten</h3>
        ${p.placeholder ? '<p class="status err">Hier stehen noch Platzhalter – bitte die echten Daten eintragen.</p>' : ''}
        <div class="two"><label>Geboren am${dateInput('bd', bd, true)}</label><label>Uhrzeit${timeInput('bt', bt)}</label></div>
        <div class="two"><label>Letztes Licht am${dateInput('dd', dd, true)}</label><label>Uhrzeit${timeInput('dt', dt)}</label></div>
        <p class="status"></p><button class="primary">Grunddaten speichern</button></form>
      <p class="fine">Ein entfernter Zugang kann sich nicht mehr anmelden. Wer ganz sicher ausgesperrt werden soll, braucht zusätzlich einen neuen GitHub-Token.</p>`;
  }
  el.innerHTML = h;
  $('#out').onclick = async () => { await store.logout(); urls.clear(); rebuild(); };
  if (s.role !== 'admin') return;
  $$('[data-rm]', el).forEach(b => b.onclick = () => confirm('Diesen Zugang wirklich entfernen?') && act($('#newUser .status'), 'Wird entfernt …', () => store.removeUser(b.dataset.rm)));
  $('#newUser').onsubmit = e => { e.preventDefault(); const f = e.target; act($('.status', f), 'Wird angelegt …', () => store.addUser(f.name.value, f.pass.value, f.role.value)); };
  $('#person').onsubmit = e => {
    e.preventDefault(); const f = e.target, j = (d, t) => (t ? `${d}T${t}` : d), st2 = $('.status', f);
    const b = readDate(f.bd.value), d = readDate(f.dd.value), bt2 = readTime(f.bt.value), dt2 = readTime(f.dt.value);
    if (!b || !d || bt2 === null || dt2 === null || d < b) { st2.className = 'status err'; st2.textContent = 'Bitte Datum als 23.05.1998 und Uhrzeit als 14:30 eingeben.'; return; }
    act(st2, 'Wird gespeichert …', () => store.setPerson({ name: 'Anna', birth: j(b, bt2), death: j(d, dt2) }));
  };
}

// ---------- time travel + live numbers ----------
$('#offset').oninput = e => { S.offset = +e.target.value; S.t = Date.now() + S.offset * YEAR; $('#when').textContent = S.offset ? fmtDate(S.t) : 'Jetzt'; renderDetail(); renderSoon(); };
$('#resetTime').onclick = () => { $('#offset').value = 0; $('#offset').oninput({ target: { value: 0 } }); };
function renderLead() {
  const dOut = (S.t - S.birth) / YEAR, lit = litStars().length;
  if (dOut <= 0) { $('#lead').textContent = 'Annas Licht hat seine Reise noch nicht begonnen.'; return; }
  const all = Math.round(0.00288 * 4 / 3 * Math.PI * (dOut ** 3 - Math.max(0, (S.t - S.death) / YEAR) ** 3) / 100) * 100;
  $('#lead').innerHTML = `Das Licht ihres Lebens erfüllt in diesem Augenblick eine Kugel mit einem Radius von <b>${num(dOut, 7)}</b> Lichtjahren.`
    + (all >= 100 ? `<span class="more"> Rund <b>${all.toLocaleString('de-DE')}</b> Sterne sehen sie gerade – ${lit} davon zeigt diese Karte, jeden an einem anderen Tag ihres Lebens.</span>` : '');
}
function renderAll() { life.draw(); renderDetail(); renderSoon(); renderMoments(); renderLogin(); renderLead(); }

const DEMO = [['Einschulung', '1976-08-30', '', 'kindheit'], ['Schulzeit', '1976-08-30', '1989-06-16', 'kindheit'], ['Konfirmation', '1984-04-15', '', 'kindheit'],
  ['Tanzkurs', '1986-10-03', '', 'freude'], ['Abitur', '1989-06-16', '', 'kindheit'], ['Ausbildung', '1989-09-01', '1992-07-31', 'beruf'], ['Erste Begegnung', '1994-07-09', '', 'liebe'],
  ['Hochzeit', '1998-05-23T14:30', '', 'liebe'], ['Ehe', '1998-05-23', null, 'liebe'], ['Einzug ins Haus', '2004-10-01', '', 'liebe'], ['Reise ans Meer', '2015-08-12', '', 'freude'],
  ['Krankheit', '2023-03-01', null, 'krankheit']].map(([title, date, end, cat], n) => ({ id: 'demo' + n, title, date, end: end || '', period: end !== '', cat, vis: 'public', photos: [],
  text: 'Ein Beispieltext, der nur beim Testen auf dem eigenen Rechner erscheint.' }));

// ---------- start ----------
async function init() {
  setView(location.hash.includes('himmel') ? 'sky' : 'space');
  setSkyTime(sunAltitude(Date.now()) < -6 ? null : 600);
  weather.on = true;                                   // clouds show unless someone switched them off
  try { weather.on = localStorage.getItem('annas-licht-clouds') !== 'aus'; } catch { /* ignore */ }
  const wx = () => loadWeather().then(cloudInfo);
  wx(); setInterval(wx, 30 * 6e4);
  requestAnimationFrame(frame);
  const [stars, sky] = await Promise.all([fetch('data/stars.json').then(r => r.json()), fetch('data/sky.json').then(r => r.json())]);
  S.stars = stars.map(s => ({ ...s, kind: 'star', v: vec(s.ra, s.dec, s.d) }));
  for (const s of sky.stars) s.dir = vec(s[0], s[1]);
  S.sky = sky;
  await store.load();
  await store.restore().then(() => store.state.session && store.load(true)).catch(e => console.error(e));
  if (/^(localhost|127\.)/.test(location.hostname) && location.hash.includes('demo')) store.state.items = DEMO;   // made-up moments for testing on the own computer
  rebuild();
  setInterval(renderLead, 200);
  setInterval(() => { if (!$('#p-soon').hidden) renderSoon(); }, 60000);
  let seen = true;
  try { seen = localStorage.getItem('annas-licht-seen'); localStorage.setItem('annas-licht-seen', '1'); } catch { /* private mode */ }
  const want = /p=(\w+)/.exec(location.hash)?.[1], pickName = /sel=([^&]+)/.exec(location.hash)?.[1];
  const z = /z=(\w+)/.exec(location.hash)?.[1];
  if (z) { $(`#zoom [data-zoom=${z}]`)?.click(); cam.scale = cam.target; }
  const rs = /reise=?(\d*)/.exec(location.hash);
  if (rs) { startJourney(+rs[1] || 0); J.paused = true; showStation(); cam.scale = cam.target; cam.c = [0, 0, (S.t - (S.sel?._t || S.t)) / YEAR]; }
  const yr = /jahr=(\d+)/.exec(location.hash)?.[1];
  if (yr) selectYear(new Date(+yr, 6, 1).getTime());
  const go = /go=([^&]+)/.exec(location.hash)?.[1];
  if (go) { const n = decodeURIComponent(go); flyTo(S.stars.find(s => s.n === n) || bodies.find(b => b.name === n) || S.items.find(i => i.title === n)); cam.scale = cam.target; cam.c = [...(cam.focus?.v || [0, 0, (S.t - (cam.focus?._t || S.t)) / YEAR])]; }
  // first visit: explain the page once the opening glide is over
  if (want) { if (panel(want)) openPanel(want); } else if (!seen) setTimeout(() => { if (!J.on && $$('.panel').every(p => p.hidden)) openPanel('about'); }, 6500);
  const mid = /\bm=(\w+)/.exec(location.hash)?.[1];
  if (mid && S.items.find(i => i.id === mid)) select(S.items.find(i => i.id === mid));
  if (!location.hash && S.view === 'space' && W && !S.calm) {       // opening: start close to the Earth and glide out until her whole light is in view
    cam.target = clampScale(fit(Math.max((S.t - S.birth) / YEAR, 20) * 1.08, W, H)); cam.scale = cam.target * 28; cam.ease = 0.022;
  }
  if (pickName) select(S.stars.find(s => s.n === decodeURIComponent(pickName)) || bodies.find(b => b.name === decodeURIComponent(pickName)) || S.items.find(i => i.title === decodeURIComponent(pickName)));
}
init();
