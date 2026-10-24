// Peak picking, integration and multiplet analysis on a processed spectrum.
import { estimateNoise, ppmAxis } from './processing.js';

export function pickPeaks(spec, opts = {}) {
  const y = spec.real;
  const n = y.length;
  const ax = ppmAxis(spec);
  const noise = estimateNoise(y);
  let max = 0;
  for (let i = 0; i < n; i++) if (y[i] > max) max = y[i];
  const snr = opts.snr ?? (/13C/.test(spec.nucleus) ? 6 : 8);
  const thr = Math.max(snr * noise, (opts.minRelative ?? 0.002) * max);
  const hzPerPt = Math.abs(ax.step) * spec.frequency;
  // Prominence window of ~1.5 Hz either side suppresses noise ripples on peak flanks.
  const win = Math.max(2, Math.round(1.5 / hzPerPt));
  const maxWin = Math.max(win, Math.round(40 / hzPerPt));
  const peaks = [];
  for (let i = 2; i < n - 2; i++) {
    const v = y[i];
    if (v < thr || v < y[i - 1] || v < y[i + 1]) continue;
    if (v === y[i - 1]) continue;
    // Broad lines (polymers, exchangeable H) have flat tops, so widen the window if needed.
    let found = false;
    for (let w = win; w <= maxWin && !found; w *= 4) {
      let lmin = v, rmin = v, ok = true;
      for (let k = 1; k <= w; k++) {
        if (i - k >= 0) { if (y[i - k] > v) { ok = false; break; } lmin = Math.min(lmin, y[i - k]); }
        if (i + k < n) { if (y[i + k] > v) { ok = false; break; } rmin = Math.min(rmin, y[i + k]); }
      }
      if (!ok) break;
      found = v - Math.max(lmin, rmin) >= Math.max(3 * noise, 0.03 * v);
    }
    if (!found) continue;
    // Parabolic interpolation for sub-point position.
    const a = y[i - 1], b = v, c = y[i + 1];
    const den = a - 2 * b + c;
    const d = den !== 0 ? (0.5 * (a - c)) / den : 0;
    // Width at half height.
    let l = i, r = i;
    while (l > 0 && y[l] > v / 2) l--;
    while (r < n - 1 && y[r] > v / 2) r++;
    peaks.push({
      index: i, ppm: ax.at(i + d), height: b - 0.25 * (a - c) * d,
      widthHz: Math.abs(r - l) * hzPerPt, snr: v / noise,
    });
  }
  return { peaks, noise, max, threshold: thr };
}

// Group peaks into integral regions/multiplets (1H) and integrate them.
export function findMultiplets(spec, peaks, noise, opts = {}) {
  const y = spec.real;
  const n = y.length;
  const ax = ppmAxis(spec);
  const freq = spec.frequency || 400;
  const hzPerPt = Math.abs(ax.step) * freq;
  const gapHz = opts.gapHz ?? 14;
  const sorted = peaks.slice().sort((a, b) => a.index - b.index);
  const groups = [];
  for (const p of sorted) {
    const g = groups[groups.length - 1];
    if (g) {
      const last = g[g.length - 1];
      const gap = (p.index - last.index) * hzPerPt;
      // Merge when lines are close or genuinely overlap (deep valley not reached).
      let minBetween = Infinity;
      for (let k = last.index; k <= p.index; k++) minBetween = Math.min(minBetween, y[k]);
      // A weak line sitting on a strong line's tail is its own signal, not part of that multiplet.
      const lopsided = gap > gapHz && Math.min(last.height, p.height) < 0.05 * Math.max(...g.map((q) => q.height), p.height);
      if (gap <= gapHz || (!lopsided && minBetween > 0.5 * Math.min(last.height, p.height) + 3 * noise)) { g.push(p); continue; }
    }
    groups.push([p]);
  }
  const regions = [];
  for (const g of groups) {
    const widest = Math.max(...g.map((p) => p.widthHz), 1);
    const top = Math.max(...g.map((p) => p.height));
    const floor = Math.max(2 * noise, 0.01 * top);
    const maxExt = (4 * widest + 25) / hzPerPt;
    const i0 = g[0].index, i1 = g[g.length - 1].index;
    let a = i0, b = i1;
    // Extend into the line tails until they fall to ~1% of the multiplet height.
    while (a > 0 && i0 - a < maxExt && y[a] > floor) a--;
    while (b < n - 1 && b - i1 < maxExt && y[b] > floor) b++;
    regions.push({ from: a, to: b, peaks: g, top });
  }
  // Merge overlapping regions.
  const merged = [];
  for (const r of regions) {
    const m = merged[merged.length - 1];
    if (m && r.from <= m.to) {
      // Overlapping tails: split at the lowest point between the two regions.
      let cut = m.to, lo = Infinity;
      const s0 = m.peaks[m.peaks.length - 1].index, s1 = r.peaks[0].index;
      for (let k = s0; k <= s1; k++) if (y[k] < lo) { lo = y[k]; cut = k; }
      if (lo < 0.3 * Math.min(m.top, r.top) || Math.min(m.top, r.top) < 0.05 * Math.max(m.top, r.top)) { m.to = cut; merged.push({ ...r, from: cut + 1, peaks: r.peaks.slice() }); continue; }
      m.to = Math.max(m.to, r.to); m.peaks.push(...r.peaks); m.top = Math.max(m.top, r.top);
    }
    else merged.push({ ...r, peaks: r.peaks.slice() });
  }
  const dppm = Math.abs(ax.step);
  for (const r of merged) {
    let s = 0;
    for (let k = r.from; k <= r.to; k++) s += y[k];
    r.area = s * dppm;
    r.ppmFrom = ax.at(r.from);
    r.ppmTo = ax.at(r.to);
  }
  return merged.map((r) => describeMultiplet(r, freq));
}

