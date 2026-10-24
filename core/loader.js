// Format detection: takes a set of files (single files, zip archives, or a dropped folder)
// and returns NMR datasets ready for processing.
import { readJcamp } from './jcamp.js';
import { readBruker } from './bruker.js';
import { readVarian } from './varian.js';
import { unzip } from './zip.js';
import { readText } from './textformats.js';
import { isJeol, readJeol } from './jeol.js';
import { isNmrPipe, readNmrPipe } from './nmrpipe.js';
import { readNmrML } from './nmrml.js';
import { readMagritek } from './magritek.js';
import { readMnova } from './mnova.js';

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

  // Magritek Spinsolve: directories holding acqu.par with data.1d / spectrum.1d.
  const magDirs = [...all.keys()].filter((p) => /(^|\/)acqu\.par$/.test(p)).map((p) => p.replace(/acqu\.par$/, ''));
  for (const dir of magDirs) {
    if (!all.has(dir + 'data.1d') && !all.has(dir + 'spectrum.1d')) continue;
    try { datasets.push(normalise(readMagritek(subset(all, dir), nameFor(dir, 'Spinsolve')))); }
    catch (e) { warnings.push(`${dir}: ${e.message}`); }
    for (const f of ['acqu.par', 'data.1d', 'spectrum.1d']) used.add(dir + f);
  }

  for (const [path, data] of all) {
    if (used.has(path)) continue;
    const base = path.split('/').pop();
    try {
      if (/\.mnova$/i.test(path)) {
        for (const ds of readMnova(data, base)) datasets.push(normalise(ds));
      } else if (/\.jdf$/i.test(path) || isJeol(data)) {
        datasets.push(normalise(readJeol(data, base)));
      } else if (/\.nmrml$/i.test(path) || (/\.xml$/i.test(path) && /<nmrML/.test(new TextDecoder('latin1').decode(data.subarray(0, 2000))))) {
        datasets.push(normalise(readNmrML(new TextDecoder().decode(data), base)));
      } else if (isNmrPipe(data)) {
        datasets.push(normalise(readNmrPipe(data, base)));
      } else if (JCAMP_EXT.test(path) || (data.length > 8 && data[0] === 0x23 && data[1] === 0x23)) {
        const text = new TextDecoder('latin1').decode(data);
        for (const ds of readJcamp(text, base)) datasets.push(normalise(ds));
      } else if (TEXT_EXT.test(path) && !/^(audit|title|integrals|peaklist|format)/i.test(base)) {
        const ds = readText(new TextDecoder().decode(data), base);
        if (ds) datasets.push(normalise(ds));
      }
    } catch (e) { warnings.push(`${base}: ${e.message}`); }
  }
  if (!datasets.length && !warnings.length) warnings.push('No supported NMR data found. Supported: Bruker, JEOL (.jdf), Varian/Agilent, Magritek Spinsolve, NMRPipe, nmrML, JCAMP-DX, MestReNova (.mnova, when it embeds open data), CSV/TXT.');
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
  const named = { proton: '1H', hydrogen: '1H', carbon: '13C', carbon13: '13C', fluorine: '19F', fluorine19: '19F', phosphorus: '31P', phosphorus31: '31P', nitrogen15: '15N', silicon29: '29Si', deuterium: '2H' };
  if (named[s.toLowerCase()]) return named[s.toLowerCase()];
  const m = s.match(/^(\d+)([A-Za-z]+)$/) || s.match(/^([A-Za-z]+)(\d+)$/);
  if (!m) return s;
  const [num, el] = /^\d/.test(m[1]) ? [m[1], m[2]] : [m[2], m[1]];
  return num + el[0].toUpperCase() + el.slice(1).toLowerCase();
}
