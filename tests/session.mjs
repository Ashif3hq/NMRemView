import fs from 'fs';
import * as N from '../core/index.js';
const f = process.argv[2];
const { datasets } = await N.loadFiles(new Map([[f.split('/').pop(), new Uint8Array(fs.readFileSync(f))]]));
const s = N.createSession(datasets[0]);
let t=Date.now(); let r = s.run(); console.log('first', Date.now()-t, r.report);
t=Date.now(); r = s.set({ ph0: r.params.ph0+1 }); console.log('rephase', Date.now()-t);
r = s.set({ formula: 'C13H18O2', manualRegions: [[7.3,7.05]] }); console.log(r.report, r.formula);
