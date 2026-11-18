// Stacked and overlaid spectra: shared layout maths and a print-ready SVG, so the web app,
// the Mac app and exported figures place every trace the same way.

/** Trace colours on a white page (also used by the Mac app). Index 0 is the usual trace blue. */
export const STACK_COLORS = ['#18306b', '#c4561b', '#0e7c86', '#b0287a', '#3b7d23', '#6a3ea1', '#8a6d00', '#5d6b79'];

/**
 * Vertical placement of `n` traces in a plot `plotH` high (screen y grows downwards).
 * mode 'overlay': every trace sits on the same baseline and uses the full height.
 * mode 'stack': trace 0 at the bottom, each next one raised by `step`; `gap` 0..1 is how far
 * apart they are (0 = on top of each other, 1 = no overlap at all).
 * Returns { step, height, offsets[] } in the same units as plotH.
 */
export function stackLayout(n, plotH, mode = 'stack', gap = 0.6) {
  if (mode !== 'stack' || n < 2) return { step: 0, height: plotH, offsets: Array(Math.max(n, 0)).fill(0) };
  const g = Math.min(1, Math.max(0, gap));
  const step = (g * plotH) / n;
  return { step, height: plotH - (n - 1) * step, offsets: Array.from({ length: n }, (_, k) => k * step) };
}

/** Solvent-residual ranges of a processed result, so a huge solvent line doesn't set the scale. */
export function solventRanges(r) {
  return (r.analysis.multiplets || []).filter((m) => m.flag && m.flag.kind === 'solvent').map((m) => [m.ppmFrom, m.ppmTo]);
}

/** Tallest point of a spectrum between hi and lo ppm, ignoring the given [from, to] ranges. */
export function visibleMax(spec, hi, lo, skip = []) {
  const y = spec.real, n = y.length, step = (spec.ppmEnd - spec.ppmStart) / (n - 1);
  const i0 = Math.max(0, Math.floor((hi - spec.ppmStart) / step)), i1 = Math.min(n - 1, Math.ceil((lo - spec.ppmStart) / step));
  let m = 0, any = 0;
  for (let i = i0; i <= i1; i++) {
    if (y[i] > any) any = y[i];
    if (y[i] <= m) continue;
    const p = spec.ppmStart + i * step;
    if (!skip.some(([a, b]) => p <= a && p >= b)) m = y[i];
  }
  return m || any || 1;
}

/**
 * Scale factor (intensity that fills one trace height) for each result in the window.
 * scale 'each': every spectrum normalised to its own tallest visible signal.
 * scale 'common': all share the tallest one, so relative intensities stay comparable.
 */
export function traceScales(results, hi, lo, scale = 'each') {
  const m = results.map((r) => visibleMax(r.spectrum, hi, lo, solventRanges(r)));
  if (scale !== 'common') return m;
  const top = Math.max(...m, 1e-30);
  return m.map(() => top);
}

/** Short name for a trace: title, else file name. */
export function traceName(r) {
  const s = r.spectrum;
  return s.title || s.name || 'spectrum';
}

const xmlEsc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/**
 * Overlaid or stacked spectra as SVG for papers, slides and SI.
 * opts: hi, lo (ppm window, default the union of populated regions), mode ('stack' | 'overlay'),
 * gap (0..1), scale ('each' | 'common'), yScale, width, height, names (array), colors (array), title.
 */
