// JEOL Delta (.jdf) reader for 1D FIDs and spectra. Header layout follows the format as
// documented by cheminfo's MIT-licensed jeolconverter.

const PREFIX = { '-8': 24, '-7': 21, '-6': 18, '-5': 15, '-4': 12, '-3': 9, '-2': 6, '-1': 3, 0: 0, 1: -3, 2: -6, 3: -9, 4: -12, 5: -15, 6: -18, 7: -21 };
const UNITS = { 13: 'Hz', 26: 'ppm', 28: 's' };

export function isJeol(bytes) {
  return bytes.length > 1300 && String.fromCharCode(...bytes.subarray(0, 8)).startsWith('JEOL.NMR');
}

export function readJeol(bytes, name = 'spectrum.jdf') {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const little = dv.getInt8(8) === 1;
  const dims = dv.getUint8(12);
  const typeByte = dv.getUint8(14);
  const float32 = typeByte >> 6 === 1;
  const format = typeByte & 63;
  if (format !== 1 || dims !== 1) throw new Error('Only 1D JEOL data is supported for now');
  const axisType = dv.getUint8(24); // 3 = complex, 1 = real
  const unitBase = UNITS[dv.getInt8(33)] || '';
  const points = dv.getUint32(176);
  const axisStart = dv.getFloat64(272), axisStop = dv.getFloat64(336);
  const baseFreq = dv.getFloat64(1064);
  const paramStart = dv.getUint32(1212);
  const dataStart = dv.getUint32(1284);
  const str = (o, n) => { let s = ''; for (let i = 0; i < n; i++) { const c = bytes[o + i]; if (c) s += String.fromCharCode(c); } return s; };
  const title = str(48, 124).trim();

  // Parameters: 16-byte block header, then 64-byte records.
  const params = {};
  const high = dv.getUint32(paramStart + 8, little);
  for (let i = 0; i <= high; i++) {
    const o = paramStart + 16 + i * 64;
    if (o + 64 > bytes.length) break;
    const prefix = PREFIX[dv.getInt8(o + 6) >> 4] || 0;
    const vtype = dv.getInt32(o + 32, little);
    const pname = str(o + 36, 28).replace(/\s+$/, '').toLowerCase();
    let value;
    if (vtype === 0) value = str(o + 16, 16).trim();
    else if (vtype === 1 || vtype === 4) value = dv.getInt32(o + 16, little);
    else if (vtype === 2) value = dv.getFloat64(o + 16, little) * Math.pow(10, prefix);
    params[pname] = value;
  }

  const read = (off, n) => {
    const a = new Float64Array(n);
    for (let i = 0; i < n; i++) a[i] = float32 ? dv.getFloat32(off + i * 4, little) : dv.getFloat64(off + i * 8, little);
    return a;
  };
  const size = float32 ? 4 : 8;
  const re = read(dataStart, points);
  const im = axisType === 3 ? read(dataStart + points * size, points) : null;
  const nucleus = String(params.x_domain || '1H').replace(/[^0-9A-Za-z]/g, '');
  const freq = params.x_freq ? params.x_freq / 1e6 : baseFreq;
  const meta = { pulseSequence: params.experiment, scans: params.scans, temperature: params.temp_get, origin: 'JEOL', date: undefined };
  const base = { name, title: params.sample_id || title || name, nucleus, frequency: freq, solvent: params.solvent, meta, source: 'JEOL Delta' };

  if (unitBase === 's') {
    const sw = params.x_sweep;
    const used = Math.min(points, params.x_points || points);
    return {
      ...base,
      fid: {
        re: re.subarray(0, used), im: (im || new Float64Array(points)).subarray(0, used), sw,
        centerPpm: params.x_offset || 0, grpdly: jeolDigitalFilter(params), origin: 'jeol',
        // JEOL records the opposite quadrature sense to Bruker.
        reverse: true,
      },
    };
  }
  let start = axisStart, stop = axisStop;
  if (unitBase === 'Hz') { start /= freq; stop /= freq; }
  const real = Float64Array.from(re), imag = im ? Float64Array.from(im) : null;
  if (start < stop) { real.reverse(); if (imag) imag.reverse(); [start, stop] = [stop, start]; }
  return { ...base, real, imag, ppmStart: start, ppmEnd: stop };
}

// Group delay (in points) of the JEOL digital filter, from its decimation orders and factors.
function jeolDigitalFilter(p) {
  const orders = String(p.orders || '').replace(/\s/g, ''), factors = String(p.factors || '').replace(/\s/g, '');
  if (!orders || !factors || !p.x_sweep || !p.x_acq_time || !p.x_points) return 0;
  const n = parseInt(orders[0], 10);
  if (!n) return 0;
  const w = (orders.length - 1) / n;
  const f = [];
  for (let i = 0; i < n; i++) f.push(parseInt(factors[i], 10));
  let s = 0;
  for (let i = 0; i < n; i++) {
    let prod = 1;
    for (let j = i; j < n; j++) prod *= f[j];
    s += (parseInt(orders.slice(1 + i * w, 1 + (i + 1) * w), 10) - 1) / prod;
  }
  s /= 2;
  return (s / p.x_sweep / p.x_acq_time) * (p.x_points - 1);
}
