// Signal processing: FID -> spectrum (apodization, zero filling, FFT, phasing,
// baseline correction) and helpers on the frequency-domain spectrum.
import { fft, nextPow2 } from './fft.js';

export function ppmAxis(spec) {
  const n = spec.real.length;
  const step = (spec.ppmEnd - spec.ppmStart) / (n - 1);
  return { n, step, at: (i) => spec.ppmStart + i * step, index: (ppm) => (ppm - spec.ppmStart) / step };
}

export function defaultProcessing(ds) {
  const c13 = /13C/i.test(ds.nucleus || '');
  return { lb: c13 ? 1.0 : 0.3, zf: 2, ph0: 0, ph1: 0, autoPhase: true, baseline: true, maxPoints: c13 ? 131072 : 65536 };
}

// Transform an FID into a complex spectrum with index 0 at the highest ppm.
export function transformFid(fid, frequency, opts) {
  const n0 = fid.re.length;
  const sw = fid.sw;
  let n = Math.min(nextPow2(n0) * Math.max(1, opts.zf || 1), Math.max(opts.maxPoints || 65536, nextPow2(n0)));
  const re = new Float64Array(n), im = new Float64Array(n);
  const lb = opts.lb || 0;
  // Some vendors record the opposite quadrature sense; conjugating mirrors the spectrum.
  const conj = !!fid.reverse !== !!opts.reverse ? -1 : 1;
  for (let i = 0; i < n0 && i < n; i++) {
    const w = Math.exp((-Math.PI * lb * i) / sw);
    re[i] = fid.re[i] * w;
    im[i] = conj * fid.im[i] * w;
  }
  // Bruker digital filters put the group delay at the start, where halving would hurt.
  if (!fid.grpdly) { re[0] *= 0.5; im[0] *= 0.5; }
  fft(re, im);
  // fftshift, then reverse so that the highest frequency comes first.
  const R = new Float64Array(n), I = new Float64Array(n);
  const half = n >> 1;
  for (let j = 0; j < n; j++) {
    const src = (j + half) % n; // shifted index j has frequency (j - n/2)
    const dst = n - 1 - j;
    let r = re[src], m = im[src];
    if (fid.grpdly) {
      const k = j - half;
      const a = (2 * Math.PI * fid.grpdly * k) / n;
      const c = Math.cos(a), s = Math.sin(a);
      const nr = r * c - m * s;
      m = r * s + m * c; r = nr;
    }
    R[dst] = r; I[dst] = m;
  }
  const swPpm = sw / frequency;
  const ppmStart = fid.centerPpm + ((half - 1) * swPpm) / n;
  const ppmEnd = fid.centerPpm - (half * swPpm) / n;
  return { real: R, imag: I, ppmStart, ppmEnd };
}

export function applyPhase(re, im, ph0, ph1) {
  const n = re.length;
  const R = new Float64Array(n), I = new Float64Array(n);
  const d = Math.PI / 180;
  for (let i = 0; i < n; i++) {
    const p = (ph0 + ph1 * (i / (n - 1) - 0.5)) * d;
    const c = Math.cos(p), s = Math.sin(p);
    R[i] = re[i] * c - im[i] * s;
    I[i] = re[i] * s + im[i] * c;
  }
  return { re: R, im: I };
}

