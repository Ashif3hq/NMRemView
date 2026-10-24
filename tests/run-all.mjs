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
// Private documents (not in git): every .mnova in tests/private must yield spectra.
const priv = new URL('./private/', import.meta.url);
if (fs.existsSync(priv)) for (const f of fs.readdirSync(priv).filter((x) => /\.mnova$/i.test(x))) {
  const { datasets } = await N.loadFiles(new Map([[f, new Uint8Array(fs.readFileSync(new URL(f, priv)))]]));
  const ok = datasets.length > 0 && datasets.every((d) => N.createSession(d).run().report.length > 20);
  console.log(ok ? 'ok  ' : 'FAIL', `tests/private/${f}`, `${datasets.length} spectra`);
  if (!ok) fail++;
}
process.exit(fail ? 1 : 0);
