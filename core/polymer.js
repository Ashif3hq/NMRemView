// Polymer analysis from 1H integrals: degree of polymerisation and Mn by end-group analysis,
// copolymer composition, and diene microstructure. Shift windows are for CDCl3.
import { integrateRange } from './analysis.js';
import { formulaInfo } from './assign.js';

const mw = (f) => (formulaInfo(f) || { mw: 0 }).mw;

// Repeat units: the signal normally used to count units, and its protons per unit.
export const POLYMERS = [
  { id: 'pi', name: 'Polyisoprene', unit: 'C5H8', signal: { label: '=CH (1,4)', from: 5.25, to: 4.95, nH: 1 }, alt: { label: 'CH₃', from: 1.75, to: 1.5, nH: 3 }, micro: 'isoprene' },
  { id: 'pmy', name: 'Polymyrcene', unit: 'C10H16', signal: { label: '=CH (1,4: 2H), corrected for 3,4 and 1,2 units', from: 5.25, to: 4.95, nH: 2 }, micro: 'myrcene' },
  { id: 'pb', name: 'Polybutadiene', unit: 'C4H6', signal: { label: '=CH (1,4 + 1,2)', from: 5.65, to: 5.25, nH: 2 }, micro: 'butadiene' },
  { id: 'ps', name: 'Polystyrene', unit: 'C8H8', signal: { label: 'Ar–H', from: 7.4, to: 6.25, nH: 5 } },
  { id: 'pmma', name: 'Poly(methyl methacrylate)', unit: 'C5H8O2', signal: { label: 'OCH₃', from: 3.7, to: 3.5, nH: 3 } },
  { id: 'pnba', name: 'Poly(n-butyl acrylate)', unit: 'C7H12O2', signal: { label: 'OCH₂', from: 4.15, to: 3.9, nH: 2 } },
  { id: 'pvac', name: 'Poly(vinyl acetate)', unit: 'C4H6O2', signal: { label: 'CH–O', from: 5.0, to: 4.7, nH: 1 } },
  { id: 'peg', name: 'Poly(ethylene glycol)', unit: 'C2H4O', signal: { label: 'OCH₂CH₂O', from: 3.75, to: 3.5, nH: 4 } },
  { id: 'pla', name: 'Poly(lactic acid)', unit: 'C3H4O2', signal: { label: 'CH', from: 5.25, to: 5.08, nH: 1 } },
  { id: 'pcl', name: 'Poly(ε-caprolactone)', unit: 'C6H10O2', signal: { label: 'CH₂O', from: 4.12, to: 4.0, nH: 2 } },
  { id: 'pib', name: 'Polyisobutylene', unit: 'C4H8', signal: { label: 'C(CH₃)₂', from: 1.2, to: 1.0, nH: 6 } },
  { id: 'pdms', name: 'Poly(dimethylsiloxane)', unit: 'C2H6OSi', signal: { label: 'Si(CH₃)₂', from: 0.2, to: -0.05, nH: 6 } },
].map((p) => ({ ...p, m0: mw(p.unit) }));

