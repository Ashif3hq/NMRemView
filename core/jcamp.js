// JCAMP-DX reader for 1D NMR: XYDATA, XYPOINTS, PEAK TABLE and NTUPLES
// (spectra and FIDs), with full ASDF (SQZ/DIF/DUP) decompression.

const SQZ = { '@': 0, A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8, I: 9, a: -1, b: -2, c: -3, d: -4, e: -5, f: -6, g: -7, h: -8, i: -9 };
const DIF = { '%': 0, J: 1, K: 2, L: 3, M: 4, N: 5, O: 6, P: 7, Q: 8, R: 9, j: -1, k: -2, l: -3, m: -4, n: -5, o: -6, p: -7, q: -8, r: -9 };
const DUP = { S: 1, T: 2, U: 3, V: 4, W: 5, X: 6, Y: 7, Z: 8, s: 9 };

// JCAMP labels compare ignoring case, spaces, hyphens, slashes and underscores.
export function normLabel(label) {
  return label.replace(/[\s\-\/_]/g, '').toUpperCase();
}

// Split a JCAMP text into blocks of {label, value} records, keeping $$ comments out.
export function parseRecords(text) {
  const records = [];
  const lines = text.split(/\r?\n/);
  let cur = null;
  for (const raw of lines) {
    const line = raw;
    if (line.startsWith('##')) {
      const eq = line.indexOf('=');
      if (eq < 0) continue;
      cur = { label: normLabel(line.slice(2, eq)), raw: line.slice(2, eq).trim(), value: line.slice(eq + 1) };
      records.push(cur);
    } else if (cur) {
      cur.value += '\n' + line;
    }
  }
  for (const r of records) {
    if (r.label !== 'XYDATA' && r.label !== 'DATATABLE' && r.label !== 'PEAKTABLE' && r.label !== 'XYPOINTS') {
      r.value = stripComment(r.value).trim();
    }
  }
  return records;
}

function stripComment(v) {
  // Keep multi-line values (e.g. Bruker arrays) but remove $$ comments.
  return v.split('\n').map((l) => {
    const i = l.indexOf('$$');
    return i >= 0 ? l.slice(0, i) : l;
  }).join('\n');
}

