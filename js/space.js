// The 3D map: Earth in the centre, real star positions around it, and the light of a lifetime as a growing sphere.
import { YEAR, LS, AU, catColor, starColor, placeLabels } from './util.js';
import { bodies, orbits, orbitPoints, moonPath, sun, vec } from './astro.js';

// c: the point the camera looks at and turns around (light-years, Earth = 0), tc: where it is gliding to,
// focus: an object to stay with (a star, a planet, a moment on the lifeline)
export const cam = { yaw: 0.7, pitch: 0.5, scale: 0, target: 0, c: [0, 0, 0], tc: [0, 0, 0], focus: null, touched: 0, ease: 0.12 };
// where something is right now: a moment sits on the lifeline at the distance its light has travelled
export function posOf(o, t) {
  if (o.v) return o.v;
  if (!o._t) return [0, 0, 0];
  const when = o._e ? (o._t + Math.min(o._e, t)) / 2 : o._t;
  return [0, 0, Math.max(0, (t - when) / YEAR)];
}
// move the view sideways by a number of screen pixels
export function panBy(dx, dy) {
  const cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw), cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch), k = 1 / cam.scale;
  const right = [cy, -sy, 0], up = [sy * sp, cy * sp, cp];
  cam.focus = null;
  cam.tc = cam.tc.map((c, i) => Math.max(-150, Math.min(150, c - dx * k * right[i] + dy * k * up[i])));
  cam.c = [...cam.tc];
}
export const atHome = () => !cam.focus && Math.hypot(...cam.tc) < 1e-9;
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
  const t = S.t, cx = W / 2, cy = S.cy ?? H / 2, hits = [], labels = [];
  const dOut = (t - S.birth) / YEAR, dIn = Math.max(0, (t - S.death) / YEAR);
  if (!cam.scale) cam.scale = cam.target = fit(Math.max(dOut, 20) * 1.08, W, H);
  cam.scale = Math.exp(Math.log(cam.scale) + (Math.log(cam.target) - Math.log(cam.scale)) * cam.ease);
  if (Math.abs(Math.log(cam.target / cam.scale)) < 0.01) cam.ease = 0.12;
  if (cam.focus) cam.tc = [...posOf(cam.focus, t)];
  cam.c = cam.c.map((c, i) => (Math.abs(cam.tc[i] - c) * cam.scale < 0.05 ? cam.tc[i] : c + (cam.tc[i] - c) * 0.1));
  if (performance.now() - cam.touched > 5000 && !S.hover) cam.yaw += 0.0006;
  const sc = cam.scale, F = 1.05 * Math.max(W, H);     // small F = strong perspective
  const cyaw = Math.cos(cam.yaw), syaw = Math.sin(cam.yaw), cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
  const rot = v => {
    const x = v[0] * cyaw - v[1] * syaw, y = v[0] * syaw + v[1] * cyaw;
    return [x, v[2] * cp + y * sp, y * cp - v[2] * sp];            // right, up, depth – the camera looks down from the north
  };
  // -> [screen x, screen y, perspective factor] or null if behind the viewer
  const proj = v => {
    const [x, up, depth] = rot([v[0] - cam.c[0], v[1] - cam.c[1], v[2] - cam.c[2]]);
    const f = F / (F + depth * sc);
    return f > 0 && f < 8 ? [cx + x * sc * f, cy - up * sc * f, f, depth] : null;
  };
  // depth cues: what is far away gets smaller and dimmer
  const shade = p => Math.min(1, Math.max(0.28, (p[2] - 0.6) / 0.45));
  const grow = p => Math.min(2.2, Math.max(0.55, p[2]));
  const onScreen = p => p && p[0] > -40 && p[0] < W + 40 && p[1] > -40 && p[1] < H + 40;
  // side: 0 = everything, -1 = only the half in front of depth d0, 1 = only the half behind it
  const path = (pts, close, side = 0, d0 = 0) => {
    ctx.beginPath();
    let pen = false;
    for (const v of pts) {
      const p = proj(v);
      if (!p || (side < 0 && p[3] > d0) || (side > 0 && p[3] <= d0)) { pen = false; continue; }
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
  const sil = r => {                                   // outline radius of a sphere around Earth; huge once the camera is inside it
    const Rpx = r * sc, D = F + (o ? o[3] : 0) * sc;
    return Rpx >= D * 0.985 ? big : Math.min(big, F * Rpx / Math.sqrt(D * D - Rpx * Rpx));
  };
  const twoPass = (pts, color, back, front, width = 1) => {    // far half faint, near half clear
    ctx.strokeStyle = color; ctx.lineWidth = width;
    ctx.globalAlpha = back; path(pts, false, 1, o ? o[3] : 0); ctx.stroke();
    ctx.globalAlpha = front; path(pts, false, -1, o ? o[3] : 0); ctx.stroke();
    ctx.globalAlpha = 1;
  };
  if (o && dOut > 0) {
    const rOut = sil(dOut), rIn = Math.min(sil(dIn), rOut);
    if (rOut < big) { ctx.fillStyle = 'rgba(243,201,139,.055)'; path(circle(dOut), true); ctx.fill(); }      // the plane all stalks stand on
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
    if (rOut < big) for (const plane of [0, 1, 2]) twoPass(circle(dOut, plane), 'rgb(243,201,139)', 0.07, plane ? 0.3 : 0.45, plane ? 1 : 1.4);
    if (rIn > 30 && rIn < big) for (const plane of [0, 1, 2]) twoPass(circle(dIn, plane), 'rgb(243,201,139)', 0.07, 0.3);
  }

  // ---- rings on the reference plane: distance = years ago ----
  const ringList = [...RINGS];
  for (let k = 10; k <= 100; k += 10) ringList.push([k, `${k} Lichtjahre · ${new Date(t - k * YEAR).getFullYear()}`]);
  for (const [d, text] of ringList) {
    const px = d * sc;
    if (px < 26 || px > 2.5 * Math.max(W, H)) continue;
    twoPass(circle(d), '#fff', 0.05, 0.17);
    const a = -cam.yaw + Math.PI / 2 * 0.25, p = proj([d * Math.cos(a), d * Math.sin(a), 0]);       // label where the ring is closest to the viewer's right
    const q = proj([d * Math.cos(-cam.yaw - Math.PI / 2), d * Math.sin(-cam.yaw - Math.PI / 2), 0]);
    const at = onScreen(q) ? q : p;
    if (onScreen(at)) labels.push({ x: at[0], y: at[1] + 14, text, color: 'rgba(169,164,184,.85)', font: '11px system-ui, sans-serif', prio: 1 });
  }
  const oort = 0.8 * sc;
  if (o && oort > 60 && oort < 3 * Math.max(W, H)) {
    ctx.setLineDash([3, 6]); ctx.strokeStyle = 'rgba(160,190,230,.25)';
    ctx.beginPath(); ctx.arc(o[0], o[1], sil(0.8), 0, 2 * Math.PI); ctx.stroke(); ctx.setLineDash([]);
    labels.push({ x: o[0], y: o[1] - sil(0.8) - 6, text: 'Oortsche Wolke', color: 'rgba(160,190,230,.7)', font: '11px system-ui, sans-serif', prio: 2 });
  }

  // ---- solar system ----
  for (const orb of orbits) {
    const px = orb.a * sc;
    if (px < 10 || px > 30 * Math.max(W, H)) continue;
    ctx.strokeStyle = orb.name === 'Erde' ? 'rgba(140,180,255,.3)' : 'rgba(255,255,255,.13)'; ctx.lineWidth = 1;
    path(orbitPoints(orb.name, t).map(p => [p[0] + sun[0], p[1] + sun[1], p[2] + sun[2]])); ctx.stroke();
  }
  if (bodies[0].d * sc > 25 && bodies[0].d * sc < 30 * Math.max(W, H)) { ctx.strokeStyle = 'rgba(255,255,255,.13)'; path(moonPath(t)); ctx.stroke(); }
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
  const yearD = S.sel?._t && !S.sel._e ? (t - S.sel._t) / YEAR : -9;
  const now = performance.now() / 1000;       // a chosen time: the stars its light is passing right now stand out
  for (const s of S.stars) {
    const p = proj(s.v);
    if (!p) continue;
    const lit = s.d <= dOut && s.d >= dIn, on = S.sel === s || S.hover === s || Math.abs(s.d - yearD) < 0.75;
    if (!onScreen(p) || s.d * sc < 5) continue;
    const foot = proj([s.v[0], s.v[1], 0]);
    const sh = shade(p);
    if (foot && sc * s.d > 30) {
      ctx.globalAlpha = sh; ctx.lineWidth = 1;
      ctx.strokeStyle = lit ? 'rgba(243,201,139,.3)' : 'rgba(255,255,255,.12)';
      if (s.v[2] < 0) ctx.setLineDash([2, 3]);                     // below the plane
      ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(foot[0], foot[1]); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = ctx.strokeStyle; ctx.fillRect(foot[0] - 1, foot[1] - 1, 2, 2);
      ctx.globalAlpha = 1;
    }
    const r = Math.min(5, Math.max(1.5, 3.5 - 0.42 * s.mag)) * grow(p);
    if (lit) {
      const g = ctx.createRadialGradient(p[0], p[1], 0, p[0], p[1], r * 4.5);
      g.addColorStop(0, `rgba(255,225,170,${0.5 * sh * (0.8 + 0.2 * Math.sin(now * 1.7 + s.ra))})`); g.addColorStop(1, 'rgba(255,225,170,0)');      // a gentle twinkle
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p[0], p[1], r * 4.5, 0, 7); ctx.fill();
    }
    ctx.globalAlpha = (lit ? 1 : 0.55) * sh; ctx.fillStyle = starColor(s.ci);
    ctx.beginPath(); ctx.arc(p[0], p[1], on ? r + 1.5 : r, 0, 7); ctx.fill();
    if (s.hz) { ctx.strokeStyle = 'rgba(150,225,180,.8)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(p[0], p[1], r + 3.5, 0, 7); ctx.stroke(); }
    ctx.globalAlpha = 1;
    if (on) { ctx.strokeStyle = '#f3c98b'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(p[0], p[1], r + 8, 0, 7); ctx.stroke(); }
    const year = lit ? ' · ' + new Date(t - s.d * YEAR).getFullYear() : '';
    labels.push({ x: p[0], y: p[1] - r - 6, text: s.n + year, color: lit ? 'rgba(255,240,215,.95)' : 'rgba(200,205,225,.6)',
      alpha: on ? 1 : Math.max(0.4, sh), font: `${Math.round(Math.min(14, Math.max(10, 11.5 * p[2])))}px system-ui, sans-serif`,
      prio: on ? 100 : (lit ? 20 : 8) + (s.hz ? 3 : 0) - s.mag * 0.8 + p[2] * 6, force: on, soft: true });
    hits.push({ x: p[0], y: p[1], o: s });
  }

  // ---- her lifeline: every moment at the distance its light has reached ----
  const up = d => [0, 0, d];
  if (dOut > 0) {
    ctx.strokeStyle = 'rgba(243,201,139,.22)'; ctx.lineWidth = 7; path([up(dIn), up(dOut)]); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,236,200,.95)'; ctx.lineWidth = 2; path([up(dIn), up(dOut)]); ctx.stroke();
  }
  const sel = S.sel && S.sel._t ? S.sel : null;
  if (sel && o) {
    const d1 = (t - sel._t) / YEAR, d0 = Math.max(0, (t - (sel._e ?? sel._t)) / YEAR);
    if (d1 > 0) {
      ctx.fillStyle = catColor(sel.cat) + '26'; ctx.strokeStyle = catColor(sel.cat); ctx.lineWidth = 1.2; ctx.setLineDash([5, 5]);
      ctx.beginPath(); ctx.arc(o[0], o[1], sil(d1), 0, 2 * Math.PI); ctx.closePath();
      if (sel._e) { ctx.moveTo(o[0] + sil(d0), o[1]); ctx.arc(o[0], o[1], sil(d0), 0, 2 * Math.PI); ctx.closePath(); ctx.fill('evenodd'); }
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
        labels.push({ x: m[0] + 10, y: m[1] + 4, text: it.title, align: 'left', color: '#fff', box: color, font: 'italic 13px Georgia, serif', prio: on ? 100 : 40, force: on });
        hits.push({ x: m[0], y: m[1], o: it }, { x: a[0] + off, y: a[1], o: it }, { x: b[0] + off, y: b[1], o: it });
      }
      continue;
    }
    const p = proj(up(d));
    if (!onScreen(p) || d * sc < 4) continue;
    const q = on ? 9 : 7;                                // moments are diamonds with a name plate – stars are round dots
    ctx.beginPath(); ctx.moveTo(p[0], p[1] - q); ctx.lineTo(p[0] + q, p[1]); ctx.lineTo(p[0], p[1] + q); ctx.lineTo(p[0] - q, p[1]); ctx.closePath();
    ctx.fillStyle = it.id === 'death' ? '#1b1630' : color; ctx.fill();
    ctx.strokeStyle = on ? '#fff' : it.id === 'death' ? color : 'rgba(255,255,255,.85)'; ctx.lineWidth = on ? 2.5 : 1.5; ctx.stroke();
    labels.push({ x: p[0] - 13, y: p[1] + 4, text: it.title, align: 'right', color: '#fff', box: on ? '#fff' : color, font: '14px Georgia, serif', prio: on ? 100 : it.fixed ? 60 : 50, force: on });
    hits.push({ x: p[0], y: p[1], o: it });
  }

  // a chosen time that is not one of the stored moments (a point picked on the strip, a birthday of the journey)
  if (sel && !S.items.includes(sel)) {
    const p = proj(up((t - sel._t) / YEAR));
    if (onScreen(p)) {
      ctx.strokeStyle = '#f3c98b'; ctx.lineWidth = 2; ctx.fillStyle = '#1b1630';
      ctx.beginPath(); ctx.arc(p[0], p[1], 7, 0, 7); ctx.fill(); ctx.stroke();
      labels.push({ x: p[0] - 14, y: p[1] + 4, text: sel.title, align: 'right', color: '#fff', box: '#f3c98b', font: '14px Georgia, serif', prio: 100, force: true });
    }
  }

  // Earth
  if (o) {
    ctx.fillStyle = '#9cc4ff'; ctx.beginPath(); ctx.arc(o[0], o[1], 3.5, 0, 7); ctx.fill();
    labels.push({ x: o[0], y: o[1] + 17, text: 'Erde', prio: 90, color: '#cfe0ff' });
  }
  placeLabels(ctx, labels, Math.round(W * H / 11000));
  return hits;
}
