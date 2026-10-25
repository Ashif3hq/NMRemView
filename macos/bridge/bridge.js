// JavaScriptCore entry point for the macOS app. Exposes a small JSON-in/JSON-out API on
// globalThis.NMRBridge so Swift never has to touch JS objects directly.
import {
  loadExpanded, createSession, searchReference, SOLVENTS, IMPURITIES, COUPLINGS,
  POLYMERS, END_GROUPS, degreeOfPolymerisation, composition, microstructure, repeatArea, windowArea,
  snapToPeak, findSolvent,
} from '../../core/index.js';

const sessions = new Map();
const lastResults = new Map();

function fromBase64(b64) {
  const T = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const map = new Uint8Array(128);
  for (let i = 0; i < T.length; i++) map[T.charCodeAt(i)] = i;
  const s = b64.replace(/[^A-Za-z0-9+/]/g, '');
  const out = new Uint8Array(Math.floor((s.length * 3) / 4));
  let o = 0;
  for (let i = 0; i < s.length; i += 4) {
    const n = (map[s.charCodeAt(i)] << 18) | (map[s.charCodeAt(i + 1)] << 12) | (map[s.charCodeAt(i + 2)] << 6) | map[s.charCodeAt(i + 3)];
    out[o++] = (n >> 16) & 255;
    if (i + 2 < s.length) out[o++] = (n >> 8) & 255;
    if (i + 3 < s.length) out[o++] = n & 255;
  }
  return out.subarray(0, o);
}

// Keep at most `cols` min/max pairs so the native view draws quickly.
function decimate(y, cols) {
  if (y.length <= cols * 2) return Array.from(y);
  const out = [];
  const step = y.length / cols;
  for (let c = 0; c < cols; c++) {
    let mn = Infinity, mx = -Infinity;
    for (let i = Math.floor(c * step); i < Math.floor((c + 1) * step); i++) { if (y[i] < mn) mn = y[i]; if (y[i] > mx) mx = y[i]; }
    out.push(mn, mx);
  }
  return out;
}

function summarise(id, r, cols) {
  const s = r.spectrum;
  const sig = (m) => ({
    ppm: m.ppm, ppmFrom: m.ppmFrom, ppmTo: m.ppmTo, multiplicity: m.multiplicity, J: m.J, nH: m.nH || 0,
    minor: !!m.minor, excluded: !!m.excluded, flag: m.flag ? m.flag.label : null,
    area: m.area || 0, manual: !!m.manual, reference: !!m.reference,
    candidates: (m.candidates || []).slice(0, 3).map((c) => c.group.name),
  });
  return {
    id, title: s.title, nucleus: s.nucleus, frequency: s.frequency || 0, solvent: s.solvent || '', source: s.source,
    ppmStart: s.ppmStart, ppmEnd: s.ppmEnd, points: s.real.length, y: decimate(s.real, cols || 4096),
    peaks: r.analysis.peaks.map((p) => ({ ppm: p.ppm, height: p.height, manual: !!p.manual })),
    signals: r.analysis.multiplets.map(sig),
    hints: r.suggestions.hints.map((h) => ({ text: h.text, detail: h.detail })),
    compounds: r.suggestions.compounds.map((c) => ({ name: c.compound.name, formula: c.compound.formula, score: c.score, h: c.compound.h.map((x) => x[0]), c: c.compound.c })),
    report: r.report,
    params: {
      ph0: r.params.ph0, ph1: r.params.ph1, lb: r.params.lb, snr: r.params.snr, baseline: r.params.baseline, fromFid: r.params.fromFid,
      referenceShift: r.params.referenceShift, formula: r.params.formula,
      manualRegions: r.params.manualRegions.map(([a, b]) => [a, b]), hasIntegralRef: !!r.params.integralRef,
      integralRef: r.params.integralRef ? { ppm: r.params.integralRef.ppm, value: r.params.integralRef.value } : null,
      peakEdits: { add: [...r.params.peakEdits.add], remove: [...r.params.peakEdits.remove] },
      annotations: r.params.annotations.map((a) => ({ ppm: a.ppm, text: a.text, kind: a.kind, yFrac: a.yFrac ?? null })),
    },
    integralUnit: r.integralUnit || 0,
  };
}

