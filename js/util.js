// Shared helpers: time, formatting, categories.
export const YEAR = 365.25 * 864e5;          // ms in a Julian year = the time light needs for one light-year
export const LS = 1 / 31557600;              // one light-second, in light-years
export const AU = 499.004784 * LS;           // one astronomical unit, in light-years

// The themes a moment can belong to: id -> [name, colour]. These are the ones the page starts with;
// the family can rename, recolour, add and remove them (stored with the public data, see applyCats).
const START_CATS = {
  kindheit: ['Kindheit & Schule', '#8fb8e8'],
  beruf: ['Ausbildung & Beruf', '#9fd4c0'],
  liebe: ['Liebe & Familie', '#e9a5ad'],
  freude: ['Reisen & Freude', '#f3c98b'],
  krankheit: ['Krankheit', '#9a93b5'],
  sonst: ['Sonstiges', '#d8d2c4'],
};
export const CATS = {};
// list = [{ id, name, color }] as saved, or nothing for the starting set; "sonst" always exists as the fallback
export function applyCats(list) {
  for (const k of Object.keys(CATS)) delete CATS[k];
  if (list?.length) for (const c of list) CATS[c.id] = [c.name, c.color];
  else for (const [k, v] of Object.entries(START_CATS)) CATS[k] = [...v];
  if (!CATS.sonst) CATS.sonst = [...START_CATS.sonst];
}
applyCats();
// how much a moment matters, 1 (a small thing) … 5 (a life event); birth and last light always count fully
export const weight = i => (i.fixed ? 5 : Math.min(5, Math.max(1, i.imp || 1)));
export const WEIGHTS = ['eine Kleinigkeit', 'ein schöner Moment', 'wichtig', 'sehr wichtig', 'ein Lebensereignis'];
// Which photo should the picture frame show next? By chance, but photos of important moments come up more often.
// A moment with very many photos does not crowd out the others, and the last few photos shown are left out,
// so that nothing repeats too soon. Whatever happened after her last light (the funeral, for one) counts as a small moment here,
// however important it is marked.  state = { pool: [{ path, item }], recent: [], death: ms }
export function pickPicture(state) {
  const recent = state.recent || (state.recent = []), open = state.pool.filter(p => !recent.includes(p.path));
  const from = open.length ? open : state.pool;
  const chance = p => (state.death && p.item._t > state.death ? 1 : weight(p.item)) / Math.sqrt(p.item.photos?.length || 1);
  let r = Math.random() * from.reduce((sum, p) => sum + chance(p), 0), pic = from[from.length - 1];
  for (const p of from) { r -= chance(p); if (r <= 0) { pic = p; break; } }
  recent.push(pic.path);
  while (recent.length > Math.min(5, Math.floor(state.pool.length / 2))) recent.shift();
  return pic;
}
export const catColor = c => (CATS[c] || CATS.sonst)[1];

// '1998-05-23' or '1998-05-23T14:30' -> ms (local time; a date without time counts as noon)
export const parseWhen = s => new Date(s.length <= 10 ? s + 'T12:00' : s).getTime();

