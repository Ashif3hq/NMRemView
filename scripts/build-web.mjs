// Builds dist/web: the web trial with the shared core copied next to it.
// index.html is a full page for self-hosting; artifact.html is the bare fragment.
import fs from 'fs';
import path from 'path';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const out = path.join(root, 'dist/web');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, 'core'), { recursive: true });
fs.mkdirSync(path.join(out, 'samples'), { recursive: true });
for (const f of fs.readdirSync(path.join(root, 'core'))) fs.copyFileSync(path.join(root, 'core', f), path.join(out, 'core', f));
for (const f of fs.readdirSync(path.join(root, 'web/samples'))) {
  const src = path.join(root, 'web/samples', f);
  if (f.endsWith('.zip')) fs.writeFileSync(path.join(out, 'samples', f + '.b64.txt'), fs.readFileSync(src).toString('base64'));
  else fs.copyFileSync(src, path.join(out, 'samples', f));
}
for (const f of ['app.js', 'viewer.js']) fs.copyFileSync(path.join(root, 'web', f), path.join(out, f));
const frag = fs.readFileSync(path.join(root, 'web/index.html'), 'utf8');
fs.writeFileSync(path.join(out, 'artifact.html'), frag);
fs.writeFileSync(path.join(out, 'index.html'), `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n<style>body{margin:0}[hidden]{display:none!important}</style>\n</head>\n<body>\n${frag}\n</body>\n</html>\n`);
console.log('built', out);