globalThis.NMRBridge = {
  // files: JSON {"relative/path": "<base64>"} -> JSON {datasets:[{id,title,nucleus}], warnings}
  open(filesJSON) {
    const obj = JSON.parse(filesJSON);
    const map = new Map(Object.entries(obj).map(([k, v]) => [k, fromBase64(v)]));
    const { datasets, warnings } = loadExpanded(map);
    const list = datasets.map((ds) => {
      sessions.set(ds.id, createSession(ds));
      return { id: ds.id, title: ds.title, nucleus: ds.nucleus, frequency: ds.frequency || 0, solvent: ds.solvent || '', source: ds.source };
    });
    return JSON.stringify({ datasets: list, warnings });
  },
  // Apply parameter changes (JSON object, may be "{}") and return the processed result.
  run(id, paramsJSON, cols) {
    const s = sessions.get(id);
    if (!s) throw new Error('Unknown dataset ' + id);
    const r = s.set(JSON.parse(paramsJSON || '{}'));
    lastResults.set(id, r);
    return JSON.stringify(summarise(id, r, cols));
  },
  close(id) { sessions.delete(id); lastResults.delete(id); },
  polymerLibrary() {
    return JSON.stringify({
      polymers: POLYMERS.map((p) => ({ id: p.id, name: p.name, unit: p.unit, m0: p.m0, signalLabel: p.signal.label, from: p.signal.from, to: p.signal.to, nH: p.signal.nH, micro: p.micro || '' })),
      endGroups: END_GROUPS.map((g) => ({ id: g.id, name: g.name, nH: g.nH, ppm: g.ppm, mass: g.mass, window: g.window || null, note: g.note || null })),
    });
  },
  // config: { polymer, repeatSig ('window' | ppm), repeatH, m0, end, endSig ('window' | ppm | null), endH, endCount, endMass,
  //           comps: [{ name, sig, nH, m0 }] }. Signals are named by their centre ppm.
  polymer(id, configJSON) {
    const r = lastResults.get(id);
    if (!r) throw new Error('Run the dataset first');
    const c = JSON.parse(configJSON);
    const sigs = r.analysis.multiplets.filter((m) => !m.excluded);
    const at = (ppm) => (ppm == null ? null : sigs.find((m) => Math.abs(m.ppm - ppm) < 1e-4));
    const poly = POLYMERS.find((p) => p.id === c.polymer);
    let repeat = null;
    if (c.repeatSig === 'window' && poly) repeat = { area: repeatArea(r.spectrum, poly), nH: c.repeatH };
    else { const m = at(c.repeatSig); if (m) repeat = { area: m.area, nH: c.repeatH }; }
    const g = END_GROUPS.find((x) => x.id === c.end);
    const endArea = c.endSig === 'window' && g && g.window ? windowArea(r.spectrum, g.window[0], g.window[1]) : (at(c.endSig) || {}).area;
    const dp = degreeOfPolymerisation({ repeat, end: endArea != null ? { area: endArea, nH: c.endH, count: c.endCount || 1 } : null, m0: c.m0, endMass: c.endMass });
    const comp = composition((c.comps || []).map((x) => { const m = at(x.sig); return { name: x.name, area: m ? m.area : 0, nH: x.nH, m0: x.m0 }; }));
    const micro = poly && poly.micro ? microstructure(r.spectrum, poly.micro) : null;
    return JSON.stringify({
      repeatIntegral: repeat && r.integralUnit ? repeat.area / r.integralUnit : null,
      endIntegral: endArea != null && r.integralUnit ? endArea / r.integralUnit : null,
      dp: dp ? dp.dp : null, mn: dp ? dp.mn : null,
      composition: comp.map((x) => ({ name: x.name, molPct: x.molPct, wtPct: x.wtPct })),
      microstructure: micro ? { rows: micro.rows, cis: micro.cisTrans ? micro.cisTrans.cis : null, trans: micro.cisTrans ? micro.cisTrans.trans : null, note: micro.note } : null,
    });
  },
  // Nearest local maximum to a clicked shift.
  snap(id, ppm) { const r = lastResults.get(id); return r ? snapToPeak(r.spectrum, ppm) : ppm; },
  // Tallest point between two shifts (peak picking by dragging over a region).
  tallest(id, a, b) {
    const r = lastResults.get(id); if (!r) return (a + b) / 2;
    const s = r.spectrum, n = s.real.length, step = (s.ppmEnd - s.ppmStart) / (n - 1);
    const i0 = Math.max(1, Math.round((Math.max(a, b) - s.ppmStart) / step)), i1 = Math.min(n - 2, Math.round((Math.min(a, b) - s.ppmStart) / step));
    let best = i0;
    for (let i = i0; i <= i1; i++) if (s.real[i] > s.real[best]) best = i;
    return s.ppmStart + best * step;
  },
  // The shift a clicked reference peak most likely is: TMS or the solvent residual.
  suggestReference(id, ppm) {
    const r = lastResults.get(id); if (!r) return ppm;
    const is13 = /13C/.test(r.spectrum.nucleus);
    const sol = findSolvent(r.spectrum.solvent);
    const refs = [0, ...(sol ? (is13 ? sol.c : sol.h) : [])];
    const best = refs.reduce((b, v) => (Math.abs(v - ppm) < Math.abs(b - ppm) ? v : b), refs[0]);
    return Math.abs(best - ppm) < (is13 ? 3 : 0.3) ? best : Math.round(ppm * 1000) / 1000;
  },
  // CSV and text exports: kind is 'peaks', 'ints' or 'report'.
  exportText(id, kind) {
    const r = lastResults.get(id); if (!r) return '';
    const s = r.spectrum, freq = s.frequency || 0, is13 = /13C/.test(s.nucleus), sh = r.params.referenceShift;
    const cell = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
    const csv = (rows) => rows.map((row) => row.map(cell).join(',')).join('\n');
    if (kind === 'peaks') {
      const maxH = Math.max(...r.analysis.peaks.map((p) => p.height), 1);
      return csv([['ppm', 'Hz', 'height', 'relative %', 'picked']].concat(r.analysis.peaks.map((p) => [p.ppm.toFixed(4), freq ? (p.ppm * freq).toFixed(2) : '', p.height.toPrecision(6), (100 * p.height / maxH).toFixed(2), p.manual ? 'manual' : 'auto'])));
    }
    if (kind === 'ints') {
      const ann = r.params.annotations || [];
      const label = (m) => ann.filter((a) => a.kind === 'label' && a.ppm + sh <= m.ppmFrom + 1e-6 && a.ppm + sh >= m.ppmTo - 1e-6).map((a) => a.text).join('; ');
      const sigs = r.analysis.multiplets.filter((m) => !m.excluded && (!m.minor || m.manual || m.reference || is13));
      let out = csv([['from ppm', 'to ppm', 'centre ppm', 'multiplicity', 'J (Hz)', 'integral', 'label', 'environment']].concat(sigs.map((m) => [m.ppmFrom.toFixed(3), m.ppmTo.toFixed(3), m.ppm.toFixed(3), m.multiplicity || '', (m.J || []).map((j) => j.toFixed(1)).join(' '), is13 ? '' : (m.nH || 0).toFixed(3), label(m), m.candidates && m.candidates[0] ? m.candidates[0].group.name : ''])));
      const notes = ann.filter((a) => a.kind === 'note');
      if (notes.length) out += '\n\n' + csv([['note at ppm', 'text']].concat(notes.map((a) => [(a.ppm + sh).toFixed(3), a.text])));
      return out;
    }
    return r.report;
  },
  search(query) {
    const r = searchReference(query);
    return JSON.stringify({
      element: r.element ? { symbol: r.element.symbol, name: r.element.name, note: r.element.note, isotopes: r.element.isotopes } : null,
      groups: r.groups.map((g) => ({ id: g.id, name: g.name, nucleus: g.nucleus, min: g.min, max: g.max, typical: g.typical, note: g.note })),
      compounds: r.compounds.map((c) => ({ name: c.name, formula: c.formula })),
    });
  },
  tables() { return JSON.stringify({ solvents: SOLVENTS, impurities: IMPURITIES, couplings: COUPLINGS }); },
};