// Automatic phasing: minimise the negative-intensity fraction over signal regions,
// coarse grid then Nelder-Mead refinement.
export function autoPhase(re, im) {
  const n = re.length;
  const mag = new Float64Array(n);
  let max = 0;
  for (let i = 0; i < n; i++) { mag[i] = Math.hypot(re[i], im[i]); if (mag[i] > max) max = mag[i]; }
  const sorted = Float64Array.from(mag).sort();
  const floor = sorted[Math.floor(n * 0.5)] * 4;
  const thr = Math.max(floor, max * 0.002);
  let idx = [];
  for (let i = 0; i < n; i++) if (mag[i] > thr) idx.push(i);
  if (idx.length > 6000) {
    const stride = idx.length / 6000;
    const keep = [];
    for (let k = 0; k < 6000; k++) keep.push(idx[Math.floor(k * stride)]);
    idx = keep;
  }
  if (!idx.length) return { ph0: 0, ph1: 0 };
  const fr = idx.map((i) => i / (n - 1) - 0.5);
  const rr = idx.map((i) => re[i]), ii = idx.map((i) => im[i]);
  const w = idx.map((i) => 1);
  const d = Math.PI / 180;
  const cost = (p0, p1) => {
    let neg = 0, tot = 0, sum = 0;
    for (let k = 0; k < idx.length; k++) {
      const p = (p0 + p1 * fr[k]) * d;
      const r = rr[k] * Math.cos(p) - ii[k] * Math.sin(p);
      if (r < 0) neg += r * r;
      tot += r * r;
      sum += r * w[k];
    }
    // Small reward for positive total keeps the solution from flipping by 180 degrees.
    return neg / (tot || 1) - (sum > 0 ? 0.001 : 0);
  };
  let best = { c: Infinity, p0: 0, p1: 0 };
  for (let p1 = -180; p1 <= 180; p1 += 15) {
    for (let p0 = -180; p0 < 180; p0 += 10) {
      const c = cost(p0, p1);
      if (c < best.c) best = { c, p0, p1 };
    }
  }
  const res = nelderMead((v) => cost(v[0], v[1]), [best.p0, best.p1], [5, 8], 150);
  let ph0 = ((res[0] + 540) % 360) - 180;
  return { ph0, ph1: res[1] };
}

export function nelderMead(f, x0, step, iters = 200) {
  const dim = x0.length;
  let pts = [x0.slice()];
  for (let i = 0; i < dim; i++) { const p = x0.slice(); p[i] += step[i]; pts.push(p); }
  let vals = pts.map(f);
  for (let it = 0; it < iters; it++) {
    const order = vals.map((v, i) => i).sort((a, b) => vals[a] - vals[b]);
    pts = order.map((i) => pts[i]); vals = order.map((i) => vals[i]);
    const c = new Array(dim).fill(0);
    for (let i = 0; i < dim; i++) for (let j = 0; j < dim; j++) c[j] += pts[i][j] / dim;
    const worst = pts[dim];
    const refl = c.map((v, j) => v + (v - worst[j]));
    const fr = f(refl);
    if (fr < vals[0]) {
      const exp = c.map((v, j) => v + 2 * (v - worst[j]));
      const fe = f(exp);
      if (fe < fr) { pts[dim] = exp; vals[dim] = fe; } else { pts[dim] = refl; vals[dim] = fr; }
    } else if (fr < vals[dim - 1]) {
      pts[dim] = refl; vals[dim] = fr;
    } else {
      const con = c.map((v, j) => v + 0.5 * (worst[j] - v));
      const fc = f(con);
      if (fc < vals[dim]) { pts[dim] = con; vals[dim] = fc; }
      else {
        for (let i = 1; i <= dim; i++) { pts[i] = pts[i].map((v, j) => pts[0][j] + 0.5 * (v - pts[0][j])); vals[i] = f(pts[i]); }
      }
    }
  }
  return pts[vals.indexOf(Math.min(...vals))];
}

// Robust noise estimate from point-to-point differences in the quietest regions.
export function estimateNoise(y) {
  const n = y.length;
  const bins = 64;
  const size = Math.floor(n / bins);
  const sds = [];
  for (let b = 0; b < bins; b++) {
    // Standard deviation about a straight line through the bin, so slopes do not count as noise.
    const o = b * size;
    let sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (let i = 0; i < size; i++) { const v = y[o + i]; sx += i; sy += v; sxx += i * i; sxy += i * v; }
    const slope = (size * sxy - sx * sy) / (size * sxx - sx * sx || 1);
    const icpt = (sy - slope * sx) / size;
    let ss = 0;
    for (let i = 0; i < size; i++) { const r = y[o + i] - icpt - slope * i; ss += r * r; }
    sds.push(Math.sqrt(ss / size));
  }
  sds.sort((a, c) => a - c);
  return sds[Math.floor(bins * 0.15)] || 1e-9;
}

