// Batch processing: take the Polymer set-up from one spectrum as a template and apply it to a
// whole series (same processing, solvent referencing, the same integral windows), giving one
// table of DP, Mn, composition and microstructure. Each file keeps its own shift referencing
// (vendor files are already referenced), so the windows land on the same signals. Used by the web and Mac apps.
import { createSession } from './session.js';
import { integrateRange } from './analysis.js';
import { POLYMERS, END_GROUPS, degreeOfPolymerisation, composition, microstructure, repeatArea } from './polymer.js';

const area = (spec, w) => Math.max(0, integrateRange(spec, Math.max(w[0], w[1]), Math.min(w[0], w[1]), { local: true }).area);

/** The signal a Polymer-panel choice points at: a centre ppm (number or "7.2600" string). */
function signalAt(result, sig) {
  const x = typeof sig === 'number' ? sig : parseFloat(sig);
  if (!isFinite(x)) return null;
  return result.analysis.multiplets.find((m) => !m.excluded && Math.abs(m.ppm - x) < 1e-3) || null;
}
const win = (m) => (m ? [+m.ppmFrom.toFixed(4), +m.ppmTo.toFixed(4)] : null);

/**
 * Template from the Polymer panel of one processed spectrum.
 * cfg: { polymer, repeatSig ('window' | centre ppm), repeatH, m0, end, endSig ('window' | ppm | ''),
 *        endH, endCount, endMass, comps: [{ name, sig, nH, m0 }] } (the same shape both apps use).
 * Chosen signals become fixed shift windows, so they can be integrated on every spectrum.
 */
export function templateFromPolymer(result, cfg) {
  const p = result.params;
  const poly = POLYMERS.find((x) => x.id === cfg.polymer) || null;
  const endPreset = END_GROUPS.find((g) => g.id === cfg.end) || null;
  const repeat = cfg.repeatSig === 'window' && poly ? { window: 'standard' } : { window: win(signalAt(result, cfg.repeatSig)) };
  const end = cfg.endSig === 'window' && endPreset && endPreset.window ? { window: endPreset.window.slice() } : { window: win(signalAt(result, cfg.endSig)) };
  return {
    version: 1,
    polymer: poly ? poly.id : 'custom',
    polymerName: poly ? poly.name : 'Custom repeat unit',
    endName: endPreset ? endPreset.name : '',
    processing: { lb: p.lb, baseline: !!p.baseline, snr: p.snr, reverse: !!p.reverse },
    repeat: { ...repeat, nH: +cfg.repeatH || 1 },
    m0: +cfg.m0 || 0,
    end: { ...end, nH: +cfg.endH || 1, count: Math.max(1, Math.round(+cfg.endCount || 1)), mass: +cfg.endMass || 0 },
    comps: (cfg.comps || []).map((c) => ({ name: c.name || 'Unit', window: win(signalAt(result, c.sig)), nH: +c.nH || 1, m0: +c.m0 || 0 })).filter((c) => c.window),
  };
}

/** What the template still needs before it can run, or '' when it is ready. */
export function templateProblem(t) {
  if (!t) return 'No template';
  if (!t.repeat.window) return 'Choose a counting signal for the repeat unit first';
  if (!t.end.window) return 'Choose an end-group signal first';
  return '';
}

/**
 * Runs the template on each dataset. Returns { rows, template } where each row has
 * { name, title, ok, note, repeatInt, endInt, dp, mn, comp: [{ name, molPct, wtPct }], micro }.
 * Integrals are on a per-chain scale: the end-group signal equals its protons per chain.
 */
export function runBatch(datasets, template) {
  const problem = templateProblem(template);
  if (problem) throw new Error(problem);
  const poly = POLYMERS.find((p) => p.id === template.polymer);
  const rows = [];
  for (const ds of datasets) {
    const row = { name: ds.name || '', title: ds.title || ds.name || '', ok: false, note: '' };
    rows.push(row);
    if (!/1H/.test(ds.nucleus)) { row.note = `Skipped: ${ds.nucleus} (batch uses ¹H)`; continue; }
    try {
      const session = createSession(ds);
      Object.assign(session.params, template.processing || {});
      const r = session.run();
      const spec = r.spectrum;
      // A window with no picked peak holds only noise: say so instead of reporting a number.
      const hasPeak = (w) => r.analysis.peaks.some((pk) => pk.ppm <= Math.max(w[0], w[1]) && pk.ppm >= Math.min(w[0], w[1]));
      const repWin = template.repeat.window === 'standard' ? (poly ? [poly.signal.from, poly.signal.to] : null) : template.repeat.window;
      if (!hasPeak(template.end.window)) { row.note = 'No end-group peak in its window'; continue; }
      if (repWin && !hasPeak(repWin)) { row.note = 'No repeat-unit peak in its window'; continue; }
      const repeatA = template.repeat.window === 'standard' ? (poly ? repeatArea(spec, poly) : 0) : area(spec, template.repeat.window);
      const endA = area(spec, template.end.window);
      const perChain = template.end.nH * template.end.count;
      const unit = endA > 0 ? endA / perChain : 0;
      row.repeatInt = unit ? repeatA / unit : null;
      row.endInt = unit ? perChain : null;
      const dp = degreeOfPolymerisation({
        repeat: { area: repeatA, nH: template.repeat.nH },
        end: { area: endA, nH: template.end.nH, count: template.end.count },
        m0: template.m0, endMass: template.end.mass,
      });
      row.dp = dp ? dp.dp : null;
      row.mn = dp ? dp.mn : null;
      row.comp = template.comps.length >= 2
        ? composition(template.comps.map((c) => ({ name: c.name, area: area(spec, c.window), nH: c.nH, m0: c.m0 }))).map((c) => ({ name: c.name, molPct: c.molPct, wtPct: c.wtPct }))
        : [];
      const micro = poly && poly.micro ? microstructure(spec, poly.micro) : null;
      row.micro = micro ? micro.rows.map((m) => ({ label: m.label, pct: m.pct })) : [];
      row.ok = row.dp != null;
      if (!row.ok && !row.note) row.note = 'DP could not be calculated';
    } catch (e) {
      row.note = 'Could not process: ' + e.message;
    }
  }
  return { rows, template, stats: stats(rows) };
}

