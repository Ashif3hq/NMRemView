import fs from 'fs';
import { loadFiles } from '../core/loader.js';
import { processDataset } from '../core/processing.js';
import { analyse } from '../core/analysis.js';
const f = process.argv[2]; const fromFid = process.argv[3]==='fid';
const { datasets } = await loadFiles(new Map([[f.split('/').pop(), new Uint8Array(fs.readFileSync(f))]]));
for (const ds of datasets) {
  const p = processDataset(ds, { fromFid });
  const t=Date.now(); const a = analyse(p);
  console.log(ds.name, ds.nucleus, ds.solvent, 'peaks', a.peaks.length, 'ms', Date.now()-t);
  for (const m of a.multiplets) console.log('  ', m.ppm.toFixed(3), m.multiplicity, m.J.join(','), (m.nH??0).toFixed(2), m.lines.length, `[${m.ppmFrom.toFixed(2)}-${m.ppmTo.toFixed(2)}]`);
}
