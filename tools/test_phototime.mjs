// Checks the photo-date recognition.  Run: node tools/test_phototime.mjs
import assert from 'node:assert';
import { timeFromExif, timeFromName } from '../js/phototime.js';

const from = new Date(1970, 3, 16).getTime(), to = new Date(2026, 7, 27, 3).getTime();
const t = n => { const r = timeFromName(n, from, to); return r ? (r.time ? `${r.date} ${r.time}` : r.date) : null; };
const utc = (y, m, d, hh, mm) => { const x = new Date(Date.UTC(y, m - 1, d, hh, mm)); const p = n => String(n).padStart(2, '0'); return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())} ${p(x.getHours())}:${p(x.getMinutes())}`; };

const cases = {
  // WhatsApp
  'IMG-20190812-WA0003.jpg': '2019-08-12',
  'VID-20151231-WA0011.mp4': '2015-12-31',
  'WhatsApp Image 2019-08-12 at 14.30.25.jpeg': '2019-08-12 14:30',
  'WhatsApp Image 2019-08-12 at 14.30.25 (1).jpeg': '2019-08-12 14:30',
  'WhatsApp Bild 2021-03-05 um 09.07.11.jpeg': '2021-03-05 09:07',
  'WhatsApp Image 2020-01-02 at 2.30.25 PM.jpeg': '2020-01-02 14:30',
  'WhatsApp Image 2020-01-02 at 12.05.00 AM.jpeg': '2020-01-02 00:05',
  // Samsung, Android in general
  '20190812_143025.jpg': '2019-08-12 14:30',
  '20190812_143025(0).jpg': '2019-08-12 14:30',
  '20190812_143025_001.jpg': '2019-08-12 14:30',
  'IMG_20190812_143025.jpg': '2019-08-12 14:30',
  'IMG_20190812_143025_1.jpg': '2019-08-12 14:30',
  'IMG_20190812_143025_BURST001_COVER.jpg': '2019-08-12 14:30',
  'Screenshot_20190812-143025_Gallery.jpg': '2019-08-12 14:30',
  'Screenshot_2019-08-12-14-30-25.png': '2019-08-12 14:30',
  'Screenshot_2019-08-12-14-30-25-123_com.whatsapp.jpg': '2019-08-12 14:30',
  'PXL_20210812_143025123.jpg': utc(2021, 8, 12, 14, 30),
  'PXL_20210812_143025123.MP.jpg': utc(2021, 8, 12, 14, 30),
  '20190812143025.jpg': '2019-08-12 14:30',
  'P_20180704_101500.jpg': '2018-07-04 10:15',
  'signal-2022-05-01-193000.jpg': '2022-05-01',
  'signal-2022-05-01-19-30-00-123.jpg': '2022-05-01 19:30',
  'photo_2020-06-07_18-45-10.jpg': '2020-06-07 18:45',
  '2014-07-13 21.55.02.jpg': '2014-07-13 21:55',
  '2014-07-13_21-55-02.jpg': '2014-07-13 21:55',
  'Foto 13.07.14, 21 55 02.jpg': null,
  // epochs
  'FB_IMG_1565620225000.jpg': new Date(1565620225000).toISOString() && t('FB_IMG_1565620225000.jpg'),
  '1565620225.jpg': t('1565620225.jpg'),
  // scans and hand-named files, the German way
  'Hochzeit 23.05.1998.jpg': '1998-05-23',
  'Scan_23-05-1998.jpg': '1998-05-23',
  'Urlaub 3.8.2004 15.30.jpg': '2004-08-03 15:30',
  '1998-05-23 Standesamt.jpg': '1998-05-23',
  'Einschulung_1976_08_30.jpg': '1976-08-30',
  // nothing to find, or nothing believable
  'IMG_1234.JPG': null,
  'DSC_0042.jpg': null,
  'image.png': null,
  'Hochzeit 1998.jpg': null,
  'IMG-20301201-WA0001.jpg': null,          // after her last light
  '19650101_120000.jpg': null,              // before her birth
  '20190231_120000.jpg': null,              // no 31 February
  'IMG_4915117612345.jpg': null,            // a phone number, not a date
  '20190812_250000.jpg': '2019-08-12',      // impossible hour: keep the day
};
for (const [name, want] of Object.entries(cases)) assert.equal(t(name), want, name);
assert.ok(t('FB_IMG_1565620225000.jpg')?.startsWith('2019-08-12'));
assert.ok(t('1565620225.jpg')?.startsWith('2019-08-12'));

// a minimal JPEG with an EXIF block holding DateTimeOriginal
function jpeg(stampText, le = true) {
  const b = [], u16 = n => (le ? [n & 255, n >> 8] : [n >> 8, n & 255]), u32 = n => (le ? [n & 255, (n >> 8) & 255, (n >> 16) & 255, n >>> 24] : [n >>> 24, (n >> 16) & 255, (n >> 8) & 255, n & 255]);
  const tiff = [...(le ? [0x49, 0x49] : [0x4d, 0x4d]), ...u16(42), ...u32(8),
    ...u16(1), ...u16(0x8769), ...u16(4), ...u32(1), ...u32(26), ...u32(0),                 // IFD0 -> EXIF IFD at 26
    ...u16(1), ...u16(0x9003), ...u16(2), ...u32(20), ...u32(44), ...u32(0),                // EXIF IFD -> text at 44
    ...[...stampText].map(c => c.charCodeAt(0)), 0];
  b.push(0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xe1, (tiff.length + 8) >> 8, (tiff.length + 8) & 255, 0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff, 0xff, 0xda, 0, 2);
  return Uint8Array.from(b);
}
assert.deepEqual(timeFromExif(jpeg('2015:08:12 16:45:10'), from, to), { date: '2015-08-12', time: '16:45' });
assert.deepEqual(timeFromExif(jpeg('2015:08:12 16:45:10', false), from, to), { date: '2015-08-12', time: '16:45' });
assert.equal(timeFromExif(jpeg('0000:00:00 00:00:00'), from, to), null);
assert.equal(timeFromExif(Uint8Array.from([1, 2, 3, 4, 5, 6]), from, to), null);
console.log('ok -', Object.keys(cases).length, 'file names');