export function stackSVG(results, opts = {}) {
  const list = results.filter(Boolean);
  if (!list.length) return '';
  const W = opts.width || 1200, mode = opts.mode === 'overlay' ? 'overlay' : 'stack';
  const H = opts.height || (mode === 'stack' ? Math.max(600, 260 + 90 * list.length) : 600);
  const c13 = /13C/.test(list[0].spectrum.nucleus);
  let hi = opts.hi, lo = opts.lo;
  if (hi == null || lo == null) {
    const pk = list.flatMap((r) => r.analysis.peaks.map((p) => p.ppm));
    const a = Math.max(...list.map((r) => r.spectrum.ppmStart)), b = Math.min(...list.map((r) => r.spectrum.ppmEnd));
    hi = pk.length ? Math.min(a, Math.max(...pk) + (c13 ? 10 : 0.5)) : a;
    lo = pk.length ? Math.max(b, Math.min(...pk) - (c13 ? 5 : 0.3)) : b;
  }
  const names = opts.names || list.map(traceName);
  const colors = opts.colors || list.map((_, k) => STACK_COLORS[k % STACK_COLORS.length]);
  const nameW = mode === 'stack' ? Math.min(260, Math.max(...names.map((t) => t.length)) * 6.6 + 20) : 0;
  const L = 30, R = W - 30 - nameW, top = opts.title === '' ? 24 : 44, axisY = H - 50;
  const plotH = axisY - 6 - top;
  const lay = stackLayout(list.length, plotH, mode, opts.gap ?? 0.6);
  const vmax = traceScales(list, hi, lo, opts.scale).map((v) => v / (opts.yScale || 1));
  const X = (p) => L + ((hi - p) / (hi - lo)) * (R - L);
  const f = (v) => v.toFixed(1);
  const parts = [`<clipPath id="plot"><rect x="${L}" y="0" width="${R - L}" height="${axisY}"/></clipPath>`];
  const lines = [], labels = [];
  list.forEach((r, k) => {
    const s = r.spectrum, y = s.real, n = y.length, step = (s.ppmEnd - s.ppmStart) / (n - 1);
    const base = axisY - 6 - lay.offsets[k];
    const Y = (v) => base - (v / vmax[k]) * (lay.height - 4);
    const a = Math.max(hi, lo), b = Math.min(hi, lo);
    const i0 = Math.max(0, Math.floor((a - s.ppmStart) / step)), i1 = Math.min(n - 1, Math.ceil((b - s.ppmStart) / step));
    const x0 = X(s.ppmStart + i0 * step), x1 = X(s.ppmStart + i1 * step);
    const cols = Math.max(1, Math.ceil(x1 - x0)), pts = [];
    for (let c = 0; c < cols; c++) {
      const p = Math.floor(i0 + (c / cols) * (i1 - i0)), q = Math.max(p, Math.floor(i0 + ((c + 1) / cols) * (i1 - i0)));
      let mn = Infinity, mx = -Infinity;
      for (let i = p; i <= q && i < n; i++) { mn = Math.min(mn, y[i]); mx = Math.max(mx, y[i]); }
      pts.push(`${f(x0 + c + 0.5)},${f(Y(mn))}`, `${f(x0 + c + 0.5)},${f(Y(mx))}`);
    }
    lines.push(`<polyline fill="none" stroke="${colors[k]}" stroke-width="1" stroke-linejoin="round" points="${pts.join(' ')}"/>`);
    if (mode === 'stack') labels.push(`<text x="${R + 10}" y="${f(base - 2)}" fill="${colors[k]}">${xmlEsc(names[k])}</text>`);
    else labels.push(`<rect x="${L + 6}" y="${top + 4 + k * 17}" width="14" height="3" fill="${colors[k]}"/><text x="${L + 26}" y="${top + 9 + k * 17}" fill="${colors[k]}">${xmlEsc(names[k])}</text>`);
  });
  parts.push(`<g clip-path="url(#plot)">${lines.join('')}</g>`);
  parts.push(`<g font-family="Helvetica, Arial, sans-serif" font-size="12" font-weight="600">${labels.join('')}</g>`);
  // Axis
  const span = hi - lo, raw = span / 10, mag = Math.pow(10, Math.floor(Math.log10(raw))), nr = raw / mag;
  const tick = (nr < 1.5 ? 1 : nr < 3 ? 2 : nr < 7 ? 5 : 10) * mag, dec = Math.max(0, -Math.floor(Math.log10(tick) + 1e-9));
  let ax = `M${L},${axisY}H${R}`;
  const tl = [];
  for (let t = Math.ceil(lo / tick) * tick; t <= hi + 1e-9; t += tick) {
    ax += `M${f(X(t))},${axisY}v6`;
    tl.push(`<text x="${f(X(t))}" y="${axisY + 20}" text-anchor="middle">${t.toFixed(dec)}</text>`);
  }
  parts.push(`<path d="${ax}" stroke="#333" fill="none"/>`, `<g font-family="Helvetica, Arial, sans-serif" font-size="12" fill="#333">${tl.join('')}<text x="${R}" y="${axisY + 36}" text-anchor="end">ppm</text></g>`);
  const s0 = list[0].spectrum;
  const title = opts.title ?? `${list.length} spectra · ${s0.nucleus}${s0.frequency ? ` · ${Math.round(s0.frequency)} MHz` : ''}${mode === 'stack' ? ' · stacked' : ' · overlaid'}${opts.scale === 'common' ? ' · common scale' : ''}`;
  if (title) parts.push(`<text x="${L}" y="18" font-family="Helvetica, Arial, sans-serif" font-size="13" fill="#555">${xmlEsc(title)}</text>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="100%" height="100%" fill="#fff"/>${parts.join('')}</svg>\n`;
}
