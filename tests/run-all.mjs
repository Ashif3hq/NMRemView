// Regression checks against the bundled example spectra.
import fs from 'fs';
import * as N from '../core/index.js';

const cases = [
  { file: 'web/samples/ibuprofen-1h.zip', expect: { compound: 'Ibuprofen', report: ['7.25 (d', '0.92 (d, J = 6.6 Hz, 6H)', '1.52 (d, J = 7.2 Hz, 3H)'] } },
  { file: 'web/samples/ibuprofen-13c.zip', expect: { compound: 'Ibuprofen', report: ['180.8', '45.1', '18.1'] } },
  { file: 'web/samples/aspirin-1h.zip', expect: { compound: 'Aspirin (acetylsalicylic acid)', report: ['2.29 (s'] } },
  { file: 'web/samples/strychnine-1h.zip', expect: { compound: 'Strychnine' } },
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
process.exit(fail ? 1 : 0);
