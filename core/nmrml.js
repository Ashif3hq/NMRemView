// nmrML (open XML standard) reader: FID or 1D spectrum stored as base64, optionally zlib-compressed.
import { inflateZlib } from './inflate.js';

function b64(s) {
  const T = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const m = new Uint8Array(128);
  for (let i = 0; i < 64; i++) m[T.charCodeAt(i)] = i;
  s = s.replace(/[^A-Za-z0-9+/]/g, '');
  const out = new Uint8Array(Math.floor((s.length * 3) / 4));
  let o = 0;
  for (let i = 0; i < s.length; i += 4) {
    const n = (m[s.charCodeAt(i)] << 18) | (m[s.charCodeAt(i + 1)] << 12) | (m[s.charCodeAt(i + 2)] << 6) | m[s.charCodeAt(i + 3)];
    out[o++] = (n >> 16) & 255;
    if (i + 2 < s.length) out[o++] = (n >> 8) & 255;
    if (i + 3 < s.length) out[o++] = n & 255;
  }
  return out.subarray(0, o);
}

function attr(tag, name) {
  const m = tag && tag.match(new RegExp(name + '="([^"]*)"'));
  return m ? m[1] : undefined;
}

function binary(xml, element) {
  const m = xml.match(new RegExp('<' + element + '([^>]*)>([^<]*)</' + element + '>'));
  if (!m) return null;
  let bytes = b64(m[2]);
  if (attr(m[1], 'compressed') === 'true') bytes = inflateZlib(bytes);
  const fmt = (attr(m[1], 'byteFormat') || 'complex128').toLowerCase();
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const size = /64/.test(fmt) && !/128/.test(fmt) ? 4 : 8;
  const isInt = /int/.test(fmt);
  const n = Math.floor(bytes.length / size);
  const vals = new Float64Array(n);
  for (let i = 0; i < n; i++) vals[i] = isInt ? (size === 8 ? Number(dv.getBigInt64(i * 8, true)) : dv.getInt32(i * 4, true)) : size === 8 ? dv.getFloat64(i * 8, true) : dv.getFloat32(i * 4, true);
  return vals;
}

const value = (xml, el) => { const m = xml.match(new RegExp('<' + el + '[^>]*value="([^"]*)"')); return m ? parseFloat(m[1]) : undefined; };

export function readNmrML(text, name = 'spectrum.nmrML') {
  const nuc = (text.match(/<acquisitionNucleus[^>]*name="([^"]*)"/) || [])[1] || '1H';
  const freq = value(text, 'effectiveExcitationField') || value(text, 'irradiationFrequency') / 1e6 || 400;
  const sw = value(text, 'sweepWidth');
  const solvent = (text.match(/<fieldFrequencyLock[^>]*fieldFrequencyLockName="([^"]*)"/) || [])[1];
  const base = { name, title: name, nucleus: nuc.replace(/[^0-9A-Za-z]/g, ''), frequency: freq, solvent, meta: { origin: 'nmrML' }, source: 'nmrML' };
  const spec = binary(text, 'spectrumDataArray');
  if (spec) {
    const x = text.match(/<xAxis[^>]*>/);
    const start = parseFloat(attr(x && x[0], 'startValue')), end = parseFloat(attr(x && x[0], 'endValue'));
    const n = spec.length / 2;
    const re = new Float64Array(n), im = new Float64Array(n);
    for (let i = 0; i < n; i++) { re[i] = spec[2 * i]; im[i] = spec[2 * i + 1]; }
    let a = isNaN(start) ? 12 : start, b = isNaN(end) ? -1 : end;
    if (a < b) { re.reverse(); im.reverse(); [a, b] = [b, a]; }
    return { ...base, real: re, imag: im, ppmStart: a, ppmEnd: b };
  }
  const fid = binary(text, 'fidData');
  if (!fid) throw new Error('nmrML file has no FID or spectrum data');
  const n = fid.length / 2;
  const re = new Float64Array(n), im = new Float64Array(n);
  for (let i = 0; i < n; i++) { re[i] = fid[2 * i]; im[i] = fid[2 * i + 1]; }
  const offset = value(text, 'irradiationFrequencyOffset');
  return { ...base, fid: { re, im, sw: sw || 1, centerPpm: offset !== undefined ? offset / freq : 4.7, grpdly: 0, origin: 'nmrml' } };
}
