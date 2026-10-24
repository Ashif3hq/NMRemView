import fs from 'fs';
import { loadFiles } from '../core/loader.js';
import { processDataset, estimateNoise } from '../core/processing.js';
const f = process.argv[2];
const { datasets } = await loadFiles(new Map([[f.split('/').pop(), new Uint8Array(fs.readFileSync(f))]]));
for (const ds of datasets) {
  console.log(ds.name, ds.processing, ds.fid && ds.fid.grpdly);
  for (const fromFid of [true,false]) { if(!fromFid && !ds.rawReal) continue; if(fromFid&&!ds.fid) continue;
  const p = processDataset(ds, { fromFid });
  const r = p.real; const s=estimateNoise(r); let neg=0,pos=0; let mx=0; for (const v of r) mx=Math.max(mx,v); for (const v of r){ if(Math.abs(v)>15*s){ if(v<0)neg+=-v; else pos+=v; }}
  const peaks=[]; for(let i=1;i<r.length-1;i++) if(r[i]>r[i-1]&&r[i]>=r[i+1]&&r[i]>20*s) peaks.push(p.ppmStart+(p.ppmEnd-p.ppmStart)*i/(r.length-1));
  console.log(fromFid?'fid':'proc', 'ph', p.processingUsed.ph0.toFixed(1), p.processingUsed.ph1.toFixed(1), 'neg/pos(signal)', (neg/pos).toFixed(3), 'S/N', (mx/s).toFixed(0), 'peaks', peaks.length, peaks.slice(0,25).map(x=>x.toFixed(1)).join(' '));
  }
}
