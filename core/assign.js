// Assignment suggestions: candidate functional groups per signal, solvent/impurity
// flags, structural fragment hints, reference compound matches and report text.
import { applyIntegralUnit } from './analysis.js';
import { SHIFT_GROUPS, IMPURITIES, COMPOUNDS, findSolvent } from './database.js';

const r2 = (v) => Math.round(v * 100) / 100;

const RARE = new Set(['F', 'P', 'S', 'Si', 'B', 'Br', 'I', 'Cl']);

export function candidateGroups(signal, nucleus, formula) {
  const tol = nucleus === '13C' ? 2.5 : 0.12;
  const out = [];
  for (const g of SHIFT_GROUPS) {
    if (g.nucleus !== nucleus) continue;
    if (signal.ppm < g.min - tol || signal.ppm > g.max + tol) continue;
    // With a molecular formula, groups needing absent elements are impossible.
    if (formula && g.elements.some((el) => !formula[el])) continue;
    const half = Math.max((g.max - g.min) / 2, nucleus === '13C' ? 3 : 0.15);
    let score = 1 - Math.min(1, Math.abs(signal.ppm - g.typical) / (half * 2));
    if (signal.ppm < g.min || signal.ppm > g.max) score *= 0.5;
    if (g.expected && nucleus === '1H') {
      const nH = Math.round(signal.nH || 0);
      if (g.expected.nH) score *= g.expected.nH === nH ? 1.5 : 0.6;
      if (g.expected.mult) {
        const same = signal.multiplicity === g.expected.mult || (g.expected.mult === 's' && signal.multiplicity === 'br s');
        // Exchangeable protons (broad singlets) almost never show resolved couplings.
        score *= same ? 1.3 : g.expected.mult === 'br s' && signal.J && signal.J.length ? 0.25 : 0.7;
      }
    }
    if (!g.elements.length) score *= 1.15;
    // Without a formula, prefer common environments over ones needing rarer heteroatoms.
    if (!formula && g.elements.some((el) => RARE.has(el))) score *= 0.6;
    if (/heteroaromatic|alkyne/.test(g.tags)) score *= formula ? 0.85 : 0.65;
    // Narrow, specific ranges are more informative than broad catch-alls.
    score *= 1 + 0.3 / (1 + (g.max - g.min) / (nucleus === '13C' ? 10 : 0.5));
    out.push({ group: g, score });
  }
  out.sort((a, b) => b.score - a.score);
  return out.slice(0, 4);
}

export function solventAndImpurities(signals, nucleus, solventName) {
  const solvent = findSolvent(solventName);
  const key = solvent && (solvent.id === 'DMSO-d6' ? 'DMSO-d6' : solvent.id === 'CDCl3' ? 'CDCl3' : null);
  const tol = nucleus === '13C' ? 0.4 : 0.03;
  const flags = new Map();
  for (const s of signals) {
    if (solvent) {
      const refs = nucleus === '13C' ? solvent.c : solvent.h;
      const singlet = nucleus === '13C' || /s$/.test(s.multiplicity) || ((s.J || []).length > 0 && s.J.every((j) => j < 3)) || (s.multiplicity === 'm' && (s.ppmFrom - s.ppmTo) < 0.08);
      for (const v of refs) if (singlet && Math.abs(s.ppm - v) < (nucleus === '13C' ? 0.8 : 0.05)) flags.set(s, { kind: 'solvent', label: `${solvent.id} residual (${v})` });
      if (nucleus === '1H' && singlet && Math.abs(s.ppm - solvent.water) < 0.1 && !flags.has(s)) flags.set(s, { kind: 'water', label: `Water in ${solvent.id} (${solvent.water})` });
    }
    if (flags.has(s)) continue;
    for (const imp of IMPURITIES) {
      const d = imp[key || 'CDCl3'];
      if (!d) continue;
      const refs = nucleus === '13C' ? d.c || [] : d.h || [];
      const v = refs.find((x) => Math.abs(s.ppm - x) < tol);
      if (v !== undefined && (s.minor || (s.nH || 0) < 0.6 || nucleus === '13C')) {
        flags.set(s, { kind: 'impurity', label: `Possible ${imp.name} (${v})` });
        break;
      }
    }
  }
  return { solvent, flags };
}