// End groups: protons in the diagnostic signal and the mass the group adds to the chain.
export const END_GROUPS = [
  { id: 'sbu', name: 'sec-Butyl (s-BuLi initiator)', nH: 6, ppm: '0.8–0.9 (2 × CH₃)', mass: mw('C4H9') },
  { id: 'nbu', name: 'n-Butyl (n-BuLi initiator)', nH: 3, ppm: '0.85–0.92 (CH₃)', mass: mw('C4H9') },
  { id: 'tbu', name: 'tert-Butyl', nH: 9, ppm: '0.9–1.45 (C(CH₃)₃)', mass: mw('C4H9') },
  { id: 'ome', name: 'Methoxy (mPEG, methyl ester)', nH: 3, ppm: '3.3–3.4 (OCH₃)', mass: mw('CH3O') },
  { id: 'ch2oh', name: 'Hydroxymethyl –CH₂OH', nH: 2, ppm: '3.6–4.1 (CH₂OH)', mass: mw('CH3O') },
  { id: 'bn', name: 'Benzyl ester/ether (BnOH initiator)', nH: 2, ppm: '5.1 (OCH₂Ph)', mass: mw('C7H7O') },
  { id: 'ph', name: 'Phenyl (aromatic end)', nH: 5, ppm: '7.1–7.4 (Ar–H)', mass: mw('C6H5') },
  // RAFT agents: the chain carries the R group at one end and the Z group at the other, so the
  // end-group mass is that of the whole chain-transfer agent.
  { id: 'ddmat', name: 'RAFT: DDMAT (trithiocarbonate, S–CH₂)', nH: 2, ppm: '3.2–3.35 (S–CH₂C₁₁H₂₃)', mass: mw('C17H32O2S3') },
  { id: 'ddmat-me', name: 'RAFT: DDMAT (dodecyl CH₃)', nH: 3, ppm: '0.85–0.92 (CH₃)', mass: mw('C17H32O2S3') },
  { id: 'cdtpa', name: 'RAFT: CDTPA (trithiocarbonate, S–CH₂)', nH: 2, ppm: '3.2–3.35 (S–CH₂C₁₁H₂₃)', mass: mw('C19H33NO2S3') },
  { id: 'cpdb', name: 'RAFT: CPDB (dithiobenzoate, o-Ar–H)', nH: 2, ppm: '7.85–8.0 (o-Ar–H)', mass: mw('C11H11NS2') },
  { id: 'cpadb', name: 'RAFT: CPADB (dithiobenzoate, o-Ar–H)', nH: 2, ppm: '7.85–8.0 (o-Ar–H)', mass: mw('C13H13NO2S2') },
  { id: 'tms', name: 'Trimethylsilyl', nH: 9, ppm: '0.0–0.2 (Si(CH₃)₃)', mass: mw('C3H9Si') },
  { id: 'vinyl', name: 'Vinyl / methacrylate end (=CH₂)', nH: 2, ppm: '4.6–6.2 (=CH₂)', mass: mw('C2H3') },
  { id: 'cho', name: 'Aldehyde (–CHO)', nH: 1, ppm: '9.5–9.8 (CHO)', mass: mw('CHO') },
  { id: 'custom', name: 'Custom', nH: 1, ppm: '', mass: 0 },
];

// End-group analysis. repeat: { area, nH }, end: { area, nH, count }, where count is the
// number of identical end groups per chain contributing to that signal (usually 1).
export function degreeOfPolymerisation({ repeat, end, m0 = 0, endMass = 0 }) {
  if (!(repeat && end && repeat.area > 0 && end.area > 0 && repeat.nH > 0 && end.nH > 0)) return null;
  const perUnit = repeat.area / repeat.nH;
  const perChain = end.area / (end.nH * (end.count || 1));
  const dp = perUnit / perChain;
  const mn = m0 > 0 ? dp * m0 + (endMass || 0) : null;
  return { dp, mn, perUnit, perChain };
}

// Copolymer composition. components: [{ name, area, nH, m0 }] -> mole and weight fractions.
export function composition(components) {
  const rows = components.filter((c) => c.area > 0 && c.nH > 0).map((c) => ({ ...c, mol: c.area / c.nH }));
  const totMol = rows.reduce((a, c) => a + c.mol, 0);
  const totMass = rows.reduce((a, c) => a + c.mol * (c.m0 || 0), 0);
  return rows.map((c) => ({ ...c, molPct: (100 * c.mol) / totMol, wtPct: totMass > 0 ? (100 * c.mol * (c.m0 || 0)) / totMass : null }));
}

