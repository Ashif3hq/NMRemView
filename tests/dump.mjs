import fs from 'fs';
import { loadFiles } from '../core/loader.js';
import { processDataset, estimateNoise, ppmAxis } from '../core/processing.js';
const [f, mode, a, b] = process.argv.slice(2);
const { datasets } = await loadFiles(new Map([[f.split('/').pop(), new Uint8Array(fs.readFileSync(f))]]));
const p = processDataset(datasets[0], { fromFid: mode==='fid' });
const ax = ppmAxis(p); const s = estimateNoise(p.real); let mx=0; for(const v of p.real) mx=Math.max(mx,v);
console.log('noise', s.toExponential(2), 'max', mx.toExponential(2), 'n', p.real.length);
for (let ppm=+a; ppm>=+b; ppm-= (a-b)/40) { const i=Math.round(ax.index(ppm)); let lo=Infinity; for(let k=i;k<i+Math.abs((a-b)/40/ax.step);k++) lo=Math.min(lo,p.real[k]); console.log(ppm.toFixed(2), (lo/s).toFixed(1)); }