// Pattern rules a chemist would apply at a glance.
export function fragmentHints(signals, nucleus) {
  const hints = [];
  const S = signals.filter((s) => !s.minor && !(s.flag && s.flag.kind !== 'impurity'));
  if (nucleus === '1H') {
    const n = (s) => Math.round(s.nH || 0);
    const near = (a, b, tol = 0.6) => a.J.length && b.J.length && Math.abs(a.J[0] - b.J[0]) < tol;
    for (const q of S.filter((s) => s.multiplicity === 'q' && n(s) === 2)) {
      const t = S.find((s) => s.multiplicity === 't' && n(s) === 3 && near(q, s));
      if (t) {
        const where = q.ppm > 3.9 ? 'O–CH₂CH₃ (ethyl ester / ethoxy)' : q.ppm > 3.2 ? 'O–CH₂CH₃ (ethyl ether / alcohol)' : q.ppm > 2.3 ? 'CH₃CH₂–C=O, N–CH₂CH₃ or Ar–CH₂CH₃' : 'CH₃CH₂–C';
        hints.push({ text: `Ethyl group: ${where}`, detail: `q ${r2(q.ppm)} (2H) and t ${r2(t.ppm)} (3H) share J = ${q.J[0]} Hz`, signals: [q, t] });
      }
    }
    for (const d of S.filter((s) => s.multiplicity === 'd' && n(s) === 6)) {
      const sp = S.find((s) => s.multiplicity === 'hept' && n(s) === 1 && near(s, d)) ||
        S.find((s) => s.multiplicity === 'm' && n(s) === 1 && s.ppm > d.ppm + 0.5 && s.ppm - d.ppm < 3.6);
      if (sp) hints.push({ text: sp.ppm > 3.5 ? 'Isopropyl on oxygen (O–CH(CH₃)₂)' : 'Isopropyl group CH(CH₃)₂', detail: `1H at ${r2(sp.ppm)} with a 6H doublet at ${r2(d.ppm)}`, signals: [sp, d] });
    }
    for (const s of S.filter((x) => (x.multiplicity === 's') && n(x) === 9 && x.ppm < 1.6)) hints.push({ text: s.ppm > 1.38 ? 'tert-Butyl ester / Boc group' : 'tert-Butyl group', detail: `9H singlet at ${r2(s.ppm)}`, signals: [s] });
    for (const s of S.filter((x) => x.multiplicity === 's' && n(x) === 3)) {
      let t = null;
      if (s.ppm >= 3.6 && s.ppm < 4.05) t = 'O–CH₃ (methyl ester or aryl methyl ether)';
      else if (s.ppm >= 3.2 && s.ppm < 3.6) t = 'Aliphatic O–CH₃ ether';
      else if (s.ppm >= 2.75 && s.ppm < 3.2) t = 'N–CH₃ (amide/aniline) or CH₃SO₂';
      else if (s.ppm >= 2.0 && s.ppm < 2.75) t = s.ppm < 2.12 ? 'Acetate CH₃C(=O)O or CH₃–C=O' : 'CH₃–C=O (methyl ketone) or Ar–CH₃';
      if (t) hints.push({ text: `Isolated methyl: ${t}`, detail: `3H singlet at ${r2(s.ppm)}`, signals: [s] });
    }
    const ar = S.filter((s) => s.ppm > 6.4 && s.ppm < 8.6);
    const arH = ar.reduce((a, s) => a + n(s), 0);
    if (arH) {
      let t = `${arH} aromatic H`;
      const dd = ar.filter((s) => s.multiplicity === 'd' && n(s) === 2);
      if (arH === 5) t += ': consistent with a monosubstituted benzene (C₆H₅–)';
      else if (arH === 4 && dd.length === 2 && Math.abs(dd[0].J[0] - dd[1].J[0]) < 1) t += ': two 2H doublets → para-disubstituted benzene (AA′BB′)';
      else if (arH === 4) t += ': consistent with a disubstituted benzene (ortho or meta pattern)';
      else if (arH === 3) t += ': consistent with a trisubstituted benzene';
      hints.push({ text: t, detail: ar.map((s) => `${r2(s.ppm)} (${s.multiplicity}, ${n(s)}H)`).join(', '), signals: ar });
    }
    const vinyl = S.filter((s) => s.ppm > 4.5 && s.ppm < 6.4 && s.J.some((j) => j > 9));
    for (const v of vinyl) {
      const big = Math.max(...v.J);
      hints.push({ text: big > 13 ? 'trans-Alkene (J > 13 Hz)' : 'cis-Alkene or vinyl (J 9–13 Hz)', detail: `${r2(v.ppm)} with J = ${big} Hz`, signals: [v] });
    }
    for (const s of S.filter((x) => x.ppm > 9.3 && x.ppm < 10.3)) hints.push({ text: 'Aldehyde (CHO)', detail: `${r2(s.ppm)} ppm`, signals: [s] });
    for (const s of S.filter((x) => x.ppm >= 10.3)) hints.push({ text: 'Carboxylic acid / strongly H-bonded OH or NH', detail: `${r2(s.ppm)} ppm`, signals: [s] });
  } else {
    const co = S.filter((s) => s.ppm > 160);
    for (const s of co) {
      const t = s.ppm > 195 ? 'Ketone/aldehyde C=O' : s.ppm > 185 ? 'Aldehyde or conjugated ketone C=O' : s.ppm > 175 ? 'Carboxylic acid C=O' : s.ppm > 165 ? 'Ester/acid/amide C=O' : 'Amide/conjugated ester C=O, or aryl C–O/C=N';
      hints.push({ text: t, detail: `${r2(s.ppm)} ppm`, signals: [s] });
    }
    const ar = S.filter((s) => s.ppm > 110 && s.ppm <= 160);
    if (ar.length) hints.push({ text: `${ar.length} sp² carbon environments (aromatic/alkene, 110–160 ppm)`, detail: ar.map((s) => r2(s.ppm)).join(', '), signals: ar });
    const co2 = S.filter((s) => s.ppm > 50 && s.ppm < 90);
    if (co2.length) hints.push({ text: `${co2.length} carbon(s) bonded to O or N (50–90 ppm)`, detail: co2.map((s) => r2(s.ppm)).join(', '), signals: co2 });
    const al = S.filter((s) => s.ppm <= 50 && s.ppm > -5);
    if (al.length) hints.push({ text: `${al.length} sp³ carbon environments (0–50 ppm)`, detail: al.map((s) => r2(s.ppm)).join(', '), signals: al });
  }
  return hints;
}