function num(v) {
  if (v === undefined || v === null) return undefined;
  const m = String(v).match(/[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?/);
  return m ? parseFloat(m[0]) : undefined;
}

function list(v) {
  return String(v).split(/[,\s]+/).filter((s) => s.length).map((s) => s.trim());
}

// Decode the body of an (X++(Y..Y)) table into y values, in file order.
export function decodeXYData(body) {
  const ys = [];
  const xs = [];
  let lastLineEndedDif = false;
  const lines = body.split('\n');
  for (let li = 0; li < lines.length; li++) {
    let line = lines[li];
    const c = line.indexOf('$$');
    if (c >= 0) line = line.slice(0, c);
    line = line.trim();
    if (!line) continue;
    const tokens = tokenize(line);
    if (!tokens.length) continue;
    const x = tokens[0].v;
    const lineVals = [];
    let prev = ys.length ? ys[ys.length - 1] : 0;
    let lastDif = null;
    let endedDif = false;
    for (let t = 1; t < tokens.length; t++) {
      const tok = tokens[t];
      if (tok.t === 'abs') {
        prev = tok.v; lineVals.push(prev); lastDif = null; endedDif = false;
      } else if (tok.t === 'dif') {
        prev = (lineVals.length ? lineVals[lineVals.length - 1] : prev) + tok.v;
        lineVals.push(prev); lastDif = tok.v; endedDif = true;
      } else if (tok.t === 'dup') {
        for (let k = 1; k < tok.v; k++) {
          if (lastDif !== null) prev = prev + lastDif;
          lineVals.push(prev);
        }
      }
    }
    // A line following one that ended in DIF form repeats the last value as a Y-check.
    if (lastLineEndedDif && lineVals.length && ys.length) lineVals.shift();
    for (const v of lineVals) ys.push(v);
    xs.push(x);
    lastLineEndedDif = endedDif;
  }
  return { ys, xs };
}

function tokenize(line) {
  const tokens = [];
  let i = 0;
  const n = line.length;
  while (i < n) {
    const ch = line[i];
    if (ch === ' ' || ch === '\t' || ch === ',' || ch === ';') { i++; continue; }
    let type, sign = 1, digits = '';
    if (ch in SQZ) { type = 'abs'; digits = String(Math.abs(SQZ[ch])); sign = SQZ[ch] < 0 ? -1 : 1; i++; }
    else if (ch in DIF) { type = 'dif'; digits = String(Math.abs(DIF[ch])); sign = DIF[ch] < 0 ? -1 : 1; i++; }
    else if (ch in DUP) { type = 'dup'; digits = String(DUP[ch]); i++; }
    else if (ch === '+' || ch === '-' || ch === '.' || (ch >= '0' && ch <= '9')) {
      type = 'abs';
      if (ch === '-') { sign = -1; i++; } else if (ch === '+') { i++; }
    } else { i++; continue; }
    while (i < n) {
      const c = line[i];
      if ((c >= '0' && c <= '9') || c === '.') { digits += c; i++; }
      else if ((c === 'E' || c === 'e') && type === 'abs' && (line[i + 1] === '+' || line[i + 1] === '-') && /\d/.test(line[i + 2] || '')) {
        digits += 'e' + line[i + 1]; i += 2;
      } else break;
    }
    if (digits === '' || digits === '.') continue;
    tokens.push({ t: type, v: type === 'dup' ? parseInt(digits, 10) : sign * parseFloat(digits) });
  }
  return tokens;
}

function decodePairs(body) {
  const nums = [];
  for (let line of body.split('\n').slice(1)) {
    const c = line.indexOf('$$');
    if (c >= 0) line = line.slice(0, c);
    for (const s of line.split(/[\s,;]+/)) if (s) { const v = parseFloat(s); if (!isNaN(v)) nums.push(v); }
  }
  const out = [];
  for (let i = 0; i + 1 < nums.length; i += 2) out.push([nums[i], nums[i + 1]]);
  return out;
}

function nucleusName(v) {
  if (!v) return undefined;
  const s = String(v).replace(/[\^<>\s]/g, '');
  const m = s.match(/(\d+)([A-Za-z]+)/);
  return m ? m[1] + m[2][0].toUpperCase() + m[2].slice(1).toLowerCase() : s;
}

// Parse one JCAMP-DX file. Returns an array of datasets (a LINK file can hold several).
export function readJcamp(text, name = 'spectrum.jdx') {
  const records = parseRecords(text);
  // Split on ##TITLE so compound files yield separate blocks; skip the LINK wrapper.
  const blocks = [];
  let cur = null;
  for (const r of records) {
    if (r.label === 'TITLE') { cur = []; blocks.push(cur); }
    if (cur) cur.push(r);
  }
  const out = [];
  for (const b of blocks) {
    const ds = readBlock(b, name);
    if (ds) out.push(ds);
  }
  if (!out.length) throw new Error('No 1D NMR data found in JCAMP file');
  return out;
}

function readBlock(records, name) {
  const h = {};
  for (const r of records) if (!(r.label in h)) h[r.label] = r.value;
  const dataType = (h.DATATYPE || '').toUpperCase();
  if (dataType.includes('2D') || dataType.includes('NMR PEAK ASSIGNMENTS')) return null;
  const obsFreq = num(h['.OBSERVEFREQUENCY']) || num(h.$SFO1) || num(h.$BF1) || num(h.$SF);
  const nucleus = nucleusName(h['.OBSERVENUCLEUS'] || h.$NUC1 || h.$T2NUCLEUS);
  const solvent = (h['.SOLVENTNAME'] || h.$SOLVENT || '').replace(/[<>]/g, '').trim() || undefined;
  const meta = {
    title: h.TITLE, origin: h.ORIGIN, owner: h.OWNER, date: h.LONGDATE || h.DATE,
    pulseSequence: h['.PULSESEQUENCE'] || (h.$PULPROG || '').replace(/[<>]/g, ''),
    scans: num(h['.AVERAGES']) || num(h.$NS), temperature: num(h.TEMPERATURE) || num(h.$TE),
    spectrometer: h.SPECTROMETERDATASYSTEM, jcampVersion: h.JCAMPDX,
  };
  const base = { name, title: (h.TITLE || name).trim(), nucleus, frequency: obsFreq, solvent, meta, source: 'JCAMP-DX' };

  if (h.NTUPLES !== undefined) return readNtuples(records, h, base);

  const xyRec = records.find((r) => r.label === 'XYDATA');
  if (xyRec) {
    const { ys } = decodeXYData(xyRec.value.split('\n').slice(1).join('\n'));
    const yf = num(h.YFACTOR) || 1;
    const npts = num(h.NPOINTS) || ys.length;
    let firstX = num(h.FIRSTX), lastX = num(h.LASTX);
    const xunits = (h.XUNITS || 'PPM').toUpperCase();
    const y = new Float64Array(Math.min(npts, ys.length));
    for (let i = 0; i < y.length; i++) y[i] = ys[i] * yf;
    let toPpm = (x) => x;
    if (xunits.includes('HZ')) toPpm = hzToPpmFactory(h, obsFreq, firstX, lastX, y.length);
    return finishSpectrum(base, y, null, toPpm(firstX), toPpm(lastX));
  }
  const ptsRec = records.find((r) => r.label === 'XYPOINTS' || r.label === 'PEAKTABLE');
  if (ptsRec) {
    const pairs = decodePairs(ptsRec.value);
    const xf = num(h.XFACTOR) || 1, yf = num(h.YFACTOR) || 1;
    const xunits = (h.XUNITS || 'PPM').toUpperCase();
    const pts = pairs.map(([x, y]) => [x * xf, y * yf]);
    const conv = xunits.includes('HZ') && obsFreq ? (x) => x / obsFreq : (x) => x;
    if (ptsRec.label === 'PEAKTABLE') {
      return { ...base, stickPeaks: pts.map(([x, y]) => ({ ppm: conv(x), height: y })) };
    }
    return resampleXY(base, pts.map(([x, y]) => [conv(x), y]));
  }
  return null;
}

function hzToPpmFactory(h, obsFreq, firstX, lastX, n) {
  const sref = h['.SHIFTREFERENCE'];
  if (sref) {
    const parts = sref.split(',').map((s) => s.trim());
    const point = parseFloat(parts[2]), ppm = parseFloat(parts[3]);
    if (!isNaN(point) && !isNaN(ppm) && obsFreq) {
      const step = (lastX - firstX) / (n - 1);
      const xref = firstX + (point - 1) * step;
      return (x) => ppm + (x - xref) / obsFreq;
    }
  }
  const offset = num(h.$OFFSET);
  if (offset !== undefined && obsFreq) return (x) => offset + (x - firstX) / obsFreq;
  return (x) => x / (obsFreq || 1);
}

function readNtuples(records, h, base) {
  // Per-variable attributes are comma-separated lists.
  const attr = {};
  const start = records.findIndex((r) => r.label === 'NTUPLES');
  for (let i = start + 1; i < records.length; i++) {
    const r = records[i];
    if (r.label === 'PAGE' || r.label === 'DATATABLE') break;
    attr[r.label] = r.value.split(',').map((s) => s.trim());
  }
  const symbols = (attr.SYMBOL || []).map((s) => s.toUpperCase());
  const iR = symbols.indexOf('R'), iI = symbols.indexOf('I'), iX = symbols.indexOf('X');
  const factor = (k) => parseFloat((attr.FACTOR || [])[k]) || 1;
  const first = (k) => parseFloat((attr.FIRST || [])[k]);
  const last = (k) => parseFloat((attr.LAST || [])[k]);
  const units = (attr.UNITS || []).map((u) => u.toUpperCase());
  const dim = parseInt((attr.VARDIM || [])[iR >= 0 ? iR : 1], 10);
  let re = null, im = null;
  for (const r of records) {
    if (r.label !== 'DATATABLE') continue;
    const head = r.value.split('\n')[0].toUpperCase();
    const body = r.value.split('\n').slice(1).join('\n');
    const { ys } = decodeXYData(body);
    const isImag = /\(I\.\.I\)/.test(head.replace(/\s/g, ''));
    const k = isImag ? iI : iR;
    const f = factor(k);
    const arr = new Float64Array(Math.min(dim || ys.length, ys.length));
    for (let i = 0; i < arr.length; i++) arr[i] = ys[i] * f;
    if (isImag) { if (!im) im = arr; } else if (!re) re = arr;
    if (re && im) break;
  }
  if (!re) return null;
  const isFid = (h.NTUPLES || '').toUpperCase().includes('FID') || (units[iX] || '').includes('SEC');
  const xFirst = first(iX), xLast = last(iX);
  if (isFid) {
    const n = re.length;
    const dt = (xLast - xFirst) / (n - 1);
    const sw = num(h.$SWH) || 1 / dt;
    const fid = {
      re, im: im || new Float64Array(n), sw,
      centerPpm: centerPpmFromHeader(h, base.frequency),
      grpdly: grpdlyFromHeader(h), origin: (h.ORIGIN || '').toLowerCase(),
      reverse: /oxford/i.test(h.ORIGIN || '') || /oxford/i.test(h.SPECTROMETERDATASYSTEM || ''),
    };
    return { ...base, fid };
  }
  const xunits = units[iX] || 'HZ';
  let toPpm = (x) => x;
  if (xunits.includes('HZ')) toPpm = hzToPpmFactory(h, base.frequency, xFirst, xLast, re.length);
  return finishSpectrum(base, re, im, toPpm(xFirst), toPpm(xLast));
}

export function centerPpmFromHeader(h, obsFreq) {
  const sf = num(h.$SF), sfo1 = num(h.$SFO1), bf1 = num(h.$BF1), o1 = num(h.$O1);
  if (sf && sfo1 && Math.abs(sfo1 - sf) < 1) return ((sfo1 - sf) / sf) * 1e6;
  if (o1 !== undefined && bf1) return o1 / bf1;
  if (sfo1 && bf1) return ((sfo1 - bf1) / bf1) * 1e6;
  if (sfo1 && obsFreq && sfo1 !== obsFreq) return ((sfo1 - obsFreq) / obsFreq) * 1e6;
  const o1p = num(h.$O1P);
  if (o1p !== undefined) return o1p;
  return 0;
}

const DSP_TABLE = {
  10: { 2: 44.75, 3: 33.5, 4: 66.625, 6: 59.083333, 8: 68.5625, 12: 60.375, 16: 69.53125, 24: 61.020833, 32: 70.015625, 48: 61.34375, 64: 70.2578125, 96: 61.505208, 128: 70.37890625, 192: 61.5859375, 256: 70.439453125, 384: 61.626302, 512: 70.4697265625, 768: 61.646484375, 1024: 70.48486328125, 1536: 61.656576, 2048: 70.492431640625 },
  11: { 2: 46, 3: 36.5, 4: 48, 6: 50.166667, 8: 53.25, 12: 69.5, 16: 72.25, 24: 70.166667, 32: 72.75, 48: 70.5, 64: 73, 96: 70.666667, 128: 72.5, 192: 71.333333, 256: 72.25, 384: 71.666667, 512: 72.125, 768: 71.833333, 1024: 72.0625, 1536: 71.916667, 2048: 72.03125 },
  12: { 2: 46, 3: 36.5, 4: 48, 6: 50.166667, 8: 53.25, 12: 69.5, 16: 71.625, 24: 70.166667, 32: 72.125, 48: 70.5, 64: 72.375, 96: 70.666667, 128: 72.5, 192: 71.333333, 256: 72.25, 384: 71.666667, 512: 72.125, 768: 71.833333, 1024: 72.0625, 1536: 71.916667, 2048: 72.03125 },
  13: { 2: 2.75, 3: 2.8333333, 4: 2.875, 6: 2.9166667, 8: 2.9375, 12: 2.9583333, 16: 2.96875, 24: 2.9791667, 32: 2.984375, 48: 2.9895833, 64: 2.9921875, 96: 2.9947917 },
};

export function grpdlyFromHeader(h) {
  const g = num(h.$GRPDLY);
  if (g !== undefined && g > 0) return g;
  const dspfvs = num(h.$DSPFVS), decim = num(h.$DECIM);
  if (dspfvs && decim && DSP_TABLE[dspfvs]) return DSP_TABLE[dspfvs][decim] || 0;
  return 0;
}

// Build a spectrum with index 0 at the highest ppm.
export function finishSpectrum(base, real, imag, ppmFirst, ppmLast) {
  if (ppmFirst < ppmLast) {
    real = Float64Array.from(real).reverse();
    if (imag) imag = Float64Array.from(imag).reverse();
    [ppmFirst, ppmLast] = [ppmLast, ppmFirst];
  }
  return { ...base, real: Float64Array.from(real), imag: imag ? Float64Array.from(imag) : null, ppmStart: ppmFirst, ppmEnd: ppmLast };
}

function resampleXY(base, pts) {
  pts.sort((a, b) => b[0] - a[0]);
  const n = pts.length;
  const y = new Float64Array(n);
  for (let i = 0; i < n; i++) y[i] = pts[i][1];
  return finishSpectrum(base, y, null, pts[0][0], pts[n - 1][0]);
}

export { num as parseNumber, list as parseList };
