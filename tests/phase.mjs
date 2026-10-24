import fs from 'fs';
import { loadFiles } from '../core/loader.js';
import { processDataset } from '../core/processing.js';
const f = process.argv[2];
const { datasets } = await loadFiles(new Map([[f.split('/').pop(), new Uint8Array(fs.readFileSync(f))]]));
for (const ds of datasets) {
  if (!ds.fid) continue;
  const t0=Date.now();
  const p = processDataset(ds, { fromFid: true });
  const r = p.real; let neg=0,pos=0; for (const v of r){ if(v<0)neg+=-v; else pos+=v; }
  console.log(ds.name, 'ph0', p.processingUsed.ph0.toFixed(1), 'ph1', p.processingUsed.ph1.toFixed(1), 'neg/pos', (neg/pos).toFixed(3), Date.now()-t0,'ms', 'bruker', ds.processing);
}
