// The night sky as a dome above Neumünster: you stand on the ground and look around.
// Which of the stars you can see tonight are watching Anna right now?
import { YEAR, starColor, placeLabels } from './util.js';
import { NMS, lstDeg, altaz, sunAltitude } from './astro.js';

const RAD = Math.PI / 180;
// az/alt: where you look (degrees), t*: where the view is gliding to, zoom: 1 = 70° field of view (top to bottom),
// min: lowest allowed gaze – the horizon never rises above the lower edge of the picture
export const skyCam = { az: 180, alt: 30, taz: 180, talt: 0, zoom: 1, tzoom: 1, S: 300, min: 0 };
export const weather = { on: false, hours: null, now: null, failed: false };

export const starAltAz = (s, when) => altaz(s.ra, s.dec, lstDeg(when, NMS.lon), NMS.lat);
export function lookAt(s, when) {
  const [alt, az] = starAltAz(s, when);
  if (alt < 2) return false;
  skyCam.taz = az; skyCam.talt = alt;
  return true;
}

// ---- weather: cloud cover and wind from Open-Meteo (free, no key) ----
export async function loadWeather() {
  try {
    const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${NMS.lat}&longitude=${NMS.lon}`
      + '&hourly=cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high,wind_speed_10m,wind_direction_10m&past_days=1&forecast_days=2&timeformat=unixtime');
    const h = (await r.json()).hourly;
    weather.hours = h.time.map((t, i) => ({ t: t * 1000, all: h.cloud_cover[i], low: Math.max(h.cloud_cover_low[i], h.cloud_cover_mid[i]),
      high: h.cloud_cover_high[i], wind: h.wind_speed_10m[i], dir: h.wind_direction_10m[i] }));
    weather.failed = false;
  } catch { weather.failed = true; }
}
// the forecast hour closest to a moment, or null if we have no data for it
export function weatherAt(when) {
  if (!weather.hours) return null;
  let best = null;
  for (const h of weather.hours) if (!best || Math.abs(h.t - when) < Math.abs(best.t - when)) best = h;
  return best && Math.abs(best.t - when) < 45 * 6e4 ? best : null;
}

// ---- clouds: soft puffs on a flat layer above the observer. The amount matches the real cloud cover,
//      the shapes are an illustration (nobody can tell us the real shapes). ----
const hash = (i, j) => { const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return s - Math.floor(s); };
function smooth(x, y) {
  const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hash(i, j), b = hash(i + 1, j), c = hash(i, j + 1), d = hash(i + 1, j + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const field = (i, j) => smooth(i / 4.5, j / 4.5) * 0.5 + smooth(i / 1.7, j / 1.7) * 0.32 + hash(i, j) * 0.18;
const quant = [];
for (let i = 0; i < 70; i++) for (let j = 0; j < 70; j++) quant.push(field(i, j));
quant.sort((a, b) => a - b);
let puff = null;
function sprite() {
  puff = Object.assign(document.createElement('canvas'), { width: 64, height: 64 });
  const c = puff.getContext('2d'), g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(96,104,134,1)'); g.addColorStop(.5, 'rgba(84,92,122,.55)'); g.addColorStop(1, 'rgba(70,78,108,0)');
  c.fillStyle = g; c.fillRect(0, 0, 64, 64);
}

export function drawSky(ctx, W, H, S) {
  const t = S.t, when = S.skyT ?? Date.now(), hits = [], labels = [];
  const dOut = (t - S.birth) / YEAR, dIn = Math.max(0, (t - S.death) / YEAR);
  const lst = lstDeg(when, NMS.lon), cx = W / 2, cy = H / 2;

  // camera
  // an ordinary (rectilinear) camera inside the celestial sphere: straight horizon, stars arching overhead
  const base = H / 2 / Math.tan(35 * RAD);
  skyCam.tzoom = Math.min(2.3, Math.max(0.62, skyCam.tzoom));
  skyCam.min = Math.atan(Math.max(0, H / 2 - 172) / (base * skyCam.tzoom)) / RAD;
  skyCam.talt = Math.min(89.9, Math.max(skyCam.min, skyCam.talt));
  skyCam.zoom += (skyCam.tzoom - skyCam.zoom) * 0.15;
  skyCam.alt += (skyCam.talt - skyCam.alt) * 0.15;
  skyCam.az = (skyCam.az + ((skyCam.taz - skyCam.az + 540) % 360 - 180) * 0.15 + 360) % 360;
  const Sc = skyCam.S = base * skyCam.zoom;
  const a0 = skyCam.alt * RAD, z0 = skyCam.az * RAD;
  const f = [Math.cos(a0) * Math.sin(z0), Math.cos(a0) * Math.cos(z0), Math.sin(a0)];       // forward (east, north, up)
  const r = [Math.cos(z0), -Math.sin(z0), 0];
  const u = [-Math.sin(a0) * Math.sin(z0), -Math.sin(a0) * Math.cos(z0), Math.cos(a0)];
  // perspective projection of a unit direction; only what lies in front of us
  const Pd = (d, cut = 0.12) => {
    const zc = d[0] * f[0] + d[1] * f[1] + d[2] * f[2];
    if (zc < cut) return null;
    const k = Sc / zc;
    return [cx + (d[0] * r[0] + d[1] * r[1]) * k, cy - (d[0] * u[0] + d[1] * u[1] + d[2] * u[2]) * k, zc, 0, k];
  };
  const dir = (alt, az) => [Math.cos(alt * RAD) * Math.sin(az * RAD), Math.cos(alt * RAD) * Math.cos(az * RAD), Math.sin(alt * RAD)];
  const P = (alt, az, cut) => Pd(dir(alt, az), cut);
  const star = (ra, dec) => { const [alt, az] = altaz(ra, dec, lst, NMS.lat); const p = alt > -3 ? P(alt, az) : null; if (p) p[3] = alt; return p; };
  const seen = p => p && p[0] > -30 && p[0] < W + 30 && p[1] > -30 && p[1] < H + 30;

  // sky
  const hy = Math.min(H * 3, cy + Sc * Math.tan(a0));                // where the horizon crosses the middle of the picture
  const sky = ctx.createLinearGradient(0, hy - 1.1 * H, 0, hy);
  sky.addColorStop(0, '#060920'); sky.addColorStop(.7, '#10173c'); sky.addColorStop(1, '#232a5c');
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);

  // a faint grid makes the dome readable: circles of equal height, lines towards the zenith
  ctx.strokeStyle = 'rgba(150,170,230,.09)'; ctx.lineWidth = 1;
  for (const alt of [15, 30, 45, 60, 75]) { ctx.beginPath(); let pen = false; for (let az = 0; az <= 360; az += 3) { const p = P(alt, az); if (p) { pen ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); } pen = !!p; } ctx.stroke(); }
  for (let az = 0; az < 360; az += 22.5) { ctx.beginPath(); let pen = false; for (let alt = 0; alt <= 90; alt += 5) { const p = P(alt, az); if (p) { pen ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); } pen = !!p; } ctx.stroke(); }
  const zen = P(90, 0);
  if (seen(zen)) labels.push({ x: zen[0], y: zen[1] - 6, text: 'Zenit', color: 'rgba(150,170,230,.5)', font: '10px "Source Sans 3", system-ui, sans-serif', prio: 4 });

  if (S.sky) {
    ctx.strokeStyle = 'rgba(150,170,230,.3)';
    for (const line of S.sky.lines) {
      ctx.beginPath();
      let prev = null;
      for (const [ra, dec] of line) {
        const p = star(ra, dec);
        if (prev && p && (seen(prev) || seen(p))) { ctx.moveTo(prev[0], prev[1]); ctx.lineTo(p[0], p[1]); }
        prev = p;
      }
      ctx.stroke();
    }
    for (const [ra, dec, name] of S.sky.names) {
      const p = star(ra, dec);
      if (seen(p) && p[3] > 6) labels.push({ x: p[0], y: p[1], text: name.toUpperCase(), color: 'rgba(150,170,230,.55)', font: '10px "Source Sans 3", system-ui, sans-serif', prio: 5 });
    }
    const grow = Math.min(1.8, Math.max(0.8, Math.sqrt(skyCam.zoom)));
    for (const s of S.sky.stars) {
      const p = star(s[0], s[1]);
      if (!seen(p) || p[3] < 0) continue;
      ctx.globalAlpha = Math.min(0.9, 0.35 + p[3] / 25); ctx.fillStyle = starColor(s[3]);       // dimmer in the haze near the horizon
      ctx.beginPath(); ctx.arc(p[0], p[1], Math.max(0.7, 3.2 - 0.55 * s[2]) * grow, 0, 7); ctx.fill();
      if (s[5] && s[2] < 1.6 && !(s[4] && s[4] <= dOut && s[4] >= dIn)) labels.push({ x: p[0], y: p[1] + 17, text: s[5], color: 'rgba(210,215,235,.65)', font: '11px "Source Sans 3", system-ui, sans-serif', prio: 6 });
    }
    ctx.globalAlpha = 1;
  }

  // the stars that can see her – only those visible to the naked eye
  for (const s of S.stars) {
    if (s.mag > 6) continue;
    const p = star(s.ra, s.dec);
    if (!seen(p) || p[3] < 0) continue;
    const lit = s.d <= dOut && s.d >= dIn, rad = Math.max(1.8, 3.6 - 0.5 * s.mag);
    const on = S.sel === s || S.hover === s || (S.sel?.kind === 'year' && Math.abs(s.d - (t - S.sel._t) / YEAR) < 0.75);
    if (lit) {
      const glow = ctx.createRadialGradient(p[0], p[1], 0, p[0], p[1], rad * 5.5);
      glow.addColorStop(0, 'rgba(255,215,150,.7)'); glow.addColorStop(1, 'rgba(255,215,150,0)');
      ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(p[0], p[1], rad * 5.5, 0, 7); ctx.fill();
      ctx.fillStyle = '#ffe9c4'; ctx.beginPath(); ctx.arc(p[0], p[1], rad, 0, 7); ctx.fill();
      labels.push({ x: p[0], y: p[1] - rad - 7, text: `${s.n} · ${new Date(t - s.d * YEAR).getFullYear()}`, color: '#ffe3b5',
        font: '13px EB Garamond, Georgia, serif', prio: on ? 100 : 30 - s.mag, force: on });
    } else if (on) labels.push({ x: p[0], y: p[1] - rad - 7, text: s.n, prio: 100, force: true });
    if (on) { ctx.strokeStyle = '#f3c98b'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(p[0], p[1], rad + 9, 0, 7); ctx.stroke(); }
    hits.push({ x: p[0], y: p[1], o: s });
  }

  // clouds drift with the real wind
  const wx = weather.on ? weatherAt(when) : null;
  if (wx) {
    if (!puff) sprite();
    const sec = performance.now() / 1000, wd = (wx.dir + 180) * RAD, speed = wx.wind / 3600 * 3;      // km per second, a little faster than reality
    for (const [cover, h, cell, alpha, seed] of [[wx.high, 9, 2.6, 0.35, 900], [wx.low, 2, 0.6, 0.8, 0]]) {
      if (cover < 3) continue;
      const limit = quant[Math.min(quant.length - 1, Math.floor(cover / 100 * quant.length))];
      const ox = Math.sin(wd) * speed * sec, oy = Math.cos(wd) * speed * sec;
      const si = Math.floor(ox / cell), sj = Math.floor(oy / cell), fx = ox - si * cell, fy = oy - sj * cell, n = 40;
      ctx.globalAlpha = alpha;
      for (let i = -n; i <= n; i++) for (let j = -n; j <= n; j++) {
        const v = field(i - si + seed, j - sj + seed);
        if (v > limit) continue;
        const x = i * cell + fx, y = j * cell + fy, dist = Math.hypot(x, y, h);
        const p = Pd([x / dist, y / dist, h / dist]);
        if (!p) continue;
        const size = Math.min(p[4], 4 * Sc) * cell * (0.9 + (limit - v) * 2.5) / dist;
        if (p[0] < -size || p[0] > W + size || p[1] < -size || p[1] > H + size) continue;
        ctx.drawImage(puff, p[0] - size, p[1] - size, size * 2, size * 2);
      }
    }
    ctx.globalAlpha = 1;
  }

  // the ground: everything outside the horizon circle
  if (hy < H + 40) {                                   // the horizon is a straight, level line in this projection
    ctx.fillStyle = '#05060f'; ctx.fillRect(0, hy, W, H - hy + 1);
    for (const [w, a] of [[26, 0.05], [10, 0.08], [1.5, 0.5]]) { ctx.fillStyle = `rgba(243,201,139,${a})`; ctx.fillRect(0, hy - w / 2, W, w); }
  }
  ctx.textAlign = 'center';
  ['N', 'NO', 'O', 'SO', 'S', 'SW', 'W', 'NW'].forEach((name, i) => {
    const p = P(0, i * 45);
    if (!seen(p)) return;
    const ex = 0, ey = 1;
    ctx.font = i % 2 ? '12px EB Garamond, Georgia, serif' : '16px EB Garamond, Georgia, serif'; ctx.fillStyle = i % 2 ? 'rgba(243,201,139,.6)' : 'rgba(243,201,139,.95)';
    ctx.fillText(name, p[0] + ex * 20, p[1] + ey * 20 + 5);
  });

  placeLabels(ctx, labels);
  ctx.font = '13px "Source Sans 3", system-ui, sans-serif'; ctx.fillStyle = 'rgba(169,164,184,.9)'; ctx.textAlign = 'center';
  if (sunAltitude(when) > -6) ctx.fillText('Zu dieser Zeit ist es noch hell – die Sterne stehen trotzdem genau dort.', cx, H - 150);
  return hits;
}
