// Bruker TopSpin/XWIN-NMR experiment reader (acqus + fid, procs + 1r/1i).
import { parseRecords, parseNumber as num, grpdlyFromHeader } from './jcamp.js';

export function parseBrukerParams(text) {
  const out = {};
  for (const r of parseRecords(text)) {
    let v = r.value;
    if (/^\(\s*0\s*\.\.\s*\d+\s*\)/.test(v)) {
      // Array parameter: "(0..63)" followed by values on the next lines.
      v = v.replace(/^\([^)]*\)/, '').trim().split(/\s+/);
    } else if (v.startsWith('<')) {
      v = v.replace(/^<|>$/g, '');
    }
    out[r.label] = v;
  }
  return out;
}

function readInts(buf, bigEndian, float64) {
  const dv = new DataView(buf instanceof ArrayBuffer ? buf : buf.buffer, buf.byteOffset || 0, buf.byteLength);
  const size = float64 ? 8 : 4;
  const n = Math.floor(dv.byteLength / size);
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) out[i] = float64 ? dv.getFloat64(i * 8, !bigEndian) : dv.getInt32(i * 4, !bigEndian);
  return out;
}

const dec = (b) => new TextDecoder('latin1').decode(b);

// files: Map of relative path -> Uint8Array for one experiment folder (paths relative to the
// experiment directory, e.g. "acqus", "fid", "pdata/1/procs").
export function readBruker(files, name = 'bruker') {
  const get = (p) => files.get(p);
  const acqusBuf = get('acqus');
  if (!acqusBuf) throw new Error('Bruker folder has no acqus file');
  const acqus = parseBrukerParams(dec(acqusBuf));
  const nucleus = (acqus.$NUC1 || '1H').replace(/[<>]/g, '');
  const solvent = acqus.$SOLVENT;
  const meta = {
    pulseSequence: acqus.$PULPROG, scans: num(acqus.$NS), temperature: num(acqus.$TE),
    date: acqus.$DATE ? new Date(num(acqus.$DATE) * 1000).toISOString() : undefined,
    origin: acqus.ORIGIN, owner: acqus.OWNER, instrument: acqus.$INSTRUM,
  };
  const title = get('pdata/1/title') ? dec(get('pdata/1/title')).trim() : name;
  const base = { name, title: title || name, nucleus, solvent, frequency: num(acqus.$SFO1), meta, source: 'Bruker' };

  // Raw FID
  let fid = null;
  const fidBuf = get('fid');
  if (fidBuf) {
    const td = num(acqus.$TD);
    const big = num(acqus.$BYTORDA) === 1;
    const raw = readInts(fidBuf, big, num(acqus.$DTYPA) === 2);
    // TD counts real+imag points; files are padded to 256-value blocks.
    const n = Math.min(Math.floor((td || raw.length) / 2), Math.floor(raw.length / 2));
    const scale = Math.pow(2, num(acqus.$NC) || 0);
    const re = new Float64Array(n), im = new Float64Array(n);
    for (let i = 0; i < n; i++) { re[i] = raw[2 * i] * scale; im[i] = raw[2 * i + 1] * scale; }
    const sfo1 = num(acqus.$SFO1), bf1 = num(acqus.$BF1);
    const procsBuf0 = get('pdata/1/procs');
    const sf = procsBuf0 ? num(parseBrukerParams(dec(procsBuf0)).$SF) : undefined;
    const ref = sf || bf1;
    fid = {
      re, im, sw: num(acqus.$SWH), grpdly: grpdlyFromHeader(acqus),
      centerPpm: ((sfo1 - ref) / ref) * 1e6, origin: 'bruker',
    };
  }

  // Processed spectrum
  let spectrum = null;
  const procsBuf = get('pdata/1/procs');
  const rBuf = get('pdata/1/1r');
  if (procsBuf && rBuf) {
    const procs = parseBrukerParams(dec(procsBuf));
    const big = num(procs.$BYTORDP) === 1;
    const scale = Math.pow(2, num(procs.$NCPROC) || 0);
    const real = readInts(rBuf, big, num(procs.$DTYPP) === 2).map((v) => v * scale);
    const iBuf = get('pdata/1/1i');
    const imag = iBuf ? readInts(iBuf, big, num(procs.$DTYPP) === 2).map((v) => v * scale) : null;
    const si = real.length;
    const sf = num(procs.$SF);
    const offset = num(procs.$OFFSET);
    const swp = num(procs.$SWP);
    const ppmEnd = offset - (swp / sf) * ((si - 1) / si);
    spectrum = { real, imag, ppmStart: offset, ppmEnd };
    base.frequency = sf || base.frequency;
    base.processing = { ph0: num(procs.$PHC0), ph1: num(procs.$PHC1), lb: num(procs.$LB) };
  }
  if (!fid && !spectrum) throw new Error('Bruker folder has neither fid nor pdata/1/1r');
  return { ...base, fid, ...(spectrum || {}) };
}
