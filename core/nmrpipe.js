// NMRPipe 1D reader (.fid / .ft / .ft1): 512-float header followed by float32 data.

export function isNmrPipe(bytes) {
  if (bytes.length < 2048 + 16) return false;
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return Math.abs(dv.getFloat32(8, true) - 2.345) < 1e-3 || Math.abs(dv.getFloat32(8, false) - 2.345) < 1e-3;
}

export function readNmrPipe(bytes, name = 'spectrum.ft') {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const le = Math.abs(dv.getFloat32(8, true) - 2.345) < 1e-3;
  const h = (i) => dv.getFloat32(i * 4, le);
  if (Math.round(h(9)) !== 1) throw new Error('Only 1D NMRPipe files are supported for now');
  const size = Math.round(h(99));
  const complex = Math.round(h(106)) === 0;
  const sw = h(100), obs = h(119), orig = h(101), car = h(66);
  const ft = Math.round(h(220)) === 1;
  let label = '';
  for (let i = 0; i < 8; i++) { const c = bytes[16 * 4 + i]; if (c) label += String.fromCharCode(c); }
  const read = (off) => { const a = new Float64Array(size); for (let i = 0; i < size; i++) a[i] = dv.getFloat32(2048 + (off + i) * 4, le); return a; };
  const re = read(0), im = complex ? read(size) : null;
  const nucleus = label.trim() || '1H';
  const base = { name, title: name, nucleus, frequency: obs, solvent: undefined, meta: { origin: 'NMRPipe' }, source: 'NMRPipe' };
  if (!ft) return { ...base, fid: { re, im: im || new Float64Array(size), sw, centerPpm: car, grpdly: 0, origin: 'nmrpipe' } };
  // ORIG is the frequency of the last (rightmost) point.
  return { ...base, real: re, imag: im, ppmStart: (orig + (sw * (size - 1)) / size) / obs, ppmEnd: orig / obs };
}
