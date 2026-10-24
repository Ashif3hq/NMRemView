// Plain-text spectra: two columns (ppm, intensity), as exported by MestReNova, TopSpin
// "totxt", Excel, etc. Lines with fewer than two numbers are treated as headers.
import { finishSpectrum } from './jcamp.js';

export function readText(text, name = 'spectrum.txt') {
  const xs = [], ys = [];
  let nucleus, frequency;
  for (const line of text.split(/\r?\n/)) {
    if (/1H|proton/i.test(line) && !nucleus && /[a-z]/i.test(line)) nucleus = '1H';
    if (/13C|carbon/i.test(line) && !nucleus && /[a-z]/i.test(line)) nucleus = '13C';
    const f = line.match(/(\d{2,4}(?:\.\d+)?)\s*MHz/i);
    if (f && !frequency) frequency = parseFloat(f[1]);
    const parts = line.trim().split(/[\s,;\t]+/).map(Number);
    if (parts.length >= 2 && parts.every((v) => !isNaN(v))) {
      xs.push(parts[parts.length === 2 ? 0 : parts.length - 2]);
      ys.push(parts[parts.length - 1]);
    }
  }
  if (xs.length < 16) return null;
  // Sort by descending ppm and resample onto a uniform grid if needed.
  const idx = xs.map((_, i) => i).sort((a, b) => xs[b] - xs[a]);
  const sx = idx.map((i) => xs[i]), sy = idx.map((i) => ys[i]);
  const n = sx.length;
  const start = sx[0], end = sx[n - 1];
  const out = new Float64Array(n);
  let j = 0;
  for (let i = 0; i < n; i++) {
    const x = start + ((end - start) * i) / (n - 1);
    while (j < n - 2 && sx[j + 1] > x) j++;
    const t = (sx[j] - x) / ((sx[j] - sx[j + 1]) || 1);
    out[i] = sy[j] + t * (sy[j + 1] - sy[j]);
  }
  if (!nucleus) nucleus = start - end > 40 ? '13C' : '1H';
  return finishSpectrum({ name, title: name, nucleus, frequency: frequency || (nucleus === '13C' ? 100 : 400), source: 'Text/CSV', meta: {} }, out, null, start, end);
}