// Score reference compounds against the observed signals.
export function matchCompounds(signals, nucleus) {
  const obs = signals.filter((s) => !s.minor && !(s.flag && s.flag.kind === 'solvent'));
  if (!obs.length) return [];
  const res = [];
  for (const c of COMPOUNDS) {
    if (nucleus === '1H') {
      const totObs = obs.reduce((a, s) => a + Math.max(s.nH || 1, 0.5), 0);
      const totRef = c.h.reduce((a, h) => a + h[2], 0);
      let refMatched = 0, used = new Set();
      for (const [ppm, , nH] of c.h) {
        let best = null, bd = Infinity;
        for (const s of obs) {
          const d = ppm < s.ppmFrom + 0.05 && ppm > s.ppmTo - 0.05 ? Math.abs(ppm - s.ppm) * 0.3 : Math.abs(ppm - s.ppm);
          if (d < bd) { bd = d; best = s; }
        }
        if (best && bd < 0.1) { refMatched += nH * (1 - bd / 0.2); used.add(best); }
      }
      const obsMatched = [...used].reduce((a, s) => a + Math.max(s.nH || 1, 0.5), 0);
      const score = (refMatched / totRef) * Math.sqrt(obsMatched / totObs);
      if (score > 0.25) res.push({ compound: c, score, matched: used.size, of: c.h.length });
    } else {
      let m = 0;
      const used = new Set();
      for (const ppm of c.c) {
        const best = obs.reduce((b, s) => (Math.abs(s.ppm - ppm) < Math.abs((b ? b.ppm : 1e9) - ppm) ? s : b), null);
        if (best && Math.abs(best.ppm - ppm) < 1.2) { m++; used.add(best); }
      }
      const score = (m / c.c.length) * Math.sqrt(used.size / obs.length);
      if (score > 0.25) res.push({ compound: c, score, matched: m, of: c.c.length });
    }
  }
  return res.sort((a, b) => b.score - a.score).slice(0, 6);
}