// opts.local: subtract a straight line through the region's end points (each averaged over
// ±0.01 ppm), so small signals on a sloping or offset baseline integrate correctly.
export function integrateRange(spec, ppmA, ppmB, opts = {}) {
  const ax = ppmAxis(spec);
  const y = spec.real;
  let a = Math.round(ax.index(Math.max(ppmA, ppmB))), b = Math.round(ax.index(Math.min(ppmA, ppmB)));
  a = Math.max(0, a); b = Math.min(y.length - 1, b);
  let ya = 0, yb = 0;
  if (opts.local && b > a) {
    const w = Math.max(1, Math.round(0.01 / Math.abs(ax.step)));
    const avg = (i) => { let s = 0, c = 0; for (let k = Math.max(0, i - w); k <= Math.min(y.length - 1, i + w); k++) { s += y[k]; c++; } return s / c; };
    // An edge drawn on a peak's flank would lift the baseline and make the area negative, so each
    // end takes the lowest smoothed level in its outer quarter of the region if that is lower.
    const q = Math.max(1, Math.floor((b - a) / 4));
    const low = (i0, i1) => { let m = Infinity; for (let i = i0; i <= i1; i += Math.max(1, Math.floor(w / 2))) m = Math.min(m, avg(i)); return m; };
    ya = Math.min(avg(a), low(a, a + q)); yb = Math.min(avg(b), low(b - q, b));
  }
  let s = 0;
  for (let k = a; k <= b; k++) s += y[k] - (ya + ((yb - ya) * (k - a)) / Math.max(1, b - a));
  return { from: a, to: b, area: s * Math.abs(ax.step), ppmFrom: ax.at(a), ppmTo: ax.at(b) };
}

const NAMES = { 1: 's', 2: 'd', 3: 't', 4: 'q', 5: 'p', 6: 'h', 7: 'hept' };

