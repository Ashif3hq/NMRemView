// Format detection: takes a set of files (single files, zip archives, or a dropped folder)
// and returns NMR datasets ready for processing.
import { readJcamp } from './jcamp.js';
import { readBruker } from './bruker.js';
import { readVarian } from './varian.js';
import { unzip } from './zip.js';
import { readText } from './textformats.js';

const JCAMP_EXT = /\.(jdx|dx|jcamp|jcm)$/i;
const TEXT_EXT = /\.(csv|tsv|txt|asc|xy)$/i;

// files: Map<path, Uint8Array>
export async function loadFiles(files) {
  const all = new Map();
  for (const [path, data] of files) {
    if (/\.zip$/i.test(path)) {
      const inner = await unzip(data);
      const prefix = path.replace(/\.zip$/i, '') + '/';
      for (const [p, d] of inner) {
        if (/\.zip$/i.test(p)) {
          for (const [p2, d2] of await unzip(d)) all.set(prefix + p.replace(/\.zip$/i, '') + '/' + p2, d2);
        } else all.set(prefix + p, d);
      }
    } else all.set(path.replace(/^\/+/, ''), data);
  }
  return loadExpanded(all);
}

// Synchronous part of loading: files are already unpacked (used directly by the macOS app,
// which unzips natively).
export function loadExpanded(all) {
  const datasets = [];
  const warnings = [];
  const used = new Set();

  // Bruker experiments: any directory holding acqus.
  const brukerDirs = [...all.keys()].filter((p) => /(^|\/)acqus$/.test(p)).map((p) => p.replace(/acqus$/, ''));
  for (const dir of brukerDirs.sort()) {
    if (all.has(dir + 'acqu2s')) { warnings.push(`${dir || 'Bruker data'}: 2D experiment skipped (1D only for now)`); markUsed(all, dir, used); continue; }
    const sub = subset(all, dir);
    try {
      datasets.push(normalise(readBruker(sub, nameFor(dir, 'Bruker'))));
    } catch (e) { warnings.push(`${dir}: ${e.message}`); }
    markUsed(all, dir, used);
  }

  // Varian/Agilent: directories holding procpar + fid.
  const varianDirs = [...all.keys()].filter((p) => /(^|\/)procpar$/.test(p)).map((p) => p.replace(/procpar$/, ''));
  for (const dir of varianDirs) {
    if (used.has(dir + 'procpar')) continue;
    try { datasets.push(normalise(readVarian(subset(all, dir), nameFor(dir, 'Varian')))); }
    catch (e) { warnings.push(`${dir}: ${e.message}`); }
    markUsed(all, dir, used);
  }

  for (const [path, data] of all) {
    if (used.has(path)) continue;
    const base = path.split('/').pop();
    try {
      if (JCAMP_EXT.test(path)) {
        const text = new TextDecoder('latin1').decode(data);
        for (const ds of readJcamp(text, base)) datasets.push(normalise(ds));
      } else if (TEXT_EXT.test(path) && !/^(audit|title|integrals|peaklist|format)/i.test(base)) {
        const ds = readText(new TextDecoder().decode(data), base);
        if (ds) datasets.push(normalise(ds));
      }
    } catch (e) { warnings.push(`${base}: ${e.message}`); }
  }
  if (!datasets.length && !warnings.length) warnings.push('No supported NMR data found. Supported: Bruker folders/zips, Varian .fid folders, JCAMP-DX (.jdx/.dx), CSV/TXT (ppm, intensity).');
  return { datasets, warnings };
}

function subset(all, dir) {
  const m = new Map();
  for (const [p, d] of all) if (p.startsWith(dir)) m.set(p.slice(dir.length), d);
  return m;
}
function markUsed(all, dir, used) { for (const p of all.keys()) if (p.startsWith(dir) && !p.slice(dir.length).match(/\.(jdx|dx)$/i)) used.add(p); }
function nameFor(dir, fallback) {
  const parts = dir.split('/').filter(Boolean);
  return parts.slice(-2).join('/') || fallback;
}

let counter = 0;
export function normalise(ds) {
  const out = { ...ds, id: 'ds' + (++counter) + '-' + Math.random().toString(36).slice(2, 7) };
  out.nucleus = canonicalNucleus(ds.nucleus);
  if (ds.real) {
    out.rawReal = ds.real; out.rawImag = ds.imag || null;
    out.rawPpmStart = ds.ppmStart; out.rawPpmEnd = ds.ppmEnd;
  }
  delete out.real; delete out.imag;
  return out;
}

export function canonicalNucleus(n) {
  if (!n) return '1H';
  const s = String(n).replace(/[^0-9A-Za-z]/g, '');
  const m = s.match(/^(\d+)([A-Za-z]+)$/) || s.match(/^([A-Za-z]+)(\d+)$/);
  if (!m) return s;
  const [num, el] = /^\d/.test(m[1]) ? [m[1], m[2]] : [m[2], m[1]];
  return num + el[0].toUpperCase() + el.slice(1).toLowerCase();
}
