// The night sky above Neumünster: which of the stars you can see tonight are watching Anna right now?
import { YEAR, starColor, placeLabels } from './util.js';
import { NMS, lstDeg, altaz, sunAltitude } from './astro.js';

const RAD = Math.PI / 180;

export function drawSky(ctx, W, H, S) {
  const t = S.t, when = S.skyT ?? Date.now(), hits = [], labels = [];
  const dOut = (t - S.birth) / YEAR, dIn = Math.max(0, (t - S.death) / YEAR);
  const top = W < 700 ? 150 : 110, bottom = 130;
  const R = Math.max(120, Math.min(W - 24, H - top - bottom) / 2), cx = W / 2, cy = top + R;
  const lst = lstDeg(when, NMS.lon);
  // zenith in the centre, north up, east to the left – the way you see it lying on your back
  const P = (ra, dec) => {
    const [alt, az] = altaz(ra, dec, lst, NMS.lat), r = (90 - alt) / 90 * R;
    return [cx - r * Math.sin(az * RAD), cy - r * Math.cos(az * RAD), alt];
  };

  ctx.clearRect(0, 0, W, H);
  const day = sunAltitude(when) > -6;
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
  g.addColorStop(0, '#0b1030'); g.addColorStop(.8, '#121a40'); g.addColorStop(1, '#27264f');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.fill();
  ctx.strokeStyle = 'rgba(243,201,139,.45)'; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.font = '14px Georgia, serif'; ctx.fillStyle = 'rgba(243,201,139,.9)'; ctx.textAlign = 'center';
  for (const [text, az] of [['N', 0], ['O', 90], ['S', 180], ['W', 270]])
    ctx.fillText(text, cx - (R + 14) * Math.sin(az * RAD), cy - (R + 14) * Math.cos(az * RAD) + 5);

  ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.clip();
  if (S.sky) {
    ctx.strokeStyle = 'rgba(150,170,230,.28)'; ctx.lineWidth = 1;
    for (const line of S.sky.lines) {
      ctx.beginPath();
      let prev = null;
      for (const [ra, dec] of line) {
        const p = P(ra, dec);
        if (prev && (prev[2] > -3 || p[2] > -3)) { ctx.moveTo(prev[0], prev[1]); ctx.lineTo(p[0], p[1]); }
        prev = p;
      }
      ctx.stroke();
    }
    for (const [ra, dec, name] of S.sky.names) {
      const p = P(ra, dec);
      if (p[2] > 12) labels.push({ x: p[0], y: p[1], text: name.toUpperCase(), color: 'rgba(150,170,230,.5)', font: '10px system-ui, sans-serif', prio: 5 });
    }
    for (const s of S.sky.stars) {
      const p = P(s[0], s[1]);
      if (p[2] < 0) continue;
      ctx.globalAlpha = 0.85; ctx.fillStyle = starColor(s[3]);
      ctx.beginPath(); ctx.arc(p[0], p[1], Math.max(0.6, 2.9 - 0.5 * s[2]), 0, 7); ctx.fill();
      if (s[5] && s[2] < 1.6 && !(s[4] && s[4] <= dOut && s[4] >= dIn)) labels.push({ x: p[0], y: p[1] + 16, text: s[5], color: 'rgba(210,215,235,.6)', font: '11px system-ui, sans-serif', prio: 6 });
    }
    ctx.globalAlpha = 1;
  }
  // the stars that can see her – only those visible to the naked eye
  for (const s of S.stars) {
    if (s.mag > 6) continue;
    const p = P(s.ra, s.dec);
    if (p[2] < 0) continue;
    const lit = s.d <= dOut && s.d >= dIn, on = S.sel === s || S.hover === s, r = Math.max(1.6, 3.4 - 0.5 * s.mag);
    if (lit) {
      const glow = ctx.createRadialGradient(p[0], p[1], 0, p[0], p[1], r * 5);
      glow.addColorStop(0, 'rgba(255,215,150,.65)'); glow.addColorStop(1, 'rgba(255,215,150,0)');
      ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(p[0], p[1], r * 5, 0, 7); ctx.fill();
      ctx.fillStyle = '#ffe9c4'; ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, 7); ctx.fill();
      labels.push({ x: p[0], y: p[1] - r - 6, text: `${s.n} · ${new Date(t - s.d * YEAR).getFullYear()}`, color: '#ffe3b5',
        font: '12px Georgia, serif', prio: on ? 100 : 30 - s.mag, force: on });
    } else if (on) labels.push({ x: p[0], y: p[1] - r - 6, text: s.n, prio: 100, force: true });
    if (on) { ctx.strokeStyle = '#f3c98b'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(p[0], p[1], r + 8, 0, 7); ctx.stroke(); }
    hits.push({ x: p[0], y: p[1], o: s });
  }
  placeLabels(ctx, labels);
  ctx.restore();

  if (day) {
    ctx.font = '13px system-ui, sans-serif'; ctx.fillStyle = 'rgba(169,164,184,.9)'; ctx.textAlign = 'center';
    ctx.fillText('Zu dieser Zeit ist es noch hell – die Sterne stehen trotzdem genau dort.', cx, cy + R + 34);
  }
  return hits;
}
