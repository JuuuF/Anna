// When was a photo taken? First the camera's own record inside the file (EXIF), then the file name:
// phones and messengers write the date into the name in a handful of well-known ways.
// Everything is checked against her lifetime, so that counters and phone numbers are not mistaken for dates.

const pad = n => String(n).padStart(2, '0');
const stamp = d => ({ date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, time: `${pad(d.getHours())}:${pad(d.getMinutes())}` });

// a real calendar day (no 31 February) -> local Date, else null
function day(y, m, d, hh = 12, mm = 0, ss = 0) {
  const t = new Date(+y, +m - 1, +d, +hh, +mm, +ss);
  return t.getFullYear() === +y && t.getMonth() === +m - 1 && t.getDate() === +d && +hh < 24 && +mm < 60 ? t : null;
}

/**
 * @param {string} name  file name, e.g. "IMG-20190812-WA0003.jpg" or "WhatsApp Image 2019-08-12 at 14.30.25.jpeg"
 * @param {number} from  earliest plausible moment (ms) – her birth
 * @param {number} to    latest plausible moment (ms) – her last light
 * @returns {{date: string, time: string}|null}  time is '' when the name only holds a day
 */
export function timeFromName(name, from, to) {
  const base = name.replace(/\.[a-z0-9]{2,5}$/i, '');
  const ok = t => t && t.getTime() >= from - 864e5 && t.getTime() <= to + 864e5;
  const found = [];                      // [priority, Date, has a time]
  const add = (prio, t, timed) => { if (ok(t)) found.push([prio + (timed ? 0.5 : 0), t, timed]); };
  const utc = /^PXL_/i.test(base);       // Google Pixel writes universal time into the name
  const local = (y, m, d, hh, mm, ss) => (utc && hh != null ? (day(y, m, d) && new Date(Date.UTC(+y, +m - 1, +d, +hh, +mm, +(ss || 0)))) : day(y, m, d, hh ?? 12, mm ?? 0, ss ?? 0));
  const clock = (h, ap) => (ap ? (+h % 12) + (/p/i.test(ap) ? 12 : 0) : +h);
  let m;

  // 20190812_143025 · IMG_20190812_143025 · PXL_20210812_143025123 · 20190812143025 · IMG-20190812-WA0003 (day only)
  const compact = /(?<!\d)((?:19|20)\d{2})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])(?:[ _T-]?([01]\d|2[0-3])([0-5]\d)([0-5]\d)\d{0,3})?(?!\d)/g;
  while ((m = compact.exec(base))) add(4, local(m[1], m[2], m[3], m[4], m[5], m[6]), m[4] != null);

  // 2019-08-12 at 14.30.25 · 2019-08-12 um 14.30.25 · 2019-08-12_14-30-25 · 2019.08.12 · Screenshot_2019-08-12-14-30-25 · … at 2.30.25 PM
  const iso = /(?<!\d)((?:19|20)\d{2})[-._ ](0?[1-9]|1[0-2])[-._ ](0?[1-9]|[12]\d|3[01])(?!\d)(?:[ _T,-]*(?:at|um)?[ _-]*(\d{1,2})[.:h-](\d{2})(?:[.:-](\d{2}))?(?!\d)\s*([ap])?\.?m?\.?)?/gi;
  while ((m = iso.exec(base))) {
    const timed = m[4] != null && clock(m[4], m[7]) < 24 && +m[5] < 60;
    add(3, timed ? local(m[1], m[2], m[3], clock(m[4], m[7]), m[5], m[6]) : day(m[1], m[2], m[3]), timed);
  }

  // 12.08.2019 · 12-08-2019 14.30 · 12_8_2019 (day first, the German way)
  const german = /(?<!\d)(0?[1-9]|[12]\d|3[01])[-._ ](0?[1-9]|1[0-2])[-._ ]((?:19|20)\d{2})(?!\d)(?:[ _T,-]*(?:um)?[ _-]*([01]?\d|2[0-3])[.:h-]([0-5]\d)(?:[.:-]([0-5]\d))?(?!\d))?/gi;
  while ((m = german.exec(base))) add(2, day(m[3], m[2], m[1], m[4] ?? 12, m[5] ?? 0, m[6] ?? 0), m[4] != null);

  // FB_IMG_1565620225000 · 1565620225.jpg: seconds or milliseconds since 1970
  const epoch = /(?<!\d)(\d{13}|\d{10})(?!\d)/g;
  while ((m = epoch.exec(base))) add(1, new Date(m[1].length === 13 ? +m[1] : +m[1] * 1000), true);

  if (!found.length) return null;
  found.sort((a, b) => b[0] - a[0]);
  const [, t, timed] = found[0], s = stamp(t);
  return { date: s.date, time: timed ? s.time : '' };
}

// The camera's own record: EXIF "DateTimeOriginal" (or "DateTime") from the start of a JPEG file.
export function timeFromExif(bytes, from, to) {
  try {
    const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (v.getUint16(0) !== 0xffd8) return null;
    let p = 2;
    while (p + 4 < v.byteLength) {                         // walk the segments until the EXIF block
      const marker = v.getUint16(p), size = v.getUint16(p + 2);
      if (marker === 0xffe1 && v.getUint32(p + 4) === 0x45786966) {
        const tiff = p + 10, le = v.getUint16(tiff) === 0x4949, u16 = o => v.getUint16(o, le), u32 = o => v.getUint32(o, le);
        const read = (dir, tag) => {
          for (let i = 0, n = u16(dir); i < n; i++) { const e = dir + 2 + i * 12; if (u16(e) === tag) return e; }
          return 0;
        };
        const text = e => { let s = ''; for (let i = 0, o = tiff + u32(e + 8); i < 19; i++) s += String.fromCharCode(v.getUint8(o + i)); return s; };
        const ifd0 = tiff + u32(tiff + 4), sub = read(ifd0, 0x8769), exif = sub ? tiff + u32(sub + 8) : 0;
        const entry = (exif && (read(exif, 0x9003) || read(exif, 0x9004))) || read(ifd0, 0x0132);
        const m = entry && /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/.exec(text(entry));
        const t = m && day(m[1], m[2], m[3], m[4], m[5], m[6]);
        return t && t.getTime() >= from - 864e5 && t.getTime() <= to + 864e5 ? stamp(t) : null;
      }
      if ((marker & 0xff00) !== 0xff00 || marker === 0xffda) break;
      p += 2 + size;
    }
  } catch { /* not a readable JPEG – no harm done */ }
  return null;
}

// for a chosen file: the camera's record if there is one, otherwise the name
export async function photoTime(file, from, to) {
  const head = new Uint8Array(await file.slice(0, 262144).arrayBuffer());
  const exif = timeFromExif(head, from, to);
  if (exif) return { ...exif, source: 'den Aufnahmedaten der Kamera' };
  const named = timeFromName(file.name, from, to);
  return named && { ...named, source: 'dem Dateinamen' };
}