function stats(rows) {
  const ok = rows.filter((r) => r.ok);
  if (ok.length < 2) return null;
  const ms = (k) => {
    const v = ok.map((r) => r[k]).filter((x) => x != null && isFinite(x));
    if (v.length < 2) return null;
    const mean = v.reduce((a, b) => a + b, 0) / v.length;
    const sd = Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / (v.length - 1));
    return { mean, sd, n: v.length };
  };
  return { dp: ms('dp'), mn: ms('mn') };
}

/** Column headings and cell text for a batch result (shared by the on-screen table and exports). */
export function batchColumns(res) {
  const t = res.template;
  const compNames = [...new Set(res.rows.flatMap((r) => (r.comp || []).map((c) => c.name)))];
  const microNames = [...new Set(res.rows.flatMap((r) => (r.micro || []).map((m) => m.label)))];
  const f = (v, d) => (v == null || !isFinite(v) ? '' : v.toFixed(d));
  const cols = [
    { head: 'Spectrum', cell: (r) => r.title },
    { head: `∫ repeat (${t.repeat.nH}H/unit)`, cell: (r) => f(r.repeatInt, 2) },
    { head: `∫ end (${t.end.nH * t.end.count}H/chain)`, cell: (r) => f(r.endInt, 2) },
    { head: 'DPn', cell: (r) => f(r.dp, 1) },
    { head: 'Mn (g/mol)', cell: (r) => (r.mn == null ? '' : String(Math.round(r.mn))) },
    ...compNames.flatMap((n) => [
      { head: `${n} mol %`, cell: (r) => f((r.comp || []).find((c) => c.name === n)?.molPct, 1) },
      { head: `${n} wt %`, cell: (r) => f((r.comp || []).find((c) => c.name === n)?.wtPct, 1) },
    ]),
    ...microNames.map((n) => ({ head: `${n} %`, cell: (r) => f((r.micro || []).find((m) => m.label === n)?.pct, 1) })),
    { head: 'Note', cell: (r) => r.note || '' },
    { head: 'File', cell: (r) => r.name },
  ];
  return cols;
}

/** The batch table as CSV (sep ',') or TSV (sep '\t', pastes into Excel), with mean ± SD rows. */
export function batchTable(res, sep = ',') {
  const cols = batchColumns(res);
  const cell = (v) => {
    const s = String(v ?? '');
    if (sep === '\t') return s.replace(/[\t\n]/g, ' ');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [cols.map((c) => cell(c.head)).join(sep)];
  for (const r of res.rows) lines.push(cols.map((c) => cell(c.cell(r))).join(sep));
  if (res.stats) {
    const blank = cols.map(() => '');
    const iDp = cols.findIndex((c) => c.head === 'DPn'), iMn = cols.findIndex((c) => c.head === 'Mn (g/mol)');
    const mean = blank.slice(), sd = blank.slice();
    mean[0] = `Mean (n = ${res.stats.dp ? res.stats.dp.n : 0})`; sd[0] = 'SD';
    if (res.stats.dp) { mean[iDp] = res.stats.dp.mean.toFixed(1); sd[iDp] = res.stats.dp.sd.toFixed(1); }
    if (res.stats.mn) { mean[iMn] = String(Math.round(res.stats.mn.mean)); sd[iMn] = String(Math.round(res.stats.mn.sd)); }
    lines.push(mean.map(cell).join(sep), sd.map(cell).join(sep));
  }
  const t = res.template;
  lines.push('', cell(`Template: ${t.polymerName}, M0 = ${t.m0} g/mol, ${t.repeat.nH}H per unit; end group ${t.endName || 'custom'} (${t.end.nH}H × ${t.end.count}, ${t.end.mass} g/mol)`));
  return lines.join('\n') + '\n';
}
