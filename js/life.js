// The lifeline strip: her whole life from left to right. Drag along it to pick a time, tap a diamond to open a moment.
import { catColor } from './util.js';

export function createLife(cv, S, { onYear, onItem, label }) {
  const ctx = cv.getContext('2d'), PAD = 20;
  let W = 0, H = 0, hover = null, drag = false;
  const span = () => Math.max(1, S.death - S.birth);
  const xOf = t => PAD + (t - S.birth) / span() * (W - 2 * PAD);
  const tAt = px => S.birth + Math.min(1, Math.max(0, (px - PAD) / (W - 2 * PAD))) * span();
  const base = () => H - 20;
  const moments = () => S.items.filter(i => !i._e && i._t >= S.birth && i._t <= S.death);

  function bubble(x, text, strong) {
    ctx.font = `${strong ? 600 : 400} 12px system-ui, sans-serif`;
    const w = ctx.measureText(text).width + 14, bx = Math.min(W - w - 2, Math.max(2, x - w / 2));
    ctx.fillStyle = strong ? '#f3c98b' : 'rgba(40,36,70,.95)';
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(bx, 1, w, 17, 8) : ctx.rect(bx, 1, w, 17); ctx.fill();
    ctx.fillStyle = strong ? '#1b1630' : '#ece6da'; ctx.textAlign = 'left'; ctx.fillText(text, bx + 7, 14);
  }

  function draw() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    W = cv.clientWidth; H = cv.clientHeight;
    if (!W || !S.birth) return;
    if (cv.width !== Math.round(W * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const y = base();
    // years
    ctx.font = '10px system-ui, sans-serif'; ctx.textAlign = 'center';
    const y0 = new Date(S.birth).getFullYear(), y1 = new Date(S.death).getFullYear(), step = W < 420 ? 10 : 5;
    for (let yr = Math.ceil(y0 / step) * step; yr <= y1; yr += step) {
      const x = xOf(new Date(yr, 0, 1).getTime()), major = yr % 10 === 0;
      ctx.fillStyle = `rgba(255,255,255,${major ? 0.4 : 0.18})`; ctx.fillRect(x, y - (major ? 6 : 3), 1, major ? 12 : 6);
      if (major) { ctx.fillStyle = 'rgba(169,164,184,.95)'; ctx.fillText(yr, x, H - 3); }
    }
    ctx.fillStyle = 'rgba(243,201,139,.25)'; ctx.fillRect(PAD, y - 3, W - 2 * PAD, 6);
    ctx.fillStyle = 'rgba(255,236,200,.95)'; ctx.fillRect(PAD, y - 1, W - 2 * PAD, 2);
    // spans of time as thin bands above the line
    const lanes = [];
    for (const i of S.items) {
      if (!i._e) continue;
      let lane = lanes.findIndex(end => end <= i._t);
      if (lane < 0) lane = lanes.length;
      lanes[lane] = i._e;
      if (lane > 3) continue;
      const a = xOf(Math.max(i._t, S.birth)), b = xOf(Math.min(i._e, S.death));
      ctx.fillStyle = catColor(i.cat); ctx.globalAlpha = S.sel === i ? 1 : 0.8;
      ctx.fillRect(a, y - 9 - lane * 5, Math.max(2, b - a), 3.5);
    }
    ctx.globalAlpha = 1;
    for (const i of moments()) {
      const x = xOf(i._t), q = S.sel === i ? 7 : 5;
      ctx.beginPath(); ctx.moveTo(x, y - q); ctx.lineTo(x + q, y); ctx.lineTo(x, y + q); ctx.lineTo(x - q, y); ctx.closePath();
      ctx.fillStyle = i.id === 'death' ? '#1b1630' : catColor(i.cat); ctx.fill();
      ctx.strokeStyle = S.sel === i ? '#fff' : 'rgba(255,255,255,.75)'; ctx.lineWidth = S.sel === i ? 2 : 1; ctx.stroke();
    }
    if (hover != null && !drag) {
      const x = xOf(hover);
      ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fillRect(x, 18, 1, y - 14);
      bubble(x, label(hover), false);
    }
    const at = S.sel?.kind === 'year' ? S.sel._t : S.sel?._t && !S.sel._e ? S.sel._t : null;
    if (at != null && at >= S.birth && at <= S.death) {
      const x = xOf(at);
      ctx.fillStyle = '#f3c98b'; ctx.fillRect(x - 1, 18, 2, y - 12);
      if (S.sel.kind === 'year') { ctx.beginPath(); ctx.arc(x, y, 5, 0, 7); ctx.fill(); }
      bubble(x, label(at), true);
    }
  }

  const where = e => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  cv.addEventListener('pointerdown', e => {
    const [x, y] = where(e);
    const hit = moments().map(i => [Math.abs(xOf(i._t) - x), i]).filter(h => h[0] < (e.pointerType === 'mouse' ? 8 : 12) && Math.abs(y - base()) < 16).sort((a, b) => a[0] - b[0])[0];
    if (hit) { onItem(hit[1]); draw(); return; }
    cv.setPointerCapture(e.pointerId); drag = true; onYear(tAt(x)); draw();
  });
  cv.addEventListener('pointermove', e => {
    const [x] = where(e);
    if (drag) onYear(tAt(x)); else hover = e.pointerType === 'mouse' ? tAt(x) : null;
    draw();
  });
  const end = () => { drag = false; draw(); };
  cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
  cv.addEventListener('pointerleave', () => { hover = null; draw(); });
  addEventListener('resize', draw);
  return { draw };
}
