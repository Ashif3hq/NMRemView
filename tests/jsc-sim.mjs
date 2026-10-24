// Runs the macOS bundle in a bare V8 context (no web APIs), as JavaScriptCore would.
import vm from 'vm'; import fs from 'fs'; import path from 'path';
const ctx = vm.createContext({});
vm.runInContext(fs.readFileSync('macos/NMRemView/Sources/NMRemView/Resources/nmrcore.js', 'utf8'), ctx);
const dir = process.argv[2]; const files = {};
const walk = (d, pre='') => { for (const f of fs.readdirSync(d)) { const p = path.join(d,f); if (fs.statSync(p).isDirectory()) walk(p, pre+f+'/'); else files[pre+f] = fs.readFileSync(p).toString('base64'); } };
walk(dir);
const opened = JSON.parse(ctx.NMRBridge.open(JSON.stringify(files)));
console.log(opened.datasets, opened.warnings);
const r = JSON.parse(ctx.NMRBridge.run(opened.datasets[0].id, '{}', 2048));
console.log(r.report, r.y.length, r.hints.map(h=>h.text), r.compounds[0]);
console.log(JSON.parse(ctx.NMRBridge.search('Cl')).groups.length);
