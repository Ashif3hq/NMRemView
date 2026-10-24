import fs from 'fs';
import { loadFiles } from '../core/loader.js';
import { transformFid } from '../core/processing.js';
const f = process.argv[2];
const { datasets, warnings } = await loadFiles(new Map([[f.split('/').pop(), new Uint8Array(fs.readFileSync(f))]]));
console.log(warnings);
for (const ds of datasets) {
  console.log(ds.name, ds.nucleus, ds.frequency, ds.solvent, !!ds.fid, !!ds.rawReal, ds.fid && {sw:ds.fid.sw, c:ds.fid.centerPpm, g:ds.fid.grpdly, n:ds.fid.re.length});
  const top = (re, im, s, e) => { const n=re.length; const m=[...re].map((v,i)=>[im?Math.hypot(v,im[i]):v,i]).sort((a,b)=>b[0]-a[0]);
    const out=[]; for (const [v,i] of m){ const p=s+(e-s)*i/(n-1); if(out.every(q=>Math.abs(q-p)>0.05)) out.push(p); if(out.length>=6)break;} return out.map(p=>p.toFixed(3)).join(' ');};
  if (ds.rawReal) console.log(' 1r :', top(ds.rawReal, null, ds.rawPpmStart, ds.rawPpmEnd), ds.rawPpmStart, ds.rawPpmEnd);
  if (ds.fid) { const t = transformFid(ds.fid, ds.frequency, {lb:0.3, zf:2, maxPoints:65536}); console.log(' fid:', top(t.real,t.imag,t.ppmStart,t.ppmEnd), t.ppmStart, t.ppmEnd); }
}