export function suggest(spec, analysis, opts = {}) {
  const nucleus = /13C/.test(spec.nucleus) ? '13C' : '1H';
  const signals = analysis.multiplets;
  const { solvent, flags } = solventAndImpurities(signals, nucleus, spec.solvent);
  for (const s of signals) s.flag = flags.get(s) || null;
  // Integrals are normalised without solvent and water signals.
  if (nucleus === '1H') applyIntegralUnit(signals, opts.totalH);
  const counts = opts.formula ? opts.formula.counts : null;
  for (const s of signals) s.candidates = candidateGroups(s, nucleus, counts);
  return {
    nucleus, solvent,
    hints: fragmentHints(signals, nucleus),
    compounds: matchCompounds(signals, nucleus),
  };
}

// "1H NMR (400 MHz, CDCl3) δ 7.26 (d, J = 8.0 Hz, 2H), ..." in the usual journal style.
export function journalReport(spec, signals) {
  const nucleus = /13C/.test(spec.nucleus) ? '13C' : '1H';
  const solvent = findSolvent(spec.solvent);
  const head = `${nucleus === '13C' ? '¹³C' : '¹H'} NMR (${Math.round(spec.frequency || 0)} MHz, ${solvent ? solvent.id : spec.solvent || 'solvent'}) δ `;
  const list = signals.filter((s) => !s.minor && !(s.flag && s.flag.kind === 'solvent')).sort((a, b) => b.ppm - a.ppm);
  if (nucleus === '13C') return head + list.map((s) => s.ppm.toFixed(1)).join(', ') + '.';
  return head + list.map((s) => {
    const shift = s.multiplicity === 'm' ? `${s.ppmFrom.toFixed(2)} – ${s.ppmTo.toFixed(2)}` : s.ppm.toFixed(2);
    const J = s.J.length ? `, J = ${s.J.map((j) => j.toFixed(1)).join(', ')} Hz` : '';
    return `${shift} (${s.multiplicity}${J}, ${Math.max(1, Math.round(s.nH || 0))}H)`;
  }).join(', ') + '.';
}

const ATOMIC = { H: 1.008, C: 12.011, N: 14.007, O: 15.999, F: 18.998, P: 30.974, S: 32.06, Cl: 35.45, Br: 79.904, I: 126.904, Si: 28.085, B: 10.81, Na: 22.99, Li: 6.94, Se: 78.971, Sn: 118.71, D: 2.014 };

export function parseFormula(f) {
  const counts = {};
  const re = /([A-Z][a-z]?)(\d*)/g;
  let m;
  while ((m = re.exec(String(f).replace(/\s/g, '')))) {
    if (!m[1]) continue;
    counts[m[1]] = (counts[m[1]] || 0) + (m[2] ? parseInt(m[2], 10) : 1);
  }
  return counts;
}

export function formulaInfo(f) {
  const c = parseFormula(f);
  if (!Object.keys(c).length) return null;
  const X = (c.F || 0) + (c.Cl || 0) + (c.Br || 0) + (c.I || 0);
  const H = (c.H || 0) + (c.D || 0);
  const dbe = (c.C || 0) + (c.Si || 0) - (H + X) / 2 + ((c.N || 0) + (c.P || 0) + (c.B || 0)) / 2 + 1;
  let mw = 0;
  for (const [el, n] of Object.entries(c)) mw += (ATOMIC[el] || 0) * n;
  return { counts: c, dbe, mw, totalH: H };
}
