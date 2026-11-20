// Shared helpers: time, formatting, categories.
export const YEAR = 365.25 * 864e5;          // ms in a Julian year = the time light needs for one light-year
export const LS = 1 / 31557600;              // one light-second, in light-years
export const AU = 499.004784 * LS;           // one astronomical unit, in light-years

export const CATS = {
  kindheit: ['Kindheit & Schule', '#8fb8e8'],
  beruf: ['Ausbildung & Beruf', '#9fd4c0'],
  liebe: ['Liebe & Familie', '#e9a5ad'],
  freude: ['Reisen & Freude', '#f3c98b'],
  krankheit: ['Krankheit', '#9a93b5'],
  sonst: ['Sonstiges', '#d8d2c4'],
};
export const catColor = c => (CATS[c] || CATS.sonst)[1];

// '1998-05-23' or '1998-05-23T14:30' -> ms (local time; a date without time counts as noon)
export const parseWhen = s => new Date(s.length <= 10 ? s + 'T12:00' : s).getTime();

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
export function placeLabels(ctx, list) {
  const done = [];
  list.sort((a, b) => b.prio - a.prio);
  for (const l of list) {
    ctx.font = l.font || '12px system-ui, sans-serif';
    const w = ctx.measureText(l.text).width + 8, h = 15;
    const x = l.align === 'right' ? l.x - w : l.align === 'left' ? l.x : l.x - w / 2, y = l.y - h + 3;
    if (!l.force && done.some(r => x < r[0] + r[2] && x + w > r[0] && y < r[1] + r[3] && y + h > r[1])) continue;
    done.push([x, y, w, h]);
    ctx.globalAlpha = l.alpha ?? 1;
    ctx.textAlign = 'left';
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(8,10,28,.75)'; ctx.strokeText(l.text, x + 4, l.y);
    ctx.fillStyle = l.color || 'rgba(236,230,218,.9)'; ctx.fillText(l.text, x + 4, l.y);
  }
  ctx.globalAlpha = 1;
}
