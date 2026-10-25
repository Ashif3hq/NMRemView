// Regression checks against the bundled example spectra.
import fs from 'fs';
import * as N from '../core/index.js';

const cases = [
  { file: 'web/samples/ibuprofen-1h.zip', expect: { compound: 'Ibuprofen', report: ['7.25 (d', '0.92 (d, J = 6.6 Hz, 6H)', '1.52 (d, J = 7.2 Hz, 3H)'] } },
  { file: 'web/samples/ibuprofen-13c.zip', expect: { compound: 'Ibuprofen', report: ['180.8', '45.1', '18.1'] } },
  { file: 'web/samples/aspirin-1h.zip', expect: { compound: 'Aspirin (acetylsalicylic acid)', report: ['2.29 (s'] } },
  { file: 'web/samples/strychnine-1h.zip', expect: { compound: 'Strychnine' } },
  { file: 'web/samples/rutin-13c.jdf', expect: { compound: 'Rutin (DMSO-d₆)', report: ['177.4', '17.7'] } },
  { file: 'web/samples/cytisine-1h.jdx', expect: { compound: 'Cytisine' } },
];
let fail = 0;
for (const c of cases) {
  const { datasets } = await N.loadFiles(new Map([[c.file.split('/').pop(), new Uint8Array(fs.readFileSync(c.file))]]));
  const r = N.createSession(datasets[0]).run();
  const top = r.suggestions.compounds[0]?.compound.name;
  const problems = [];
  if (c.expect.compound && top !== c.expect.compound) problems.push(`top match ${top}`);
  for (const s of c.expect.report || []) if (!r.report.includes(s)) problems.push(`report lacks "${s}"`);
  console.log(problems.length ? 'FAIL' : 'ok  ', c.file, problems.join('; '));
  if (problems.length) fail++;
}
// Polymer maths: 50 units of 1H each against a 6H end group.
{
  const dp = N.degreeOfPolymerisation({ repeat: { area: 50, nH: 1 }, end: { area: 6, nH: 6 }, m0: 68.12, endMass: 57.12 });
  const c = N.composition([{ name: 'A', area: 2, nH: 1, m0: 100 }, { name: 'B', area: 2, nH: 2, m0: 50 }]);
  const ok = Math.abs(dp.dp - 50) < 1e-9 && Math.abs(dp.mn - (50 * 68.12 + 57.12)) < 1e-6 && Math.abs(c[0].molPct - 66.667) < 0.01 && Math.abs(c[0].wtPct - 80) < 0.01;
  console.log(ok ? 'ok  ' : 'FAIL', 'polymer DP / composition maths');
  if (!ok) fail++;
}
// Manual peak picking: a removed peak stays gone, an added one snaps to a maximum and survives re-referencing.
{
  const { datasets } = await N.loadFiles(new Map([['aspirin-1h.zip', new Uint8Array(fs.readFileSync('web/samples/aspirin-1h.zip'))]]));
  const s = N.createSession(datasets[0]);
  const r0 = s.run();
  const victim = r0.analysis.peaks[0];
  const snapped = N.snapToPeak(r0.spectrum, 5.0);
  s.params.peakEdits = { add: [snapped - s.params.referenceShift], remove: [victim.ppm - s.params.referenceShift] };
  const r1 = s.run();
  const gone = !r1.analysis.peaks.some((p) => Math.abs(p.ppm - victim.ppm) < 1e-4);
  const added = r1.analysis.peaks.some((p) => p.manual && Math.abs(p.ppm - snapped) < 1e-3);
  s.params.referenceShift += 0.1;
  const r2 = s.run();
  const moved = r2.analysis.peaks.some((p) => p.manual && Math.abs(p.ppm - (snapped + 0.1)) < 2e-3);
  const ok = gone && added && moved;
  console.log(ok ? 'ok  ' : 'FAIL', 'manual peak add / remove', ok ? '' : JSON.stringify({ gone, added, moved }));
  if (!ok) fail++;
}
// Exports read back through our own readers give the same peaks.
{
  const { datasets } = await N.loadFiles(new Map([['ibuprofen-1h.zip', new Uint8Array(fs.readFileSync('web/samples/ibuprofen-1h.zip'))]]));
  const r = N.createSession(datasets[0]).run();
  const top = (x) => x.analysis.peaks.slice(0, 8).map((p) => p.ppm.toFixed(3)).join(' ');
  const bad = [];
  for (const [id, name] of [['jcamp', 'x.jdx'], ['nmrml', 'x.nmrML'], ['xy-csv', 'x.csv'], ['xy-tsv', 'x.txt']]) {
    const back = await N.loadFiles(new Map([[name, new TextEncoder().encode(N.exportAs(r, id))]]));
    if (!back.datasets.length || top(N.createSession(back.datasets[0]).run()) !== top(r)) bad.push(id);
  }
  const svg = N.plotSVG(r);
  if (!svg.startsWith('<?xml') || !svg.includes('<polyline')) bad.push('svg');
  for (const e of N.EXPORTS) if (!N.exportAs(r, e.id).length) bad.push(e.id);
  console.log(bad.length ? 'FAIL' : 'ok  ', 'exports round-trip', bad.join(' '));
  if (bad.length) fail++;
}
// Private documents (not in git): every .mnova in tests/private must yield spectra.
const priv = new URL('./private/', import.meta.url);
if (fs.existsSync(priv)) for (const f of fs.readdirSync(priv).filter((x) => /\.mnova$/i.test(x))) {
  const { datasets } = await N.loadFiles(new Map([[f, new Uint8Array(fs.readFileSync(new URL(f, priv)))]]));
  const ok = datasets.length > 0 && datasets.every((d) => N.createSession(d).run().report.length > 20);
  console.log(ok ? 'ok  ' : 'FAIL', `tests/private/${f}`, `${datasets.length} spectra`);
  if (!ok) fail++;
}
process.exit(fail ? 1 : 0);
