// Magritek Spinsolve folders: acqu.par + data.1d (FID) and/or spectrum.1d.

export function parseAcquPar(text) {
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([^=]+?)\s*=\s*(.*)$/);
    if (!m) continue;
    const v = m[2].trim().replace(/^"|"$/g, '');
    out[m[1]] = isNaN(Number(v)) || v === '' ? v : Number(v);
  }
  return out;
}

function read1d(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const xDim = dv.getInt32(16, true);
  const rest = bytes.length - 32;
  let axis = null, off = 32;
  // Files hold either complex data only, or a float32 axis followed by complex data.
  if (rest === xDim * 4 + xDim * 8) {
    axis = new Float64Array(xDim);
    for (let i = 0; i < xDim; i++) axis[i] = dv.getFloat32(32 + i * 4, true);
    off = 32 + xDim * 4;
  } else if (rest === xDim * 16) {
    axis = new Float64Array(xDim);
    for (let i = 0; i < xDim; i++) axis[i] = dv.getFloat32(32 + i * 8, true);
    off = 32 + xDim * 8;
  }
  const re = new Float64Array(xDim), im = new Float64Array(xDim);
  for (let i = 0; i < xDim; i++) { re[i] = dv.getFloat32(off + i * 8, true); im[i] = dv.getFloat32(off + i * 8 + 4, true); }
  return { axis, re, im };
}

export function readMagritek(files, name = 'spinsolve') {
  const par = parseAcquPar(new TextDecoder('latin1').decode(files.get('acqu.par')));
  const freq = par.b1Freq || par.Frequency || 43;
  const nucleus = String(par.rxChannel || '1H').replace(/[^0-9A-Za-z]/g, '');
  const base = {
    name, title: par.Sample || par.Protocol || name, nucleus, frequency: freq, solvent: par.Solvent,
    meta: { pulseSequence: par.Protocol, scans: par.nrScans, origin: 'Magritek Spinsolve', date: par.startTime }, source: 'Magritek Spinsolve',
  };
  let out = { ...base };
  const spec = files.get('spectrum.1d');
  if (spec) {
    const { axis, re, im } = read1d(spec);
    let a = axis ? axis[0] : 12, b = axis ? axis[axis.length - 1] : -1;
    if (axis && Math.abs(a) > 500) { a /= freq; b /= freq; } // Hz axis
    const R = Float64Array.from(re), I = Float64Array.from(im);
    if (a < b) { R.reverse(); I.reverse(); [a, b] = [b, a]; }
    out = { ...out, real: R, imag: I, ppmStart: a, ppmEnd: b };
  }
  const fid = files.get('data.1d');
  if (fid) {
    const { re, im } = read1d(fid);
    const sw = (par.bandwidth || 5) * 1000;
    const low = par.lowestFrequency !== undefined ? par.lowestFrequency / freq : -sw / freq / 2 + 5;
    out.fid = { re, im, sw, centerPpm: low + sw / freq / 2, grpdly: 0, origin: 'magritek' };
  }
  if (!out.fid && !out.real) throw new Error('Spinsolve folder has no data.1d or spectrum.1d');
  return out;
}
