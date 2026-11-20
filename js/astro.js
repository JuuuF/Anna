// Small astronomy toolbox: positions of the planets, the Moon and the Voyager probes as seen from Earth,
// and the transformation from star coordinates to the sky above a place on Earth.
// Accuracy: good enough for a map (well below a degree for the planets), not for navigation.
import { AU, LS } from './util.js';

const RAD = Math.PI / 180, EPS = 23.4392911 * RAD;
export const NMS = { name: 'Neumünster', lat: 54.07, lon: 10.01 };

const jd = ms => ms / 864e5 + 2440587.5;
const dJ2000 = ms => jd(ms) - 2451545;

// equatorial unit direction * distance
export function vec(raDeg, decDeg, d = 1) {
  const ra = raDeg * RAD, de = decDeg * RAD;
  return [d * Math.cos(de) * Math.cos(ra), d * Math.cos(de) * Math.sin(ra), d * Math.sin(de)];
}
const eclToEq = ([x, y, z]) => [x, y * Math.cos(EPS) - z * Math.sin(EPS), y * Math.sin(EPS) + z * Math.cos(EPS)];

// Keplerian elements at J2000 (JPL "approximate positions of the planets"):
// a (AU), e, inclination, mean longitude, longitude of perihelion, ascending node (deg), mean motion (deg/century)
const EL = {
  Merkur: [0.38709927, 0.20563593, 7.00497902, 252.2503235, 77.45779628, 48.33076593, 149472.67411175],
  Venus: [0.72333566, 0.00677672, 3.39467605, 181.9790995, 131.60246718, 76.67984255, 58517.81538729],
  Erde: [1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0, 35999.37244981],
  Mars: [1.52371034, 0.0933941, 1.84969142, -4.55343205, -23.94362959, 49.55953891, 19140.30268499],
  Jupiter: [5.202887, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909, 3034.74612775],
  Saturn: [9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448, 1222.49362201],
  Uranus: [19.18916464, 0.04725744, 0.77263783, 313.23810451, 170.9542763, 74.01692503, 428.48202785],
  Neptun: [30.06992276, 0.00859048, 1.77004347, -55.12002969, 44.96476227, 131.78422574, 218.45945325],
  Pluto: [39.48211675, 0.2488273, 17.14001206, 238.92903833, 224.06891629, 110.30393684, 145.20780515],
};

// heliocentric equatorial position (AU) for a mean anomaly M (rad)
function kepler([a, e, inc, , peri, node], M) {
  let E = M;
  for (let i = 0; i < 8; i++) E = M + e * Math.sin(E);
  const xp = a * (Math.cos(E) - e), yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
  const w = (peri - node) * RAD, O = node * RAD, I = inc * RAD;
  const cw = Math.cos(w), sw = Math.sin(w), cO = Math.cos(O), sO = Math.sin(O), cI = Math.cos(I), sI = Math.sin(I);
  return eclToEq([
    (cw * cO - sw * sO * cI) * xp + (-sw * cO - cw * sO * cI) * yp,
    (cw * sO + sw * cO * cI) * xp + (-sw * sO + cw * cO * cI) * yp,
    sw * sI * xp + cw * sI * yp,
  ]);
}
const helio = (el, ms) => kepler(el, ((el[3] + el[6] * dJ2000(ms) / 36525 - el[4]) % 360) * RAD);

function moon(ms) {
  const d = dJ2000(ms);
  const L = (218.316 + 13.176396 * d) * RAD, M = (134.963 + 13.064993 * d) * RAD, F = (93.272 + 13.22935 * d) * RAD;
  const lon = L + 6.289 * RAD * Math.sin(M), lat = 5.128 * RAD * Math.sin(F), r = (385001 - 20905 * Math.cos(M)) / 299792.458 * LS;
  return eclToEq([r * Math.cos(lat) * Math.cos(lon), r * Math.cos(lat) * Math.sin(lon), r * Math.sin(lat)]);
}

// Voyager probes: fixed direction, distance from the Sun grows steadily (values from NASA's mission status)
const PROBES = { 'Voyager 1': [258.3, 12.4, 162.7, 3.57], 'Voyager 2': [302.5, -59.5, 136.0, 3.2] };
const Y2024 = Date.UTC(2024, 0, 1);

export const bodies = ['Mond', 'Sonne', 'Merkur', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptun', 'Pluto', 'Voyager 1', 'Voyager 2']
  .map(name => ({ kind: 'body', name, v: [0, 0, 0], d: 0 }));
export let sun = [0, 0, 0];           // position of the Sun as seen from Earth, in light-years

export function updateBodies(ms) {
  const earth = helio(EL.Erde, ms);
  sun = earth.map(c => -c * AU);
  for (const b of bodies) {
    if (b.name === 'Mond') b.v = moon(ms);
    else if (b.name === 'Sonne') b.v = sun;
    else if (PROBES[b.name]) {
      const [ra, dec, d0, rate] = PROBES[b.name];
      b.v = vec(ra, dec, (d0 + rate * (ms - Y2024) / (365.25 * 864e5)) * AU).map((c, i) => c + sun[i]);
    } else b.v = helio(EL[b.name], ms).map((c, i) => (c - earth[i]) * AU);
    b.d = Math.hypot(...b.v);
  }
}

// orbit outlines around the Sun (light-years, relative to the Sun)
export const orbits = Object.entries(EL).map(([name, el]) => ({
  name, a: el[0] * AU,
  pts: Array.from({ length: 121 }, (_, i) => kepler(el, i / 120 * 2 * Math.PI).map(c => c * AU)),
}));

// ---- the sky above a place ----
export const lstDeg = (ms, lon) => (((280.46061837 + 360.98564736629 * dJ2000(ms) + lon) % 360) + 360) % 360;
// -> [altitude, azimuth] in degrees, azimuth counted from north over east
export function altaz(ra, dec, lst, lat) {
  const H = (lst - ra) * RAD, d = dec * RAD, p = lat * RAD;
  const alt = Math.asin(Math.sin(d) * Math.sin(p) + Math.cos(d) * Math.cos(p) * Math.cos(H));
  const az = Math.atan2(-Math.cos(d) * Math.sin(H), Math.sin(d) * Math.cos(p) - Math.cos(d) * Math.sin(p) * Math.cos(H));
  return [alt / RAD, ((az / RAD) + 360) % 360];
}
export function sunAltitude(ms, place = NMS) {
  const s = helio(EL.Erde, ms).map(c => -c);
  const ra = Math.atan2(s[1], s[0]) / RAD, dec = Math.asin(s[2] / Math.hypot(...s)) / RAD;
  return altaz(ra, dec, lstDeg(ms, place.lon), place.lat)[0];
}