// Diene microstructure straight from the spectrum (fixed windows, CDCl3).
export function microstructure(spec, kind) {
  const A = (a, b) => Math.max(0, integrateRange(spec, a, b).area);
  if (kind === 'isoprene') {
    const u14 = A(5.25, 4.95) / 1;        // =CH of 1,4 units
    const u34 = A(4.8, 4.55) / 2;         // =CH2 of 3,4 units
    const u12 = A(5.9, 5.65) / 1;         // CH= of 1,2 units
    const tot = u14 + u34 + u12;
    if (!(tot > 0)) return null;
    const cis = A(1.75, 1.645), trans = A(1.645, 1.55);
    const r = [
      { label: '1,4-units', pct: (100 * u14) / tot, how: '=CH, δ 5.12 (1H)' },
      { label: '3,4-units', pct: (100 * u34) / tot, how: '=CH₂, δ 4.6–4.8 (2H)' },
      { label: '1,2-units', pct: (100 * u12) / tot, how: 'CH=, δ 5.7–5.9 (1H)' },
    ];
    const ct = cis + trans > 0 ? { cis: (100 * cis) / (cis + trans), trans: (100 * trans) / (cis + trans) } : null;
    return { rows: r, cisTrans: ct, note: 'cis/trans from the CH₃ signals (cis 1.68, trans 1.60 ppm); 3,4-unit CH₃ also falls near 1.6 ppm.' };
  }
  if (kind === 'myrcene') {
    const u34 = A(4.82, 4.6) / 2;         // =CH2 of 3,4 units
    const u12 = A(5.9, 5.55) / 1;         // CH= of 1,2 units
    const u14 = Math.max(0, (A(5.25, 4.95) - u34 - u12) / 2); // 5.1 ppm: 2H per 1,4 unit, 1H per 3,4 / 1,2 unit
    const tot = u14 + u34 + u12;
    if (!(tot > 0)) return null;
    return {
      rows: [
        { label: '1,4-units', pct: (100 * u14) / tot, how: '=CH, δ 5.1 (2H, backbone + side chain)' },
        { label: '3,4-units', pct: (100 * u34) / tot, how: '=CH₂, δ 4.7–4.8 (2H)' },
        { label: '1,2-units', pct: (100 * u12) / tot, how: 'CH=, δ 5.6–5.8 (1H)' },
      ],
      cisTrans: null,
      note: 'The 5.1 ppm signal holds both olefinic H of 1,4 units and the side-chain =CH of 3,4 and 1,2 units; this is corrected for. cis/trans 1,4 needs ¹³C.',
    };
  }
  if (kind === 'butadiene') {
    const vinylCH2 = A(5.08, 4.85) / 2;   // =CH2 of 1,2 units
    const olefin = A(5.65, 5.25);         // 1,4 =CH (2H) plus 1,2 CH= (1H)
    const u14 = Math.max(0, (olefin - vinylCH2) / 2);
    const tot = u14 + vinylCH2;
    if (!(tot > 0)) return null;
    return {
      rows: [
        { label: '1,4-units', pct: (100 * u14) / tot, how: '=CH, δ 5.3–5.5 (2H)' },
        { label: '1,2-units (vinyl)', pct: (100 * vinylCH2) / tot, how: '=CH₂, δ 4.9–5.0 (2H)' },
      ],
      cisTrans: null,
      note: 'cis/trans 1,4 cannot be separated reliably by ¹H; use ¹³C (cis 27.4, trans 32.7 ppm).',
    };
  }
  return null;
}

// Area of the polymer's counting window, for pre-filling the repeat-unit integral.
export function repeatArea(spec, polymer) {
  const A = (a, b) => Math.max(0, integrateRange(spec, a, b).area);
  if (polymer.micro === 'myrcene') {
    // Units N = (A5.1 + x34 + x12) / 2, returned as the area of 2H per unit.
    return A(5.25, 4.95) + A(4.82, 4.6) / 2 + A(5.9, 5.55);
  }
  return A(polymer.signal.from, polymer.signal.to);
}
