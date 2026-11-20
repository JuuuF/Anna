// The 3D map: Earth in the centre, real star positions around it, and the light of a lifetime as a growing sphere.
import { YEAR, LS, AU, catColor, starColor, placeLabels } from './util.js';
import { bodies, orbits, sun, vec } from './astro.js';

export const cam = { yaw: 0.7, pitch: 0.42, scale: 0, target: 0, c: [0, 0, 0], touched: 0 };
export const fit = (ly, W, H) => Math.min(W, H) * 0.4 / ly;
export const clampScale = s => Math.min(4e9, Math.max(1.5, s));

// distance rings on the reference plane
const RINGS = [[LS, '1 Lichtsekunde'], [60 * LS, '1 Lichtminute'], [600 * LS, '10 Lichtminuten'], [3600 * LS, '1 Lichtstunde'],
  [36000 * LS, '10 Lichtstunden'], [86400 * LS, '1 Lichttag'], [7 * 86400 * LS, '1 Lichtwoche'], [1 / 12, '1 Lichtmonat'], [1, '1 Lichtjahr'], [5, '5 Lichtjahre']];
const dust = Array.from({ length: 2600 }, (_, i) => {
  const r = n => Math.abs((Math.sin(i * 127.1 + n * 311.7) * 43758.5453) % 1);
  return [vec(r(1) * 360, Math.asin(2 * r(2) - 1) * 180 / Math.PI), 0.1 + 0.3 * r(3)];
});

