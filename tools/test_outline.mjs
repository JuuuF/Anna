// Checks the outline of her light sphere in the 3D view against a ray-sphere test.
// For many random camera positions it renders the 3D view into a recording stand-in for a canvas, takes the outline the
// glowing ball is clipped to, and compares it, point by point on the screen, with whether a line of sight really hits the sphere.
// Run from the repository root: node tools/test_outline.mjs
const fakeCtx = () => {
  const rec = { paths: [], clips: [] };
  const own = {
    rec,
    beginPath() { rec.paths = []; },
    moveTo(x, y) { rec.paths.push([[x, y]]); },
    lineTo(x, y) { rec.paths.at(-1)?.push([x, y]); },
    rect(x, y, w, h) { rec.paths.push([[x, y], [x + w, y], [x + w, y + h], [x, y + h]]); },
    clip() { rec.clips.push(rec.paths.map(p => p.slice())); },
    measureText: () => ({ width: 10 }),
    createRadialGradient: () => ({ addColorStop() {} }),
    createImageData: (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
    getContext() { return this; },
  };
  return new Proxy(own, { get: (o, k) => (k in o ? o[k] : () => ({ width: 10, addColorStop() {} })), set: (o, k, v) => { o[k] = v; return true; } });
};
globalThis.document = { createElement: () => fakeCtx() };

const { cam, drawSpace } = await import('../js/space.js');
const { updateBodies } = await import('../js/astro.js');
const { YEAR } = await import('../js/util.js');

const W = 1200, H = 800, F = 1.05 * Math.max(W, H), cx = W / 2, cy = H / 2;
const S = { t: Date.parse('2026-11-21T12:00:00Z'), birth: Date.parse('1970-05-02'), death: Date.parse('2026-09-15'), stars: [], items: [], sky: null, sel: null, hover: null, still: true, cy };
const dOut = (S.t - S.birth) / YEAR, dIn = (S.t - S.death) / YEAR;
updateBodies(S.t);

let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const inside = (poly, x, y) => {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
  }
  return c;
};
const nearEdge = (poly, x, y, tol) => poly.some((a, i) => {
  const b = poly[(i + 1) % poly.length], dx = b[0] - a[0], dy = b[1] - a[1], l = dx * dx + dy * dy;
  const k = l ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / l)) : 0;
  return Math.hypot(a[0] + k * dx - x, a[1] + k * dy - y) < tol;
});

let tested = 0, samples = 0, wrong = 0, views = { outline: 0, empty: 0, inside: 0, behind: 0 };
for (let n = 0; n < 400; n++) {
  // a random camera: direction, height, the point it turns around (sometimes far outside her light) and the distance of the eye
  cam.yaw = rnd() * 2 * Math.PI; cam.pitch = (rnd() * 2 - 1) * 1.5;
  const c = [0, 1, 2].map(() => (rnd() * 2 - 1) * (rnd() < 0.5 ? 70 : 140));
  cam.c = [...c]; cam.tc = [...c]; cam.focus = null;
  const E = Math.exp(Math.log(0.5) + rnd() * Math.log(600));      // 0.5 to 300 light-years
  cam.scale = cam.target = F / E;
  const ctx = fakeCtx();
  drawSpace(ctx, W, H, S);
  // where the eye is and how it looks, worked out independently of the drawing code
  const cyaw = Math.cos(cam.yaw), syaw = Math.sin(cam.yaw), cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
  const right = [cyaw, -syaw, 0], up = [syaw * sp, cyaw * sp, cp], ahead = [syaw * cp, cyaw * cp, -sp];
  const eye = c.map((v, i) => v - E * ahead[i]);
  const dist = Math.hypot(...eye);
  const hits = (x, y, r) => {
    const d = [0, 1, 2].map(i => right[i] * (x - cx) / F - up[i] * (y - cy) / F + ahead[i]);
    const a = d[0] ** 2 + d[1] ** 2 + d[2] ** 2, b = 2 * (eye[0] * d[0] + eye[1] * d[1] + eye[2] * d[2]), q = dist * dist - r * r;
    const disc = b * b - 4 * a * q;
    return disc >= 0 && (-b + Math.sqrt(disc)) > 0 && (q < 0 || -b > 0);
  };
  if (dist <= dOut) { views.inside++; continue; }                  // inside her light there is no outline to check
  const clip = ctx.rec.clips[0];
  const outer = clip?.[0], hole = clip?.[1];
  if (!outer) views.empty++; else views.outline++;
  if (outer?.some(p => Math.hypot(p[0] - cx, p[1] - cy) > 3 * F)) views.behind++;     // part of the outline lies behind the eye
  tested++;
  for (let i = 0; i < 40; i++) for (let j = 0; j < 26; j++) {
    const x = (i + 0.5) * W / 40, y = (j + 0.5) * H / 26;
    const want = hits(x, y, dOut) && !hits(x, y, dIn);
    if (outer && (nearEdge(outer, x, y, 2) || (hole && nearEdge(hole, x, y, 2)))) continue;   // the outline is a polygon: allow for its corners
    const got = !!outer && inside(outer, x, y) && !(hole && inside(hole, x, y));
    samples++;
    if (got !== want) {
      wrong++;
      if (wrong <= 5) console.log('wrong at', x, y, { yaw: cam.yaw, pitch: cam.pitch, c, E, dist, want, got });
    }
  }
}
console.log(`${tested} views from outside (${views.outline} with the sphere in view, ${views.behind} of them reaching behind the eye, ${views.empty} without), ${views.inside} from inside; ${samples} screen points, ${wrong} wrong`);
if (wrong) process.exit(1);
