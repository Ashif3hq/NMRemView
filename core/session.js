// A Session wraps one dataset and its processing state, caching the expensive FFT so
// phase/baseline/threshold changes are interactive. Used by both the web and macOS apps.
import { transformFid, autoPhase, applyPhase, baselineCorrect, defaultProcessing, ppmAxis } from './processing.js';
import { analyse, describeMultiplet, applyIntegralUnit } from './analysis.js';
import { suggest, journalReport, formulaInfo } from './assign.js';
import { findSolvent } from './database.js';

export function createSession(ds) {
  const fromFid = !!ds.fid && !ds.rawReal;
  const params = {
    ...defaultProcessing(ds),
    fromFid,
    autoPhase: fromFid,
    reverse: false,
    referenceShift: 0,
    snr: /13C/.test(ds.nucleus) ? 6 : 8,
    formula: '',
    totalH: null,
    manualRegions: [],
    // Raw FIDs from vendors whose headers are not referenced get referenced to the solvent.
    autoReference: !!ds.fid && ['jeol', 'nmrpipe', 'magritek', 'nmrml'].includes(ds.fid.origin),
    excluded: [],
  };
  let fftCache = null;
  let phased = null;

  function complexSpectrum() {
    if (params.fromFid && ds.fid) {
      const key = [params.lb, params.zf, params.reverse].join('|');
      if (!fftCache || fftCache.key !== key) {
        fftCache = { key, ...transformFid(ds.fid, ds.frequency, params) };
        phased = null;
      }
      return fftCache;
    }
    return { real: ds.rawReal, imag: ds.rawImag, ppmStart: ds.rawPpmStart, ppmEnd: ds.rawPpmEnd };
  }

  function run() {
    const c = complexSpectrum();
    if (params.autoPhase && c.imag) {
      const a = autoPhase(c.real, c.imag);
      params.ph0 = Math.round(a.ph0 * 10) / 10;
      params.ph1 = Math.round(a.ph1 * 10) / 10;
      params.autoPhase = false;
    }
    let real = c.real;
    if (c.imag && (params.ph0 || params.ph1)) real = applyPhase(c.real, c.imag, params.ph0, params.ph1).re;
    real = Float64Array.from(real);
    let baseline = null;
    if (params.baseline) { const b = baselineCorrect(real); real = b.y; baseline = b.baseline; }
    const spec = {
      ...ds, real, ppmStart: c.ppmStart + params.referenceShift, ppmEnd: c.ppmEnd + params.referenceShift,
    };
    const fi = params.formula ? formulaInfo(params.formula) : null;
    const totalH = params.totalH || (fi && fi.totalH) || null;
    let a = analyse(spec, { snr: params.snr });
    if (params.autoReference) {
      params.autoReference = false;
      const d = solventOffset(spec, a.peaks);
      if (d) {
        params.referenceShift += d;
        spec.ppmStart += d; spec.ppmEnd += d;
        a = analyse(spec, { snr: params.snr });
      }
    }
    let signals = a.multiplets;
    // Manual integral regions replace any automatic regions they overlap.
    if (params.manualRegions.length && /1H/.test(spec.nucleus)) {
      const ax = ppmAxis(spec);
      for (const [p1, p2] of params.manualRegions) {
        const hi = Math.max(p1, p2), lo = Math.min(p1, p2);
        signals = signals.filter((m) => m.ppmTo > hi || m.ppmFrom < lo);
        const from = Math.max(0, Math.round(ax.index(hi))), to = Math.min(spec.real.length - 1, Math.round(ax.index(lo)));
        let s = 0;
        for (let k = from; k <= to; k++) s += spec.real[k];
        const peaks = a.peaks.filter((p) => p.ppm <= hi && p.ppm >= lo);
        if (!peaks.length) peaks.push({ ppm: (hi + lo) / 2, height: 0, widthHz: 0, index: Math.round((from + to) / 2) });
        const m = describeMultiplet({ from, to, peaks, area: s * Math.abs(ax.step), ppmFrom: hi, ppmTo: lo }, spec.frequency);
        m.manual = true;
        signals.push(m);
      }
      signals.sort((x, y) => y.ppm - x.ppm);
    }
    for (const m of signals) m.excluded = params.excluded.some((e) => Math.abs(e - m.ppm) < 0.005);
    a.multiplets = signals;
    if (/1H/.test(spec.nucleus)) applyIntegralUnit(signals, totalH);
    const sug = suggest(spec, a, { totalH, formula: fi });
    const visible = signals.filter((m) => !m.excluded);
    return {
      spectrum: spec, baseline, analysis: a, suggestions: sug, formula: fi,
      report: journalReport(spec, visible), params: { ...params },
    };
  }

  return {
    dataset: ds,
    params,
    set(p) {
      Object.assign(params, p);
      return run();
    },
    run,
  };
}

// Offset that moves the solvent residual signal onto its literature shift (0 if not found).
function solventOffset(spec, peaks) {
  const sol = findSolvent(spec.solvent);
  const is13 = /13C/.test(spec.nucleus);
  const target = sol && (is13 ? sol.c[0] : /1H/.test(spec.nucleus) ? sol.h[0] : undefined);
  if (target === undefined) return 0;
  const win = is13 ? 1.5 : 0.12;
  const near = peaks.filter((p) => Math.abs(p.ppm - target) < win);
  if (!near.length) return 0;
  // Use the tallest line and its multiplet partners (CDCl3 triplet, DMSO septet, CD3OD septet).
  const top = near.reduce((b, p) => (p.height > b.height ? p : b));
  const span = is13 ? 0.8 : 0.03;
  const group = near.filter((p) => Math.abs(p.ppm - top.ppm) < span && p.height > top.height * 0.1);
  const centre = (Math.max(...group.map((p) => p.ppm)) + Math.min(...group.map((p) => p.ppm))) / 2;
  return target - centre;
}
