// Bundles the shared core + bridge into one classic script for JavaScriptCore:
// macos/NMRemView/Sources/NMRemView/Resources/nmrcore.js
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const out = path.join(root, 'macos/NMRemView/Sources/NMRemView/Resources/nmrcore.js');
fs.mkdirSync(path.dirname(out), { recursive: true });
const tmp = path.join(root, 'dist/bridge.tmp.js');
fs.mkdirSync(path.dirname(tmp), { recursive: true });
execFileSync('npx', ['--yes', 'esbuild@0.24.0', path.join(root, 'macos/bridge/bridge.js'), '--bundle', '--format=iife', '--target=es2020', '--outfile=' + tmp], { stdio: 'inherit' });
fs.writeFileSync(out, fs.readFileSync(path.join(root, 'macos/bridge/polyfills.js'), 'utf8') + '\n' + fs.readFileSync(tmp, 'utf8'));
fs.rmSync(tmp);
console.log('wrote', out);