export function drawSpace(ctx, W, H, S) {
  const t = S.t, cx = W / 2, cy = H / 2, hits = [], labels = [];
  const dOut = (t - S.birth) / YEAR, dIn = Math.max(0, (t - S.death) / YEAR);
  if (!cam.scale) cam.scale = cam.target = fit(Math.max(dOut, 20) * 1.08, W, H);
  cam.scale = Math.exp(Math.log(cam.scale) + (Math.log(cam.target) - Math.log(cam.scale)) * 0.12);
  if (performance.now() - cam.touched > 5000 && !S.hover) cam.yaw += 0.0006;
  const sc = cam.scale, F = 1.6 * Math.max(W, H);
  const cyaw = Math.cos(cam.yaw), syaw = Math.sin(cam.yaw), cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
  const rot = v => {
    const x = v[0] * cyaw - v[1] * syaw, y = v[0] * syaw + v[1] * cyaw;
    return [x, v[2] * cp - y * sp, y * cp + v[2] * sp];            // right, up, depth
  };
  // -> [screen x, screen y, perspective factor] or null if behind the viewer
  const proj = v => {
    const [x, up, depth] = rot([v[0] - cam.c[0], v[1] - cam.c[1], v[2] - cam.c[2]]);
    const f = F / (F + depth * sc);
    return f > 0 && f < 6 ? [cx + x * sc * f, cy - up * sc * f, f] : null;
  };
  const onScreen = p => p && p[0] > -40 && p[0] < W + 40 && p[1] > -40 && p[1] < H + 40;
  const path = (pts, close) => {
    ctx.beginPath();
    let pen = false;
    for (const v of pts) {
      const p = proj(v);
      if (!p) { pen = false; continue; }
      pen ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]);
      pen = true;
    }
    if (close && pen) ctx.closePath();
  };
  const circle = (r, plane = 0, n = 120) => Array.from({ length: n + 1 }, (_, i) => {
    const a = i / n * 2 * Math.PI, c = r * Math.cos(a), s = r * Math.sin(a);
    return plane === 0 ? [c, s, 0] : plane === 1 ? [c, 0, s] : [0, c, s];
  });

  ctx.clearRect(0, 0, W, H);

  // the real sky far behind everything
  const FB = 0.8 * Math.max(W, H);
  const far = (dir, size, alpha, color) => {
    const [x, up, depth] = rot(dir);
    if (depth < 0.08) return;
    const px = cx + x / depth * FB, py = cy - up / depth * FB;
    if (px < 0 || px > W || py < 0 || py > H) return;
    ctx.globalAlpha = alpha; ctx.fillStyle = color;
    ctx.fillRect(px - size / 2, py - size / 2, size, size);
  };
  for (const [dir, a] of dust) far(dir, 1.1, a, '#fff');
  if (S.sky) for (const s of S.sky.stars) far(s.dir, Math.max(1, 2.8 - s[2] * 0.4), 0.5, starColor(s[3]));
  ctx.globalAlpha = 1;

  // ---- the light of her lifetime ----
  const o = proj([0, 0, 0]);
  const big = 6 * Math.max(W, H);
  if (o && dOut > 0) {
    const rOut = Math.min(dOut * sc * o[2], big), rIn = Math.min(dIn * sc * o[2], rOut);
    const g = ctx.createRadialGradient(o[0], o[1], rIn, o[0], o[1], Math.max(rOut, rIn + 1));
    g.addColorStop(0, 'rgba(243,201,139,.20)'); g.addColorStop(.55, 'rgba(240,185,150,.10)');
    g.addColorStop(.9, 'rgba(236,172,165,.17)'); g.addColorStop(1, 'rgba(233,165,173,.34)');
    ctx.fillStyle = g; ctx.beginPath();
    ctx.arc(o[0], o[1], rOut, 0, 2 * Math.PI); ctx.closePath();
    if (rIn > 0.5) { ctx.moveTo(o[0] + rIn, o[1]); ctx.arc(o[0], o[1], rIn, 0, 2 * Math.PI); ctx.closePath(); }
    ctx.fill('evenodd');
    ctx.lineWidth = 1.4; ctx.strokeStyle = 'rgba(243,201,139,.75)';
    if (rOut < big) { ctx.beginPath(); ctx.arc(o[0], o[1], rOut, 0, 2 * Math.PI); ctx.stroke(); }
    if (rIn > 2 && rIn < big) { ctx.strokeStyle = 'rgba(243,201,139,.5)'; ctx.beginPath(); ctx.arc(o[0], o[1], rIn, 0, 2 * Math.PI); ctx.stroke(); }
    // great circles make the sphere readable as a sphere
    ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(243,201,139,.16)';
    if (rOut < big) for (const plane of [0, 1, 2]) { path(circle(dOut, plane)); ctx.stroke(); }
    if (rIn > 30 && rIn < big) for (const plane of [0, 1, 2]) { path(circle(dIn, plane)); ctx.stroke(); }
  }

  // ---- rings on the reference plane: distance = years ago ----
  const ringList = [...RINGS];
  for (let k = 10; k <= 100; k += 10) ringList.push([k, `${k} Lichtjahre · ${new Date(t - k * YEAR).getFullYear()}`]);
  for (const [d, text] of ringList) {
    const px = d * sc;
    if (px < 26 || px > 2.5 * Math.max(W, H)) continue;
    ctx.strokeStyle = 'rgba(255,255,255,.09)'; ctx.lineWidth = 1;
    path(circle(d)); ctx.stroke();
    const a = -cam.yaw + Math.PI / 2 * 0.25, p = proj([d * Math.cos(a), d * Math.sin(a), 0]);       // label where the ring is closest to the viewer's right
    const q = proj([d * Math.cos(-cam.yaw - Math.PI / 2), d * Math.sin(-cam.yaw - Math.PI / 2), 0]);
    const at = onScreen(q) ? q : p;
    if (onScreen(at)) labels.push({ x: at[0], y: at[1] + 14, text, color: 'rgba(169,164,184,.85)', font: '11px system-ui, sans-serif', prio: 1 });
  }
  const oort = 0.8 * sc;
  if (o && oort > 60 && oort < 3 * Math.max(W, H)) {
    ctx.setLineDash([3, 6]); ctx.strokeStyle = 'rgba(160,190,230,.25)';
    ctx.beginPath(); ctx.arc(o[0], o[1], oort * o[2], 0, 2 * Math.PI); ctx.stroke(); ctx.setLineDash([]);
    labels.push({ x: o[0], y: o[1] - oort * o[2] - 6, text: 'Oortsche Wolke', color: 'rgba(160,190,230,.7)', font: '11px system-ui, sans-serif', prio: 2 });
  }

  // ---- solar system ----
  for (const orb of orbits) {
    const px = orb.a * sc;
    if (px < 10 || px > 30 * Math.max(W, H)) continue;
    ctx.strokeStyle = orb.name === 'Erde' ? 'rgba(140,180,255,.3)' : 'rgba(255,255,255,.13)'; ctx.lineWidth = 1;
    path(orb.pts.map(p => [p[0] + sun[0], p[1] + sun[1], p[2] + sun[2]])); ctx.stroke();
  }
  for (const b of bodies) {
    const p = proj(b.v);
    if (!onScreen(p) || b.d * sc < 5) continue;
    const on = S.sel === b || S.hover === b, isSun = b.name === 'Sonne';
    if (isSun) {
      const g = ctx.createRadialGradient(p[0], p[1], 0, p[0], p[1], 16);
      g.addColorStop(0, 'rgba(255,236,170,.9)'); g.addColorStop(1, 'rgba(255,236,170,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p[0], p[1], 16, 0, 7); ctx.fill();
    }
    ctx.fillStyle = isSun ? '#ffe9a8' : b.name.startsWith('Voyager') ? '#bfe3d4' : '#c9d2ee';
    ctx.beginPath(); ctx.arc(p[0], p[1], on ? 5 : isSun ? 4.5 : 3, 0, 7); ctx.fill();
    if (on) { ctx.strokeStyle = '#f3c98b'; ctx.beginPath(); ctx.arc(p[0], p[1], 10, 0, 7); ctx.stroke(); }
    labels.push({ x: p[0], y: p[1] - 9, text: b.name, prio: on ? 100 : 30, force: on });
    hits.push({ x: p[0], y: p[1], o: b });
  }

  // ---- stars ----
  for (const s of S.stars) {
    const p = proj(s.v);
    if (!p) continue;
    const lit = s.d <= dOut && s.d >= dIn, on = S.sel === s || S.hover === s;
    if (!onScreen(p) || s.d * sc < 5) continue;
    const foot = proj([s.v[0], s.v[1], 0]);
    if (foot && sc * s.d > 30) {
      ctx.strokeStyle = lit ? 'rgba(243,201,139,.16)' : 'rgba(255,255,255,.07)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(foot[0], foot[1]); ctx.stroke();
    }
    const r = Math.min(5, Math.max(1.5, 3.5 - 0.42 * s.mag)) * Math.min(1.6, Math.max(0.7, p[2]));
    if (lit) {
      const g = ctx.createRadialGradient(p[0], p[1], 0, p[0], p[1], r * 4.5);
      g.addColorStop(0, 'rgba(255,225,170,.45)'); g.addColorStop(1, 'rgba(255,225,170,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p[0], p[1], r * 4.5, 0, 7); ctx.fill();
    }
    ctx.globalAlpha = lit ? 1 : 0.5; ctx.fillStyle = starColor(s.ci);
    ctx.beginPath(); ctx.arc(p[0], p[1], on ? r + 1.5 : r, 0, 7); ctx.fill();
    if (s.hz) { ctx.strokeStyle = 'rgba(150,225,180,.8)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(p[0], p[1], r + 3.5, 0, 7); ctx.stroke(); }
    ctx.globalAlpha = 1;
    if (on) { ctx.strokeStyle = '#f3c98b'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(p[0], p[1], r + 8, 0, 7); ctx.stroke(); }
    const year = lit ? ' · ' + new Date(t - s.d * YEAR).getFullYear() : '';
    labels.push({ x: p[0], y: p[1] - r - 6, text: s.n + year, color: lit ? 'rgba(255,240,215,.95)' : 'rgba(200,205,225,.6)',
      prio: on ? 100 : (lit ? 20 : 8) + (s.hz ? 3 : 0) - s.mag * 0.8, force: on });
    hits.push({ x: p[0], y: p[1], o: s });
  }

  // ---- her lifeline: every moment at the distance its light has reached ----
  const up = d => [0, 0, d];
  if (dOut > 0) {
    ctx.strokeStyle = 'rgba(243,201,139,.6)'; ctx.lineWidth = 1.5;
    path([up(dIn), up(dOut)]); ctx.stroke();
  }
  const sel = S.sel && S.sel._t ? S.sel : null;
  if (sel && o) {
    const d1 = (t - sel._t) / YEAR, d0 = Math.max(0, (t - (sel._e ?? sel._t)) / YEAR);
    if (d1 > 0) {
      ctx.fillStyle = catColor(sel.cat) + '26'; ctx.strokeStyle = catColor(sel.cat); ctx.lineWidth = 1.2; ctx.setLineDash([5, 5]);
      ctx.beginPath(); ctx.arc(o[0], o[1], Math.min(d1 * sc * o[2], big), 0, 2 * Math.PI); ctx.closePath();
      if (sel._e) { ctx.moveTo(o[0] + d0 * sc * o[2], o[1]); ctx.arc(o[0], o[1], Math.min(d0 * sc * o[2], big), 0, 2 * Math.PI); ctx.closePath(); ctx.fill('evenodd'); }
      ctx.stroke(); ctx.setLineDash([]);
      ctx.globalAlpha = 0.5; path(circle(d1)); ctx.stroke(); ctx.globalAlpha = 1;
    }
  }
  const lanes = [];
  for (const it of S.items) {
    if (it._t > t) continue;
    const d = (t - it._t) / YEAR, on = S.sel === it || S.hover === it, color = catColor(it.cat);
    if (it._e) {                                         // a span of time: a coloured band beside the lifeline
      const dEnd = Math.max(0, (t - it._e) / YEAR);
      let lane = lanes.findIndex(end => end <= it._t);
      if (lane < 0) lane = lanes.length;
      lanes[lane] = it._e;
      const a = proj(up(d)), b = proj(up(dEnd));
      if (!a || !b || Math.hypot(a[0] - b[0], a[1] - b[1]) < 3) continue;
      const off = 7 + lane * 7;
      ctx.strokeStyle = color; ctx.lineWidth = on ? 6 : 4; ctx.lineCap = 'round'; ctx.globalAlpha = on ? 1 : 0.8;
      ctx.beginPath(); ctx.moveTo(a[0] + off, a[1]); ctx.lineTo(b[0] + off, b[1]); ctx.stroke();
      ctx.globalAlpha = 1; ctx.lineCap = 'butt';
      const m = [(a[0] + b[0]) / 2 + off, (a[1] + b[1]) / 2];
      if (onScreen(m)) {
        labels.push({ x: m[0] + 8, y: m[1] + 4, text: it.title, align: 'left', color, font: '12px Georgia, serif', prio: on ? 100 : 40, force: on });
        hits.push({ x: m[0], y: m[1], o: it }, { x: a[0] + off, y: a[1], o: it }, { x: b[0] + off, y: b[1], o: it });
      }
      continue;
    }
    const p = proj(up(d));
    if (!onScreen(p) || d * sc < 4) continue;
    ctx.fillStyle = on ? '#fff' : color; ctx.strokeStyle = on ? '#fff' : color; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(p[0], p[1], on ? 6 : 4.5, 0, 7);
    it.id === 'death' ? ctx.stroke() : ctx.fill();
    labels.push({ x: p[0] - 10, y: p[1] + 4, text: it.title, align: 'right', color: on ? '#fff' : '#f6dcb0', font: '13px Georgia, serif', prio: on ? 100 : it.fixed ? 60 : 50, force: on });
    hits.push({ x: p[0], y: p[1], o: it });
  }

  // Earth
  if (o) {
    ctx.fillStyle = '#9cc4ff'; ctx.beginPath(); ctx.arc(o[0], o[1], 3.5, 0, 7); ctx.fill();
    labels.push({ x: o[0], y: o[1] + 17, text: 'Erde', prio: 90, color: '#cfe0ff' });
  }
  placeLabels(ctx, labels);
  return hits;
}
