const { chromium } = require('playwright');
(async () => { const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
const errs=[]; p.on('pageerror', e => errs.push(String(e)));
await p.goto('http://localhost:8765/'); await p.waitForTimeout(2000);
await p.click('text=Rutin'); await p.waitForTimeout(2500);
console.log(await p.textContent('#report'), errs);
await p.screenshot({ path: '/tmp/claude-0/rutin.png' }); await b.close(); })();