// German date and time entry: "23.05.1998" <-> "1998-05-23", "14:30" (24 hours)
export const showDate = iso => (iso ? iso.slice(0, 10).split('-').reverse().join('.') : '');
// -> ISO date, '' if empty, null if not a real date
export function readDate(text) {
  const s = text.trim();
  if (!s) return '';
  const m = /^(\d{1,2})[.\/\- ](\d{1,2})[.\/\- ](\d{4})$/.exec(s);
  if (!m) return null;
  const [d, mo, y] = [+m[1], +m[2], +m[3]], dt = new Date(y, mo - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  return `${m[3]}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
// -> 'HH:MM', '' if empty, null if not a time
export function readTime(text) {
  const s = text.trim().replace(/\s*uhr$/i, '');
  if (!s) return '';
  const m = /^(\d{1,2})(?:[:.](\d{2}))?$/.exec(s) || /^(\d{2})(\d{2})$/.exec(s);
  if (!m || +m[1] > 23 || +(m[2] || 0) > 59) return null;
  return `${m[1].padStart(2, '0')}:${m[2] || '00'}`;
}
const DATE_IN = 'type="text" inputmode="numeric" placeholder="TT.MM.JJJJ" autocomplete="off"';
const TIME_IN = 'type="text" inputmode="numeric" placeholder="HH:MM" autocomplete="off"';
export const dateInput = (name, iso, required = false) => `<input ${DATE_IN} name="${name}" value="${showDate(iso)}" ${required ? 'required' : ''}>`;
export const timeInput = (name, hhmm) => `<input ${TIME_IN} name="${name}" value="${hhmm || ''}">`;

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const num = (x, n = 1) => x.toLocaleString('de-DE', { minimumFractionDigits: n, maximumFractionDigits: n });
export const fmtDate = ms => new Date(ms).toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' });
export function fmtWhen(s) {
  const d = new Date(parseWhen(s));
  return fmtDate(d) + (s.length > 10 ? `, ${d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr` : '');
}

// "in 14 Tagen" / "vor 3 Monaten" – returns the part after in/vor (dative)
export function dur(ms) {
  const d = Math.abs(ms) / 864e5, one = (n, s, p) => (n === 1 ? s : n + ' ' + p);
  if (d < 1 / 24) return one(Math.max(1, Math.round(d * 1440)), 'einer Minute', 'Minuten');
  if (d < 2) return one(Math.max(1, Math.round(d * 24)), 'einer Stunde', 'Stunden');
  if (d < 90) return Math.round(d) + ' Tagen';
  if (d < 730) return Math.round(d / 30.44) + ' Monaten';
  return num(d / 365.25) + ' Jahren';
}

// a distance in light-years as a readable light-time
export function fmtDist(ly) {
  const s = ly / LS;
  if (s < 90) return num(s, 1) + ' Lichtsekunden';
  if (s < 5400) return num(s / 60, 1) + ' Lichtminuten';
  if (s < 86400 * 2) return num(s / 3600, 1) + ' Lichtstunden';
  if (ly < 0.12) return num(s / 86400, 1) + ' Lichttage';
  if (ly < 1) return num(ly * 12, 1) + ' Lichtmonate';
  return num(ly, 2) + ' Lichtjahre';
}

export function starColor(ci) {
  return ci < 0.2 ? '#cfe0ff' : ci < 0.6 ? '#fff6e6' : ci < 1.0 ? '#ffe6b8' : ci < 1.4 ? '#ffcf9a' : '#ffb486';
}

// greedy label placement: important labels first, later ones are dropped if they would overlap
// soft labels (star names) are limited to `maxSoft`, so small screens are not buried in text
export function placeLabels(ctx, list, maxSoft = 1e9) {
  const done = [];
  let soft = 0;
  list.sort((a, b) => b.prio - a.prio);
  for (const l of list) {
    ctx.font = l.font || '12px "Source Sans 3", system-ui, sans-serif';
    const pad = l.box ? 9 : 4, w = ctx.measureText(l.text).width + 2 * pad, h = l.box ? 22 : 15;
    const x = l.align === 'right' ? l.x - w : l.align === 'left' ? l.x : l.x - w / 2, y = l.y - h + (l.box ? 7 : 3);
    if (!l.force && ((l.soft && soft >= maxSoft) || done.some(r => x < r[0] + r[2] && x + w > r[0] && y < r[1] + r[3] && y + h > r[1]))) continue;
    if (l.soft) soft++;
    done.push([x, y, w, h]);
    ctx.globalAlpha = l.alpha ?? 1;
    ctx.textAlign = 'left';
    if (l.box) {                                         // a name plate: used for the moments of her life
      ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, 2) : ctx.rect(x, y, w, h);
      ctx.fillStyle = 'rgba(12,13,24,.94)'; ctx.fill();
      ctx.lineWidth = 1.2; ctx.strokeStyle = l.box; ctx.stroke();
    } else { ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(8,10,28,.75)'; ctx.strokeText(l.text, x + pad, l.y); }
    ctx.fillStyle = l.color || 'rgba(236,230,218,.9)'; ctx.fillText(l.text, x + pad, l.y);
  }
  ctx.globalAlpha = 1;
}
