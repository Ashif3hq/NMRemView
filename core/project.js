// NMRemView project files (.nmrview): your work saved to a file on your own computer, no account
// or server. A project holds a copy of the raw data (so it opens anywhere, even if the original
// folder moved) plus everything you did to each spectrum: processing, referencing, peaks,
// integrals, labels and notes, and the overlay / stack view. The web app and the Mac app read
// and write the same format.
import { loadExpanded } from './loader.js';
import { createSession } from './session.js';

export const PROJECT_FORMAT = 'nmremview-project';
export const PROJECT_VERSION = 1;
export const PROJECT_EXT = '.nmrview';

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function toBase64(bytes) {
  let out = '';
  const n = bytes.length;
  for (let i = 0; i < n; i += 3) {
    const a = bytes[i], b = i + 1 < n ? bytes[i + 1] : 0, c = i + 2 < n ? bytes[i + 2] : 0;
    const v = (a << 16) | (b << 8) | c;
    out += B64[(v >> 18) & 63] + B64[(v >> 12) & 63] + (i + 1 < n ? B64[(v >> 6) & 63] : '=') + (i + 2 < n ? B64[v & 63] : '=');
  }
  return out;
}

export function fromBase64(str) {
  const map = new Uint8Array(128);
  for (let i = 0; i < B64.length; i++) map[B64.charCodeAt(i)] = i;
  const s = str.replace(/[^A-Za-z0-9+/]/g, '');
  const out = new Uint8Array(Math.floor((s.length * 3) / 4));
  let o = 0;
  for (let i = 0; i < s.length; i += 4) {
    const v = (map[s.charCodeAt(i)] << 18) | (map[s.charCodeAt(i + 1)] << 12) | (map[s.charCodeAt(i + 2)] << 6) | map[s.charCodeAt(i + 3)];
    out[o++] = (v >> 16) & 255;
    if (i + 2 < s.length) out[o++] = (v >> 8) & 255;
    if (i + 3 < s.length) out[o++] = v & 255;
  }
  return out.subarray(0, o);
}

const junk = (p) => /(^|\/)__MACOSX\//.test(p) || /(^|\/)(\._[^/]*|\.DS_Store)$/.test(p);

/** A loaded file set (Map path -> bytes, already unzipped) as the project's base64 form. */
export function encodeSource(files) {
  const out = {};
  for (const [p, d] of files) if (!junk(p)) out[p] = typeof d === 'string' ? d : toBase64(d);
  return out;
}

/** Everything a person changed on a spectrum, as plain JSON (all of the session's parameters). */
export function sessionState(params) {
  const p = JSON.parse(JSON.stringify(params));
  p.autoPhase = false;      // the saved phase is the answer; don't re-run auto phase on open
  p.autoReference = false;  // likewise the saved referencing
  return p;
}

/**
 * Builds the project text.
 * sources: array of { path: base64 } (one per file set the person opened).
 * items: [{ source, index, name, title, params, cmp, color }] where index is the dataset's
 *   position among the datasets that source produced.
 * view: { current, compare: { mode, gap, scale } }.
 */
export function buildProject(sources, items, view = {}, app = 'NMRemView') {
  // Only keep file sets some spectrum still uses.
  const used = [...new Set(items.map((it) => it.source))].sort((a, b) => a - b);
  const remap = new Map(used.map((s, k) => [s, k]));
  return JSON.stringify({
    format: PROJECT_FORMAT, version: PROJECT_VERSION, app, saved: new Date().toISOString(),
    view: { current: view.current ?? 0, compare: view.compare || { mode: 'single', gap: 0.6, scale: 'each' } },
    items: items.map((it) => ({
      source: remap.get(it.source), index: it.index, name: it.name || '', title: it.title || '',
      cmp: !!it.cmp, color: it.color ?? null, params: sessionState(it.params),
    })),
    sources: used.map((s) => ({ files: sources[s] })),
  });
}

/** True for text that looks like a project file. */
export function isProject(name, bytes) {
  if (/\.nmrview$/i.test(name || '')) return true;
  if (!bytes || bytes.length < 20) return false;
  const head = new TextDecoder().decode(bytes.subarray(0, 200));
  return head.includes('"format"') && head.includes(PROJECT_FORMAT);
}

/**
 * Reads a project. Returns { entries: [{ ds, session, item, source }], sources: [{ path: base64 }],
 * view, warnings }. Each session already carries the saved parameters.
 */
export function openProject(text) {
  let doc;
  try { doc = JSON.parse(text); } catch (e) { throw new Error('This is not an NMRemView project file (it could not be read)'); }
  if (!doc || doc.format !== PROJECT_FORMAT) throw new Error('This is not an NMRemView project file');
  if (doc.version > PROJECT_VERSION) throw new Error('This project was saved by a newer NMRemView; please update the app');
  const warnings = [];
  const loaded = (doc.sources || []).map((src) => {
    const files = new Map(Object.entries(src.files || {}).map(([p, b]) => [p, fromBase64(b)]));
    return loadExpanded(files);
  });
  const entries = [];
  for (const item of doc.items || []) {
    const set = loaded[item.source];
    let ds = set && set.datasets[item.index];
    // Fall back to the name if the reader now finds datasets in a different order.
    if (set && (!ds || (item.name && ds.name !== item.name))) ds = set.datasets.find((d) => d.name === item.name) || ds;
    if (!ds) { warnings.push(`${item.title || item.name || 'A spectrum'} could not be reopened from the saved data`); continue; }
    if (item.title) ds.title = item.title;
    const session = createSession(ds);
    Object.assign(session.params, item.params || {});
    entries.push({ ds, session, item, source: item.source });
  }
  return { entries, sources: (doc.sources || []).map((s) => s.files || {}), view: doc.view || {}, warnings, saved: doc.saved };
}