export function describeMultiplet(region, freq) {
  const maxH = Math.max(...region.peaks.map((p) => p.height));
  const lines = region.peaks.filter((p) => p.height > 0.12 * maxH).sort((a, b) => b.ppm - a.ppm);
  const hz = lines.map((p) => p.ppm * freq);
  const sp = [];
  for (let i = 1; i < hz.length; i++) sp.push(hz[i - 1] - hz[i]);
  const k = lines.length;
  let mult = 'm', J = [];
  const eq = (arr, tol = 0.18) => { const m = arr.reduce((a, b) => a + b, 0) / arr.length; return arr.every((v) => Math.abs(v - m) <= tol * m + 0.4); };
  const sym = () => { for (let i = 0; i < k / 2; i++) if (Math.abs(lines[i].height - lines[k - 1 - i].height) > 0.35 * Math.max(lines[i].height, lines[k - 1 - i].height)) return false; return true; };
  const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  if (k === 1) mult = lines[0].widthHz > 6 ? 'br s' : 's';
  else if (k === 2 && sp[0] < 20) { mult = 'd'; J = [sp[0]]; }
  else if (k >= 3 && k <= 7 && eq(sp) && sym() && mean(sp) < 20) {
    const inner = lines[Math.floor(k / 2)].height, outer = lines[0].height;
    if (inner > outer * 1.2) { mult = NAMES[k]; J = [mean(sp)]; }
    else if (k === 4) { mult = 'dd'; J = [sp[0] + sp[1], sp[0]].sort((a, b) => b - a); }
  } else if (k === 4 && sym() && Math.abs(sp[0] - sp[2]) < 0.6 + 0.1 * sp[0]) {
    mult = 'dd'; J = [sp[0] + sp[1], sp[0]].sort((a, b) => b - a);
  } else if (k === 6 && sym() && Math.abs(sp[0] - sp[1]) < 0.8 && Math.abs(sp[3] - sp[4]) < 0.8) {
    mult = 'dt'; J = [hz[0] - hz[3], sp[0]];
  } else if (k === 6 && sym() && Math.abs(sp[0] - sp[4]) < 0.8 && Math.abs(sp[1] - sp[3]) < 0.8 && Math.abs(sp[0] - sp[2]) < 0.8) {
    mult = 'td'; J = [hz[0] - hz[2], sp[0]];
  } else if (k === 8 && sym()) {
    mult = 'ddd'; J = [hz[0] - hz[4], hz[0] - hz[2], sp[0]].sort((a, b) => b - a);
  }
  const center = mult === 'm' || !lines.length
    ? centroid(region)
    : lines.reduce((a, p) => a + p.ppm, 0) / k;
  return {
    ppm: center, ppmFrom: region.ppmFrom, ppmTo: region.ppmTo, from: region.from, to: region.to,
    area: region.area, multiplicity: mult, J: J.map((v) => Math.round(v * 10) / 10),
    lines: lines.map((p) => p.ppm), peaks: region.peaks,
  };
}

function centroid(region) {
  const ps = region.peaks;
  const w = ps.reduce((a, p) => a + p.height, 0);
  return ps.reduce((a, p) => a + p.ppm * p.height, 0) / (w || 1);
}

// Choose a per-proton area so integrals come out as small whole numbers.
export function normaliseIntegrals(multiplets, totalH) {
  const areas = multiplets.map((m) => m.area).filter((a) => a > 0);
  if (!areas.length) return 1;
  const sum = areas.reduce((a, b) => a + b, 0);
  if (totalH) return sum / totalH;
  const cands = [];
  for (const ref of areas) {
    for (let m = 1; m <= 6; m++) {
      const unit = ref / m;
      const total = sum / unit;
      if (total > 80) continue;
      let cost = 0;
      for (const a of areas) { const x = a / unit; cost += ((x - Math.round(x)) ** 2) * (a / sum) * 10 + (Math.round(x) === 0 ? 2 * (a / sum) : 0); }
      cands.push({ cost, unit });
    }
  }
  if (!cands.length) return Math.min(...areas);
  const best = Math.min(...cands.map((c) => c.cost));
  // Several units fit (n, 2n, 3n...): take the largest one that fits nearly as well.
  return Math.max(...cands.filter((c) => c.cost <= best + 0.2).map((c) => c.unit));
}

export function applyIntegralUnit(multiplets, totalH) {
  const usable = (m) => !(m.flag && (m.flag.kind === 'solvent' || m.flag.kind === 'water')) && !m.excluded;
  const big = Math.max(...multiplets.filter(usable).map((m) => m.area), 0);
  for (const m of multiplets) m.minor = m.area < 0.025 * big;
  const u = normaliseIntegrals(multiplets.filter((m) => usable(m) && !m.minor), totalH);
  for (const m of multiplets) { m.nH = m.area / u; if (m.nH < 0.4) m.minor = true; }
  return u;
}

export function analyse(spec, opts = {}) {
  const { peaks, noise, max, threshold } = pickPeaks(spec, opts);
  const is1H = /1H/.test(spec.nucleus);
  let multiplets = [];
  if (is1H) {
    multiplets = findMultiplets(spec, peaks, noise, opts);
    applyIntegralUnit(multiplets, opts.totalH);
  } else {
    // For 13C, each line is its own signal (proton-decoupled); merge lines within 0.05 ppm.
    multiplets = peaks.map((p) => ({ ppm: p.ppm, ppmFrom: p.ppm + 0.15, ppmTo: p.ppm - 0.15, area: p.height, height: p.height, multiplicity: 's', J: [], lines: [p.ppm], peaks: [p] }));
  }
  return { peaks, noise, max, threshold, multiplets };
}
