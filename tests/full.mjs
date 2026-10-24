import fs from 'fs';
import * as N from '../core/index.js';
const f = process.argv[2]; const fromFid = process.argv[3]==='fid';
const { datasets, warnings } = await N.loadFiles(new Map([[f.split('/').pop(), new Uint8Array(fs.readFileSync(f))]]));
if (warnings.length) console.log(warnings);
for (const ds of datasets) {
  const t=Date.now();
  const p = N.processDataset(ds, { fromFid });
  const a = N.analyse(p); const s = N.suggest(p, a);
  console.log(`== ${ds.name} ${p.nucleus} ${p.frequency?.toFixed(1)} MHz ${p.solvent} [${p.ppmStart.toFixed(1)}..${p.ppmEnd.toFixed(1)}] ${Date.now()-t}ms`);
  console.log(N.journalReport(p, a.multiplets));
  for (const m of a.multiplets.filter(m=>!m.minor).slice(0,25)) console.log('  ', m.ppm.toFixed(2), m.multiplicity, (m.nH??0).toFixed(1), m.flag?.label||'', '|', m.candidates.slice(0,2).map(c=>c.group.name).join(' / '));
  console.log(' hints:', s.hints.map(h=>h.text));
  console.log(' compounds:', s.compounds.map(c=>c.compound.name+' '+c.score.toFixed(2)));
}