// Polynomial baseline fitted to signal-free bins, subtracted from the spectrum.
export function baselineCorrect(y, order = 4) {
  const n = y.length;
  const bins = 256;
  const size = Math.max(4, Math.floor(n / bins));
  const sigma = estimateNoise(y);
  const xs = [], ys = [];
  for (let b = 0; b * size < n; b++) {
    const seg = Array.from(y.subarray(b * size, Math.min(n, (b + 1) * size)));
    if (seg.length < 3) continue;
    const s = seg.slice().sort((a, c) => a - c);
    const med = s[Math.floor(s.length / 2)];
    const range = s[Math.floor(s.length * 0.95)] - s[Math.floor(s.length * 0.05)];
    if (range < 8 * sigma) { xs.push(((b + 0.5) * size) / n * 2 - 1); ys.push(med); }
  }
  if (xs.length < order + 2) return { y: Float64Array.from(y), baseline: new Float64Array(n) };
  let keepX = xs, keepY = ys, coef;
  for (let iter = 0; iter < 4; iter++) {
    coef = polyfit(keepX, keepY, order);
    const res = keepY.map((v, i) => v - polyval(coef, keepX[i]));
    const sd = Math.sqrt(res.reduce((a, r) => a + r * r, 0) / res.length);
    const nx = [], ny = [];
    for (let i = 0; i < res.length; i++) if (Math.abs(res[i]) < 2.5 * sd + sigma) { nx.push(keepX[i]); ny.push(keepY[i]); }
    if (nx.length === keepX.length || nx.length < order + 2) break;
    keepX = nx; keepY = ny;
  }
  const baseline = new Float64Array(n);
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) { baseline[i] = polyval(coef, (i / n) * 2 - 1); out[i] = y[i] - baseline[i]; }
  return { y: out, baseline };
}

function polyfit(x, y, order) {
  const m = order + 1;
  const A = Array.from({ length: m }, () => new Float64Array(m + 1));
  for (let k = 0; k < x.length; k++) {
    const p = [1];
    for (let j = 1; j < 2 * m; j++) p.push(p[j - 1] * x[k]);
    for (let i = 0; i < m; i++) { for (let j = 0; j < m; j++) A[i][j] += p[i + j]; A[i][m] += p[i] * y[k]; }
  }
  for (let i = 0; i < m; i++) {
    let piv = i;
    for (let r = i + 1; r < m; r++) if (Math.abs(A[r][i]) > Math.abs(A[piv][i])) piv = r;
    [A[i], A[piv]] = [A[piv], A[i]];
    const d = A[i][i] || 1e-30;
    for (let r = 0; r < m; r++) {
      if (r === i) continue;
      const f = A[r][i] / d;
      for (let c = i; c <= m; c++) A[r][c] -= f * A[i][c];
    }
  }
  return Array.from({ length: m }, (_, i) => A[i][m] / (A[i][i] || 1e-30));
}

function polyval(c, x) {
  let v = 0;
  for (let i = c.length - 1; i >= 0; i--) v = v * x + c[i];
  return v;
}

// Full pipeline: returns a processed dataset with real/imag spectrum and the parameters used.
export function processDataset(ds, opts = {}) {
  const p = { ...defaultProcessing(ds), ...(ds.processingOptions || {}), ...opts };
  let re, im, ppmStart, ppmEnd;
  if (ds.fid && (p.fromFid || !ds.rawReal)) {
    const t = transformFid(ds.fid, ds.frequency, p);
    re = t.real; im = t.imag; ppmStart = t.ppmStart; ppmEnd = t.ppmEnd;
  } else {
    re = ds.rawReal; im = ds.rawImag; ppmStart = ds.rawPpmStart; ppmEnd = ds.rawPpmEnd;
    // Already-processed spectra keep their phase unless the user asks otherwise.
    if (!opts.forcePhase) p.autoPhase = false;
  }
  let real = re;
  if (im) {
    if (p.autoPhase) {
      const a = autoPhase(re, im);
      p.ph0 = a.ph0; p.ph1 = a.ph1;
    }
    if (p.ph0 || p.ph1) real = applyPhase(re, im, p.ph0, p.ph1).re;
  }
  real = Float64Array.from(real);
  if (p.baseline) real = baselineCorrect(real).y;
  const shift = p.referenceShift || 0;
  return { ...ds, real, ppmStart: ppmStart + shift, ppmEnd: ppmEnd + shift, processingUsed: p };
}
