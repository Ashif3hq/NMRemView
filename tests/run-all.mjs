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
// Overlay / stack: layout maths and the stacked SVG figure.
{
  const bad = [];
  const lay = N.stackLayout(3, 300, 'stack', 1);
  if (Math.abs(lay.step - 100) > 1e-9 || Math.abs(lay.height - 100) > 1e-9 || lay.offsets.join() !== '0,100,200') bad.push('stack gap 1');
  const ov = N.stackLayout(3, 300, 'overlay', 0.6);
  if (ov.height !== 300 || ov.offsets.some((o) => o !== 0)) bad.push('overlay');
  const res = [];
  for (const f of ['ibuprofen-1h.zip', 'aspirin-1h.zip']) {
    const { datasets } = await N.loadFiles(new Map([[f, new Uint8Array(fs.readFileSync('web/samples/' + f))]]));
    res.push(N.createSession(datasets[0]).run());
  }
  const sc = N.traceScales(res, 10, 0, 'common');
  if (sc[0] !== sc[1]) bad.push('common scale');
  for (const mode of ['stack', 'overlay']) {
    const svg = N.stackSVG(res, { mode, names: ['Ibuprofen', 'Aspirin & co'] });
    if ((svg.match(/<polyline/g) || []).length !== 2 || !svg.includes('Aspirin &amp; co')) bad.push('svg ' + mode);
  }
  console.log(bad.length ? 'FAIL' : 'ok  ', 'overlay / stack', bad.join('; '));
  if (bad.length) fail++;
}
// Project files: save edits, reopen, get the same spectrum back (web zips are stored expanded).
{
  const bad = [];
  const files = await N.expandFiles(new Map([['aspirin-1h.zip', new Uint8Array(fs.readFileSync('web/samples/aspirin-1h.zip'))]]));
  const { datasets } = N.loadExpanded(files);
  const s = N.createSession(datasets[0]);
  const r0 = s.run();
  s.params.manualRegions = [[5.2, 4.8]];
  s.params.referenceShift += 0.05;
  s.params.annotations = [{ ppm: 2.3, text: 'OAc', kind: 'label' }];
  const r1 = s.run();
  const text = N.buildProject([N.encodeSource(files)], [{ source: 0, index: 0, name: datasets[0].name, title: 'My aspirin', params: s.params, cmp: true, color: 3 }],
    { current: 0, compare: { mode: 'stack', gap: 0.4, scale: 'each' } });
  const back = N.openProject(text);
  const r2 = back.entries[0] && back.entries[0].session.run();
  if (!r2) bad.push('no entry');
  else {
    if (r2.report !== r1.report) bad.push('report differs');
    if (r2.spectrum.title !== 'My aspirin') bad.push('title');
    if (r2.params.annotations[0]?.text !== 'OAc') bad.push('label');
    if (Math.abs(r2.params.ph0 - r0.params.ph0) > 1e-9) bad.push('phase');
  }
  if (back.view.compare.mode !== 'stack' || back.entries[0]?.item.color !== 3) bad.push('view');
  if (!N.isProject('x.nmrview') || !N.isProject('x', new TextEncoder().encode(text))) bad.push('detect');
  try { N.openProject('{"format":"other"}'); bad.push('accepted junk'); } catch (e) { /* expected */ }
  console.log(bad.length ? 'FAIL' : 'ok  ', 'project save / reopen', bad.join('; '));
  if (bad.length) fail++;
}
// SI: ACS data string (plain and HTML) and the SI page.
{
  const bad = [];
  const one = async (f) => N.createSession((await N.loadFiles(new Map([[f, new Uint8Array(fs.readFileSync('web/samples/' + f))]]))).datasets[0]).run();
  const h = await one('ibuprofen-1h.zip'), c = await one('ibuprofen-13c.zip');
  if (!N.acsDataString(h).startsWith('¹H NMR (600 MHz, CDCl₃) δ ')) bad.push('1H head ' + N.acsDataString(h).slice(0, 40));
  if (!N.acsDataString(c).startsWith('¹³C{¹H} NMR (151 MHz, CDCl₃) δ ')) bad.push('13C head');
  const html = N.acsDataString(h, { html: true });
  if (!html.includes('<i>J</i> = 6.6 Hz') || !html.includes('CDCl<sub>3</sub>')) bad.push('html');
  const page = N.siPage([{ result: h, name: 'Ibuprofen (1)' }, { result: c }]);
  if ((page.match(/<section>/g) || []).length !== 2 || !page.includes('Figure S2') || !page.includes('<svg') || page.includes('<?xml')) bad.push('page');
  console.log(bad.length ? 'FAIL' : 'ok  ', 'SI export', bad.join('; '));
  if (bad.length) fail++;
}
// Batch: one spectrum's Polymer set-up applied to a series gives a DP row per spectrum.
{
  const bad = [];
  const ld = async (f) => (await N.loadFiles(new Map([[f, new Uint8Array(fs.readFileSync('web/samples/' + f))]]))).datasets[0];
  const ibu = await ld('ibuprofen-1h.zip');
  const r = N.createSession(ibu).run();
  const at = (x) => r.analysis.multiplets.filter((m) => !m.flag).find((m) => Math.abs(m.ppm - x) < 0.02).ppm;
  // Aromatic doublet (2H) as "repeat unit", isobutyl CH3 doublet (6H) as "end group": DP = 1.
  const t = N.templateFromPolymer(r, { polymer: 'custom', repeatSig: at(7.25), repeatH: 2, m0: 100, end: 'custom', endSig: at(0.92).toFixed(4), endH: 6, endCount: 1, endMass: 6, comps: [] });
  const res = N.runBatch([ibu, await ld('ibuprofen-13c.zip'), await ld('aspirin-1h.zip'), await ld('ibuprofen-1h.zip')], t);
  const [a, c, asp, b] = res.rows;
  if (!a.ok || Math.abs(a.dp - 1) > 0.1 || Math.abs(a.mn - (a.dp * 100 + 6)) > 1e-6) bad.push('dp ' + a.dp);
  if (c.ok || !/Skipped/.test(c.note)) bad.push('13C not skipped');
  if (asp.ok || !/No end-group peak/.test(asp.note)) bad.push('empty window not flagged');
  if (!b.ok || Math.abs(b.dp - a.dp) > 1e-9 || !res.stats || res.stats.dp.n !== 2) bad.push('stats');
  const csv = N.batchTable(res, ',');
  if (!csv.startsWith('Spectrum,') || !/Mean \(n = 2\)/.test(csv)) bad.push('csv');
  if (N.templateProblem(N.templateFromPolymer(r, { polymer: 'custom', repeatSig: '', end: 'custom', endSig: '' })) === '') bad.push('problem');
  console.log(bad.length ? 'FAIL' : 'ok  ', 'batch table', bad.join('; '));
  if (bad.length) fail++;
}
// Partial Bruker selections: a pdata folder alone loads its processed spectrum; a lone fid or
// parameter file gives one clear hint, never "No 1D NMR data found in JCAMP file".
{
  const all = await N.unzip(new Uint8Array(fs.readFileSync('web/samples/strychnine-1h.zip')));
  const pick = (prefix, strip) => new Map([...all].filter(([p]) => p.startsWith(prefix)).map(([p, d]) => [p.slice(strip.length), d]));
  const bad = [];
  for (const [label, files] of [['pdata', pick('strychnine/10/pdata/', 'strychnine/10/')], ['pdata/1', pick('strychnine/10/pdata/1/', 'strychnine/10/pdata/')]]) {
    const r = N.loadExpanded(files);
    if (r.datasets.length !== 1 || r.warnings.length || !/^Strychnine/.test(N.createSession(r.datasets[0]).run().suggestions.compounds[0]?.compound.name || '')) bad.push(label);
  }
  for (const label of ['fid', 'pdata/1/proc', 'acqu']) {
    const r = N.loadExpanded(pick('strychnine/10/' + label, 'strychnine/10/' + label.replace(/[^/]*$/, '')));
    if (r.datasets.length || r.warnings.length !== 1 || /JCAMP/.test(r.warnings[0]) || !/experiment folder/.test(r.warnings[0])) bad.push(label + ' ' + r.warnings.join('|'));
  }
  console.log(bad.length ? 'FAIL' : 'ok  ', 'partial Bruker folders', bad.join('; '));
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
